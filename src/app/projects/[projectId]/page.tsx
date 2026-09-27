import Link from "next/link";
import { Download } from "lucide-react";
import {
  addTodo,
  createMeeting,
  saveMarkdown,
  saveProjectMembership,
  setProjectArchived,
  toggleTask,
  updateProjectDetails,
} from "@/app/actions";
import { ArchiveButton, ArchivedBanner } from "@/components/archive-control";
import { AskHallinta } from "@/components/ask-hallinta";
import { EditableMarkdown, SectionLabel } from "@/components/editable-markdown";
import { NewMeeting } from "@/components/meetings";
import { ProjectDetails, type TeamMembership } from "@/components/project-details";
import { TodosSection } from "@/components/todos-section";
import { buttonVariants } from "@/components/ui/button";
import { isAiConfigured } from "@/lib/ai";
import { handlePageGuardError, requireProject, visibleProjects } from "@/lib/auth/guard";
import type { ProjectPermissions } from "@/lib/auth/permissions";
import { getUserStore } from "@/lib/auth/server";
import { getDocumentInfo, type DocumentId } from "@/lib/documents";
import { buildProjectLinks } from "@/lib/markdown";
import { getStore, type Project } from "@/lib/store";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function loadProject(projectId: string): Promise<{ project: Project; permissions: ProjectPermissions }> {
  try {
    const { permissions } = await requireProject(projectId, "view");
    return { project: await getStore().getProject(projectId), permissions };
  } catch (error) {
    handlePageGuardError(error, `/projects/${projectId}`);
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, permissions: can } = await loadProject(projectId);
  // Only projects this person can see resolve as links.
  const projectLinks = buildProjectLinks((await visibleProjects()).projects);

  const aiConfigured = isAiConfigured();

  // Team mode: members are accounts with access to this project.
  const accounts = await getUserStore().list();
  const team: TeamMembership | undefined =
    accounts.length === 0
      ? undefined
      : {
          access: project.access,
          legacy: project.members,
          names: Object.fromEntries(accounts.filter((u) => u.id in project.access).map((u) => [u.id, u.name])),
          directory: can.manage
            ? accounts.map(({ id, name, email, role, disabled }) => ({ id, name, email, role, disabled }))
            : [],
          save: can.manage ? saveProjectMembership.bind(null, projectId) : undefined,
        };

  const sectionProps = (id: DocumentId) => {
    const info = getDocumentInfo(id);
    const target = { kind: "document", id } as const;
    return {
      id,
      title: info.title,
      emptyText: info.empty,
      content: project.documents[id],
      save: saveMarkdown.bind(null, projectId, target),
      toggle: toggleTask.bind(null, projectId, target),
      projectLinks,
      readOnly: !can.edit,
    };
  };
  const section = (id: DocumentId, props: { layout?: "artifacts"; className?: string } = {}) => (
    <EditableMarkdown key={id} {...sectionProps(id)} {...props} />
  );

  return (
    <main className="pb-24">
      <header className="pb-6 pt-8">
        <div className="flex min-h-7 items-center justify-between gap-4">
          <Link href="/" className="text-sm text-stone-400 hover:text-stone-600">
            ← Projects
          </Link>
          <div className="flex items-center gap-1">
            <a
              href={`/api/export/${projectId}`}
              download
              title="Download an HTML snapshot of everything except meeting notes"
              className={buttonVariants({ variant: "ghost", size: "xs" })}
            >
              <Download />
              Export
            </a>
            {can.manage && !project.archived && (
              <ArchiveButton archive={setProjectArchived.bind(null, projectId, true)} />
            )}
          </div>
        </div>
        {project.archived && (
          <ArchivedBanner unarchive={can.manage ? setProjectArchived.bind(null, projectId, false) : undefined} />
        )}
        <ProjectDetails
          name={project.name}
          members={project.members}
          save={can.manage ? updateProjectDetails.bind(null, projectId) : undefined}
          team={team}
        />
        {can.ai && <AskHallinta projectId={projectId} configured={aiConfigured} projectLinks={projectLinks} />}
      </header>

      <div className="divide-y divide-stone-200 border-t border-stone-200">
        {section("description")}
        {section("status")}
        <div className="grid md:grid-cols-2 md:gap-10">
          {section("papers")}
          {section("resources", { className: "max-md:border-t max-md:border-stone-200" })}
        </div>
        {section("related-projects")}
        {section("artifacts", { layout: "artifacts" })}
        <TodosSection
          {...sectionProps("todos")}
          projectId={projectId}
          configured={aiConfigured}
          ai={can.ai}
          addTodo={addTodo.bind(null, projectId)}
        />
        {section("timeline")}

        <section className="py-8">
          <div className="mb-4 flex min-h-8 items-center">
            <SectionLabel>Meeting Notes</SectionLabel>
          </div>
          {project.meetings.length === 0 ? (
            <p className="mb-3 text-sm text-stone-400">No meetings yet.</p>
          ) : (
            <ul className="mb-3">
              {project.meetings.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/projects/${projectId}/meetings/${m.id}`}
                    className="-mx-2 flex gap-6 rounded px-2 py-1.5 hover:bg-stone-100"
                  >
                    <span className="w-28 shrink-0 tabular-nums text-stone-500">
                      {formatDate(m.date)}
                    </span>
                    <span className="text-stone-800">
                      {m.title.replace(new RegExp(`\\s*[—–-]\\s*${m.date}$`), "")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {can.edit && <NewMeeting create={createMeeting.bind(null, projectId)} />}
        </section>
      </div>
    </main>
  );
}
