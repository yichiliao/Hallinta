import "server-only";
import { AnthropicProvider } from "./anthropic";
import type { ProjectContext } from "./context";
import type { AskEvent, DismissedSuggestion, StatusMergeResult, SuggestResult } from "./types";

/** The only interface the rest of the app sees; swap implementations here. */
export interface AiProvider {
  /**
   * Answer a question, or propose file changes for the user to review.
   * Never writes anything itself. Errors are yielded as events, not thrown.
   */
  ask(context: ProjectContext, question: string, signal: AbortSignal): AsyncGenerator<AskEvent>;

  /** Draft a status.md edit that folds in these completed todos. */
  mergeCompletedTodos(context: ProjectContext, completed: string[], signal: AbortSignal): Promise<StatusMergeResult>;

  /** Suggest a few grounded next todos, avoiding previously dismissed ones. */
  suggestTodos(
    context: ProjectContext,
    dismissed: DismissedSuggestion[],
    signal: AbortSignal,
  ): Promise<SuggestResult>;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let provider: AiProvider | undefined;

export function getAiProvider(): AiProvider | null {
  if (!isAiConfigured()) return null;
  provider ??= new AnthropicProvider();
  return provider;
}
