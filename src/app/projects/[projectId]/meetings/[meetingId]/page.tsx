import Link from "next/link";
import { deleteMeeting, saveMarkdown, toggleTask } from "@/app/actions";
import { MeetingNote } from "@/components/meetings";
import { handlePageGuardError, requireProject, visibleProjects } from "@/lib/auth/guard";
import type { ProjectPermissions } from "@/lib/auth/permissions";
import { buildProjectLinks } from "@/lib/markdown";
import { getStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; meetingId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { projectId, meetingId } = await params;
  const { edit } = await searchParams;
  const store = getStore();

  let content: string;
  let project;
  let can: ProjectPermissions;
  try {
    ({ project, permissions: can } = await requireProject(projectId, "view"));
    content = await store.readMeeting(projectId, meetingId);
  } catch (error) {
    handlePageGuardError(error, `/projects/${projectId}/meetings/${meetingId}`);
  }
  const { projects } = await visibleProjects();

  const target = { kind: "meeting", id: meetingId } as const;

  return (
    <main className="pb-24 pt-8">
      <Link href={`/projects/${projectId}`} className="text-sm text-stone-400 hover:text-stone-600">
        ← {project.name}
      </Link>
      <MeetingNote
        title={`Meeting · ${formatDate(meetingId.slice(0, 10))}`}
        content={content}
        save={saveMarkdown.bind(null, projectId, target)}
        toggle={toggleTask.bind(null, projectId, target)}
        remove={deleteMeeting.bind(null, projectId, meetingId)}
        projectLinks={buildProjectLinks(projects)}
        initialEditing={can.edit && edit === "1"}
        readOnly={!can.edit}
        exportHref={`/api/export/${projectId}/meetings/${meetingId}`}
      />
    </main>
  );
}
