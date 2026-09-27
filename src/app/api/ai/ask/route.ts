import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";
import { deniedResponse, requireProject } from "@/lib/auth/guard";
import { loadProjectContext, type ProjectContext } from "@/lib/ai/context";
import { AI_NOT_CONFIGURED } from "@/lib/ai/types";

const MAX_QUESTION_LENGTH = 4000;

/** POST { projectId, question } → NDJSON stream of AskEvent. Never modifies files. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!projectId || !question) {
    return NextResponse.json({ error: "projectId and question are required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }

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

  const events = provider.ask(context, question, request.signal);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
