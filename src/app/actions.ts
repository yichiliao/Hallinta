"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { meetingTemplate } from "@/lib/documents";
import { insertTodo, setTaskAt } from "@/lib/markdown";
import { requireManageProjects, requireProject } from "@/lib/auth/guard";
import { accessForKnownUsers, type AccessMap } from "@/lib/auth/permissions";
import { getUserStore } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import { slugify, type ActionResult } from "@/lib/utils";

export type MarkdownTarget = { kind: "document" | "meeting"; id: string };

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function readTarget(projectId: string, target: MarkdownTarget): Promise<string> {
  const store = getStore();
  return target.kind === "document"
    ? store.readDocument(projectId, target.id)
    : store.readMeeting(projectId, target.id);
}

function writeTarget(projectId: string, target: MarkdownTarget, content: string): Promise<void> {
  const store = getStore();
  return target.kind === "document"
    ? store.writeDocument(projectId, target.id, content)
    : store.updateMeeting(projectId, target.id, content);
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
}

/*
 * Every exported action starts with an authorization check (guard.ts); errors,
 * including denials, come back as { ok: false, error }.
 */

/**
 * Save a section or meeting note. `base` is the content the editor started from;
 * if the file changed on disk since then, report a conflict instead of overwriting.
 * Pass `base = null` to overwrite regardless.
 */
export async function saveMarkdown(
  projectId: string,
  target: MarkdownTarget,
  content: string,
  base: string | null,
): Promise<ActionResult> {
  try {
    await requireProject(projectId, "edit");
    if (typeof content !== "string") return failure("Invalid content.");
    if (base !== null && (await readTarget(projectId, target)) !== base) {
      return {
        ok: false,
        conflict: true,
        error: "This file changed on disk since you started editing.",
      };
    }
    await writeTarget(projectId, target, content);
  } catch (error) {
    return failure(error);
  }
  revalidateProject(projectId);
  return { ok: true };
}

/** Toggle one checkbox, re-reading the file so only that line changes. */
export async function toggleTask(
  projectId: string,
  target: MarkdownTarget,
  line: number,
  checked: boolean,
  expectedLine: string,
): Promise<ActionResult> {
  try {
    await requireProject(projectId, "edit");
    const current = await readTarget(projectId, target);
    if (current.split("\n")[line - 1] !== expectedLine) {
      return { ok: false, error: "This section changed on disk. Reload to see the latest version." };
    }
    const next = setTaskAt(current, line, checked);
    if (next === null) return failure("That line is not a task.");
    await writeTarget(projectId, target, next);
  } catch (error) {
    return failure(error);
  }
  revalidateProject(projectId);
  return { ok: true };
}

/** Append an open todo under a heading in todos.md (used by Hallinta's suggestions). */
export async function addTodo(projectId: string, heading: string, text: string): Promise<ActionResult> {
  const item = typeof text === "string" ? text.replace(/\s+/g, " ").replace(/^[-*+]\s+\[[ xX]\]\s*/, "").trim() : "";
  const section = typeof heading === "string" ? heading.replace(/\s+/g, " ").replace(/^#+\s*/, "").trim() : "";
  if (!item || item.length > 300 || section.length > 100) return failure("Invalid todo.");
  try {
    await requireProject(projectId, "edit");
    const store = getStore();
    const current = await store.readDocument(projectId, "todos");
    await store.writeDocument(projectId, "todos", insertTodo(current, section, item));
  } catch (error) {
    return failure(error);
  }
  revalidateProject(projectId);
  return { ok: true };
}

export async function createProject(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  const name = String(formData.get("name") ?? "").trim();
  const id = slugify(name);
  if (!name) return failure("Give the project a name.");
  if (!id) return failure("The name needs at least one letter or digit.");
  if (id === "archive") return failure("“Archive” is reserved. Choose another name.");
  const members = parseMembers(String(formData.get("members") ?? ""));
  try {
    await requireManageProjects();
    await getStore().createProject({
      id,
      name,
      members,
      created: new Date().toLocaleDateString("en-CA"),
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  redirect(`/projects/${id}`);
}

function parseMembers(value: string): string[] {
  const members = value.split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set(members)];
}

/** Rename a project or change its members. The id (and folder) stay the same. */
export async function updateProjectDetails(
  projectId: string,
  name: string,
  members: string,
): Promise<ActionResult> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return failure("Give the project a name.");
  if (trimmed.length > 120) return failure("That name is too long.");
  try {
    await requireProject(projectId, "manage");
    await getStore().updateProject(projectId, {
      name: trimmed,
      members: parseMembers(typeof members === "string" ? members : ""),
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  revalidateProject(projectId);
  return { ok: true };
}

/**
 * Team mode: set a project's name and members. Members are accounts with view
 * or edit access; `legacyMembers` are free-text names not yet linked to accounts.
 */
export async function saveProjectMembership(
  projectId: string,
  name: string,
  access: AccessMap,
  legacyMembers: string[],
): Promise<ActionResult> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return failure("Give the project a name.");
  if (trimmed.length > 120) return failure("That name is too long.");
  try {
    await requireProject(projectId, "manage");
    const users = await getUserStore().list();
    await getStore().updateMembership(projectId, {
      name: trimmed,
      members: Array.isArray(legacyMembers) ? parseMembers(legacyMembers.filter((m) => typeof m === "string").join(",")) : [],
      access: accessForKnownUsers(access, users.map((u) => u.id)),
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  revalidateProject(projectId);
  return { ok: true };
}

/** Move a project to (or back from) data/archive/. Archived projects stay fully usable. */
export async function setProjectArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  try {
    await requireProject(projectId, "manage");
    const store = getStore();
    await (archived ? store.archiveProject(projectId) : store.unarchiveProject(projectId));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/");
  revalidateProject(projectId);
  return { ok: true };
}

export async function createMeeting(projectId: string, date: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return failure("Pick a valid date.");
  }
  let id = date;
  try {
    await requireProject(projectId, "edit");
    const store = getStore();
    const taken = new Set((await store.listMeetings(projectId)).map((m) => m.id));
    for (let n = 2; taken.has(id); n++) id = `${date}-${n}`;
    await store.createMeeting(projectId, id, meetingTemplate(date));
  } catch (error) {
    return failure(error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}/meetings/${id}?edit=1`);
}

export async function deleteMeeting(projectId: string, meetingId: string): Promise<ActionResult> {
  try {
    await requireProject(projectId, "edit");
    await getStore().deleteMeeting(projectId, meetingId);
  } catch (error) {
    return failure(error);
  }
  revalidateProject(projectId);
  redirect(`/projects/${projectId}`);
}
