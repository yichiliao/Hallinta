import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { deniedResponse, requireProject } from "@/lib/auth/guard";
import { loadProjectContext, type ProjectContext } from "@/lib/ai/context";
import { AI_NOT_CONFIGURED, type DismissedSuggestion } from "@/lib/ai/types";

/** POST { projectId, dismissed? } → { suggestions } | { error }. Never modifies files. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  if (!projectId) return NextResponse.json({ error: "projectId is required." }, { status: 400 });
  const dismissed: DismissedSuggestion[] = (Array.isArray(body?.dismissed) ? body.dismissed : [])
    .flatMap((d: unknown) => {
      const { text, quotes } = (d ?? {}) as { text?: unknown; quotes?: unknown };
      if (typeof text !== "string") return [];
      return [{ text, quotes: Array.isArray(quotes) ? quotes.filter((q) => typeof q === "string") : [] }];
    })
    .slice(-50);

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

  const result = await provider.suggestTodos(context, dismissed, request.signal);
  return NextResponse.json(result, { status: "error" in result ? 502 : 200 });
}
