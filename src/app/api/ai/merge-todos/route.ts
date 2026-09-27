import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { deniedResponse, requireProject } from "@/lib/auth/guard";
import { loadProjectContext, type ProjectContext } from "@/lib/ai/context";
import { AI_NOT_CONFIGURED, type MergeResult, type ProposedChange } from "@/lib/ai/types";
import { removeCompletedTodos } from "@/lib/markdown";

/**
 * POST { projectId } → MergeResult. Proposes removing checked todos from todos.md
 * (done in code, exactly) and folding them into status.md (drafted by Hallinta).
 * Never modifies files; the user accepts each change in the review UI.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });

  const provider = getAiProvider();
  if (!provider) return NextResponse.json({ error: AI_NOT_CONFIGURED }, { status: 503 });

  let context: ProjectContext;
  try {
    // AI spends the installation's API key: requires edit access (CLAUDE.md §32.3).
    await requireProject(projectId, "ai");
    context = await loadProjectContext(projectId);
  } catch (error) {
    return deniedResponse(error);
  }

  const todos = removeCompletedTodos(context.sections.todos);
  if (todos.removed.length === 0) {
    return NextResponse.json<MergeResult>({ notice: "There are no completed todos to merge." });
  }

  const status = await provider.mergeCompletedTodos(context, todos.removed, request.signal);
  if ("error" in status) return NextResponse.json<MergeResult>(status, { status: 502 });

  const n = todos.removed.length;
  const todosChange: ProposedChange = {
    documentId: "todos",
    file: "todos.md",
    title: "Todos",
    reason: `Remove ${n} completed todo${n === 1 ? "" : "s"} now recorded in Current Status.`,
    base: context.sections.todos,
    content: todos.content,
    skippedEdits: 0,
    removesCompletedOnly: true,
  };
  return NextResponse.json<MergeResult>({
    proposal: { summary: status.summary, changes: [status.change, todosChange] },
  });
}
