import type { AccessMap } from "@/lib/auth/permissions";
import type { DocumentId } from "@/lib/documents";

export interface ProjectSummary {
  id: string;
  name: string;
  members: string[];
  created: string;
  /** Archived projects live under <root>/archive/ and are hidden from the graph. */
  archived: boolean;
  /** Per-project grants for regular users (team mode). */
  access: AccessMap;
}

export interface MeetingSummary {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
}

export interface Project extends ProjectSummary {
  documents: Record<DocumentId, string>;
  meetings: MeetingSummary[];
}

export interface NewProject {
  id: string;
  name: string;
  members: string[];
  created: string;
}

export interface ProjectStore {
  listProjects(): Promise<ProjectSummary[]>;
  getProject(projectId: string): Promise<Project>;
  /** Just project.json: cheap enough to call on every request for access checks. */
  getProjectSummary(projectId: string): Promise<ProjectSummary>;
  setProjectAccess(projectId: string, access: AccessMap): Promise<void>;
  /** Team-mode membership: account grants plus any not-yet-linked free-text names. */
  updateMembership(projectId: string, membership: { name: string; members: string[]; access: AccessMap }): Promise<void>;
  createProject(project: NewProject): Promise<void>;
  updateProject(projectId: string, details: { name: string; members: string[] }): Promise<void>;
  archiveProject(projectId: string): Promise<void>;
  unarchiveProject(projectId: string): Promise<void>;

  readDocument(projectId: string, documentId: string): Promise<string>;
  writeDocument(projectId: string, documentId: string, content: string): Promise<void>;

  listMeetings(projectId: string): Promise<MeetingSummary[]>;
  readMeeting(projectId: string, meetingId: string): Promise<string>;
  createMeeting(projectId: string, meetingId: string, content: string): Promise<void>;
  updateMeeting(projectId: string, meetingId: string, content: string): Promise<void>;
  deleteMeeting(projectId: string, meetingId: string): Promise<void>;
}

export class StoreError extends Error {
  constructor(
    public code: "not_found" | "invalid" | "exists",
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}
