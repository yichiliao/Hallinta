import "server-only";
import { DOCUMENTS, type DocumentId } from "@/lib/documents";
import { getStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export interface ContextLine {
  text: string;
  /** 1-based line number in the source file. */
  line: number;
}

export interface ContextDocument {
  /** Project-relative file name, e.g. "meetings/2026-09-27.md". */
  file: string;
  title: string;
  href: string;
  /** Non-blank lines only; each becomes one citable unit. */
  lines: ContextLine[];
}

export interface ProjectContext {
  name: string;
  members: string[];
  created: string;
  /** Non-empty files, in citation order. */
  documents: ContextDocument[];
  /** Exact current text of every section file (including empty ones). */
  sections: Record<DocumentId, string>;
  /** Exact text of every meeting note, oldest first. */
  meetings: { file: string; title: string; content: string }[];
}

function toLines(markdown: string): ContextLine[] {
  return markdown
    .split("\n")
    .map((text, i) => ({ text: text.replace(/\r$/, ""), line: i + 1 }))
    .filter((l) => l.text.trim() !== "");
}

/**
 * Everything Hallinta may read about a project, in a stable order: sections in page
 * order, then meetings oldest-first so a new meeting only appends to the end.
 */
export async function loadProjectContext(projectId: string): Promise<ProjectContext> {
  const store = getStore();
  const project = await store.getProject(projectId);
  const meetings = [...project.meetings].reverse();
  const meetingContents = await Promise.all(
    meetings.map((m) => store.readMeeting(projectId, m.id)),
  );

  const documents: ContextDocument[] = [
    ...DOCUMENTS.map((d) => ({
      file: `${d.id}.md`,
      title: d.title,
      href: `/projects/${projectId}#${d.id}`,
      lines: toLines(project.documents[d.id]),
    })),
    ...meetings.map((m, i) => ({
      file: `meetings/${m.id}.md`,
      title: `Meeting · ${formatDate(m.date)}`,
      href: `/projects/${projectId}/meetings/${m.id}`,
      lines: toLines(meetingContents[i]),
    })),
  ];

  return {
    name: project.name,
    members: project.members,
    created: project.created,
    documents: documents.filter((d) => d.lines.length > 0),
    sections: project.documents,
    meetings: meetings.map((m, i) => ({
      file: `meetings/${m.id}.md`,
      title: `Meeting · ${formatDate(m.date)}`,
      content: meetingContents[i],
    })),
  };
}
