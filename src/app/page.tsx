import Link from "next/link";
import { List, Share2 } from "lucide-react";
import { NewProjectForm } from "@/components/new-project-form";
import { ProjectGraph } from "@/components/project-graph";
import { buildGraph } from "@/lib/graph";
import { handlePageGuardError, visibleProjects } from "@/lib/auth/guard";
import { canManageProjects } from "@/lib/auth/permissions";
import { getStore, type ProjectSummary } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function ProjectRows({ projects, muted = false }: { projects: ProjectSummary[]; muted?: boolean }) {
  return (
    <ul className="divide-y divide-stone-200 border-y border-stone-200">
      {projects.map((p) => (
        <li key={p.id}>
          <Link
            href={`/projects/${p.id}`}
            className="flex items-baseline justify-between gap-4 px-1 py-4 hover:bg-stone-100"
          >
            <span>
              <span className={cn("font-medium", muted ? "text-stone-500" : "text-stone-900")}>{p.name}</span>
              {p.members.length > 0 && (
                <span className="ml-3 text-sm text-stone-500">{p.members.join(" · ")}</span>
              )}
            </span>
            {p.created && (
              <span className="shrink-0 text-xs text-stone-400">since {formatDate(p.created)}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ViewToggle({ view }: { view: "list" | "graph" }) {
  const option = (value: "list" | "graph", label: string, Icon: typeof List) => (
    <Link
      href={value === "list" ? "/" : "/?view=graph"}
      aria-current={view === value ? "page" : undefined}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1 text-sm [&_svg]:size-3.5",
        view === value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800",
      )}
    >
      <Icon />
      {label}
    </Link>
  );
  return (
    <div className="flex rounded-md bg-stone-200/70 p-0.5">
      {option("list", "List", List)}
      {option("graph", "Graph", Share2)}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view === "graph" ? "graph" : "list";
  const store = getStore();
  // Only projects this person can view exist, as far as this page is concerned.
  const { actor, projects } = await visibleProjects().catch((error) => handlePageGuardError(error));
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  let graph = null;
  if (view === "graph") {
    const related = Object.fromEntries(
      await Promise.all(
        active.map(async (p) => [p.id, await store.readDocument(p.id, "related-projects")] as const),
      ),
    );
    graph = buildGraph(projects, active, related);
  }

  return (
    <main className="pb-24 pt-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">Projects</h1>
        <ViewToggle view={view} />
      </div>

      {view === "graph" && graph ? (
        <div className="mb-8">
          <ProjectGraph nodes={graph.nodes} edges={graph.edges} />
          {archived.length > 0 && (
            <p className="mt-1 text-xs text-stone-400">
              {archived.length} archived project{archived.length === 1 ? " is" : "s are"} not shown.
            </p>
          )}
        </div>
      ) : (
        <div className="mb-8 space-y-8">
          {active.length === 0 ? (
            <p className="text-stone-500">
              {canManageProjects(actor)
                ? "No active projects. Create one to get started."
                : "No projects have been shared with you yet."}
            </p>
          ) : (
            <ProjectRows projects={active} />
          )}
          {archived.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm text-stone-500 hover:text-stone-800 [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">▸</span> Archived (
                {archived.length})
              </summary>
              <div className="mt-3">
                <ProjectRows projects={archived} muted />
              </div>
            </details>
          )}
        </div>
      )}

      {canManageProjects(actor) && <NewProjectForm />}
    </main>
  );
}
