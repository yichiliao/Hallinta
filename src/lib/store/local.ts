import { promises as fs } from "node:fs";
import path from "node:path";
import { parseAccessMap, type AccessMap } from "@/lib/auth/permissions";
import { DOCUMENTS, DOCUMENT_TEMPLATES, isDocumentId, type DocumentId } from "@/lib/documents";
import {
  StoreError,
  type MeetingSummary,
  type NewProject,
  type Project,
  type ProjectStore,
  type ProjectSummary,
} from "./types";

const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MEETING_ID_RE = /^\d{4}-\d{2}-\d{2}(-\d+)?$/;
/** Subfolder of the root holding archived projects; reserved as a project id. */
const ARCHIVE_DIR = "archive";

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Write via a temp file + rename so readers never see a half-written file. */
async function writeAtomic(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}

function meetingTitle(content: string): string {
  return /^#\s+(.+?)\s*$/m.exec(content)?.[1] ?? "Meeting";
}

function assertDocumentId(documentId: string): asserts documentId is DocumentId {
  if (!isDocumentId(documentId)) {
    throw new StoreError("invalid", `Unknown document "${documentId}".`);
  }
}

function meetingFile(dir: string, meetingId: string): string {
  if (!MEETING_ID_RE.test(meetingId)) {
    throw new StoreError("invalid", `Invalid meeting id "${meetingId}".`);
  }
  return path.join(dir, "meetings", `${meetingId}.md`);
}

interface Location {
  dir: string;
  archived: boolean;
}

/**
 * Filesystem-backed store. Layout:
 *   <root>/<projectId>/project.json            (active)
 *   <root>/archive/<projectId>/project.json    (archived)
 *   .../<projectId>/<documentId>.md
 *   .../<projectId>/meetings/<meetingId>.md
 * Project ids are unique across both locations.
 */
export class LocalProjectStore implements ProjectStore {
  constructor(private readonly root: string) {}

  private assertProjectId(projectId: string): void {
    if (!PROJECT_ID_RE.test(projectId) || projectId === ARCHIVE_DIR) {
      throw new StoreError("invalid", `Invalid project id "${projectId}".`);
    }
  }

  private candidates(projectId: string): Location[] {
    this.assertProjectId(projectId);
    return [
      { dir: path.join(this.root, projectId), archived: false },
      { dir: path.join(this.root, ARCHIVE_DIR, projectId), archived: true },
    ];
  }

  private async locate(projectId: string): Promise<Location> {
    for (const loc of this.candidates(projectId)) {
      if (await exists(path.join(loc.dir, "project.json"))) return loc;
    }
    throw new StoreError("not_found", `Project "${projectId}" not found.`);
  }

  private async readSummary(projectId: string, loc: Location): Promise<ProjectSummary> {
    const raw = await fs.readFile(path.join(loc.dir, "project.json"), "utf8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    return {
      id: projectId,
      name: typeof json.name === "string" ? json.name : projectId,
      members: Array.isArray(json.members)
        ? json.members.filter((m): m is string => typeof m === "string")
        : [],
      created: typeof json.created === "string" ? json.created : "",
      archived: loc.archived,
      access: parseAccessMap(json.access),
    };
  }

  private async readDocumentAt(loc: Location, documentId: DocumentId): Promise<string> {
    try {
      return await fs.readFile(path.join(loc.dir, `${documentId}.md`), "utf8");
    } catch (error) {
      if (isErrno(error, "ENOENT")) return "";
      throw error;
    }
  }

  private async listIn(parent: string, archived: boolean): Promise<ProjectSummary[]> {
    let entries;
    try {
      entries = await fs.readdir(parent, { withFileTypes: true });
    } catch (error) {
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }
    const summaries = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && PROJECT_ID_RE.test(e.name) && e.name !== ARCHIVE_DIR)
        .map((e) =>
          this.readSummary(e.name, { dir: path.join(parent, e.name), archived }).catch(() => null),
        ),
    );
    return summaries.filter((s): s is ProjectSummary => s !== null);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const [active, archived] = await Promise.all([
      this.listIn(this.root, false),
      this.listIn(path.join(this.root, ARCHIVE_DIR), true),
    ]);
    const activeIds = new Set(active.map((p) => p.id));
    return [...active, ...archived.filter((p) => !activeIds.has(p.id))].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async getProject(projectId: string): Promise<Project> {
    const loc = await this.locate(projectId);
    const [summary, contents, meetings] = await Promise.all([
      this.readSummary(projectId, loc),
      Promise.all(DOCUMENTS.map((d) => this.readDocumentAt(loc, d.id))),
      this.listMeetingsAt(loc),
    ]);
    const documents = Object.fromEntries(
      DOCUMENTS.map((d, i) => [d.id, contents[i]]),
    ) as Record<DocumentId, string>;
    return { ...summary, documents, meetings };
  }

  async getProjectSummary(projectId: string): Promise<ProjectSummary> {
    return this.readSummary(projectId, await this.locate(projectId));
  }

  async createProject(project: NewProject): Promise<void> {
    const [active, archived] = this.candidates(project.id);
    if (await exists(archived.dir)) {
      throw new StoreError("exists", `An archived project with id "${project.id}" already exists.`);
    }
    const dir = active.dir;
    await fs.mkdir(this.root, { recursive: true });
    try {
      await fs.mkdir(dir, { recursive: false });
    } catch (error) {
      if (isErrno(error, "EEXIST")) {
        throw new StoreError("exists", `A project with id "${project.id}" already exists.`);
      }
      throw error;
    }
    const meta = {
      id: project.id,
      name: project.name,
      members: project.members,
      created: project.created,
    };
    await writeAtomic(path.join(dir, "project.json"), JSON.stringify(meta, null, 2) + "\n");
    await Promise.all(
      DOCUMENTS.map((d) =>
        writeAtomic(path.join(dir, `${d.id}.md`), DOCUMENT_TEMPLATES[d.id] ?? ""),
      ),
    );
    await fs.mkdir(path.join(dir, "meetings"), { recursive: true });
  }

  /** Merge fields into project.json, preserving everything else. The id never changes. */
  private async patchMeta(projectId: string, patch: Record<string, unknown>): Promise<void> {
    const loc = await this.locate(projectId);
    const file = path.join(loc.dir, "project.json");
    const json = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    await writeAtomic(file, JSON.stringify({ ...json, ...patch }, null, 2) + "\n");
  }

  updateProject(projectId: string, details: { name: string; members: string[] }): Promise<void> {
    return this.patchMeta(projectId, { name: details.name, members: details.members });
  }

  setProjectAccess(projectId: string, access: AccessMap): Promise<void> {
    return this.patchMeta(projectId, { access: parseAccessMap(access) });
  }

  updateMembership(projectId: string, m: { name: string; members: string[]; access: AccessMap }): Promise<void> {
    return this.patchMeta(projectId, { name: m.name, members: m.members, access: parseAccessMap(m.access) });
  }

  private async move(projectId: string, toArchived: boolean): Promise<void> {
    const loc = await this.locate(projectId);
    if (loc.archived === toArchived) {
      throw new StoreError("invalid", `Project "${projectId}" is already ${toArchived ? "archived" : "active"}.`);
    }
    const target = this.candidates(projectId).find((c) => c.archived === toArchived)!;
    if (await exists(target.dir)) {
      throw new StoreError("exists", `${target.dir} already exists.`);
    }
    await fs.mkdir(path.dirname(target.dir), { recursive: true });
    await fs.rename(loc.dir, target.dir);
  }

  archiveProject(projectId: string): Promise<void> {
    return this.move(projectId, true);
  }

  unarchiveProject(projectId: string): Promise<void> {
    return this.move(projectId, false);
  }

  async readDocument(projectId: string, documentId: string): Promise<string> {
    assertDocumentId(documentId);
    return this.readDocumentAt(await this.locate(projectId), documentId);
  }

  async writeDocument(projectId: string, documentId: string, content: string): Promise<void> {
    assertDocumentId(documentId);
    const loc = await this.locate(projectId);
    await writeAtomic(path.join(loc.dir, `${documentId}.md`), content);
  }

  private async listMeetingsAt(loc: Location): Promise<MeetingSummary[]> {
    const dir = path.join(loc.dir, "meetings");
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error) {
      if (isErrno(error, "ENOENT")) return [];
      throw error;
    }
    const ids = names
      .filter((n) => n.endsWith(".md"))
      .map((n) => n.slice(0, -3))
      .filter((id) => MEETING_ID_RE.test(id));
    const meetings = await Promise.all(
      ids.map(async (id) => ({
        id,
        date: id.slice(0, 10),
        title: meetingTitle(await fs.readFile(path.join(dir, `${id}.md`), "utf8")),
      })),
    );
    return meetings.sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
  }

  async listMeetings(projectId: string): Promise<MeetingSummary[]> {
    return this.listMeetingsAt(await this.locate(projectId));
  }

  async readMeeting(projectId: string, meetingId: string): Promise<string> {
    const file = meetingFile((await this.locate(projectId)).dir, meetingId);
    try {
      return await fs.readFile(file, "utf8");
    } catch (error) {
      if (isErrno(error, "ENOENT")) {
        throw new StoreError("not_found", `Meeting "${meetingId}" not found.`);
      }
      throw error;
    }
  }

  async createMeeting(projectId: string, meetingId: string, content: string): Promise<void> {
    const file = meetingFile((await this.locate(projectId)).dir, meetingId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      await fs.writeFile(file, content, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if (isErrno(error, "EEXIST")) {
        throw new StoreError("exists", `Meeting "${meetingId}" already exists.`);
      }
      throw error;
    }
  }

  async updateMeeting(projectId: string, meetingId: string, content: string): Promise<void> {
    const file = meetingFile((await this.locate(projectId)).dir, meetingId);
    if (!(await exists(file))) {
      throw new StoreError("not_found", `Meeting "${meetingId}" not found.`);
    }
    await writeAtomic(file, content);
  }

  async deleteMeeting(projectId: string, meetingId: string): Promise<void> {
    const file = meetingFile((await this.locate(projectId)).dir, meetingId);
    try {
      await fs.unlink(file);
    } catch (error) {
      if (isErrno(error, "ENOENT")) {
        throw new StoreError("not_found", `Meeting "${meetingId}" not found.`);
      }
      throw error;
    }
  }
}
