/** Shared between the server route and the browser; keep it free of server imports. */

import type { DocumentId } from "@/lib/documents";

/** One file Hallinta wants to rewrite. Nothing is written until the user accepts it. */
export interface ProposedChange {
  documentId: DocumentId;
  file: string;
  title: string;
  reason: string;
  /** The file's content when Hallinta read it; used for the diff and conflict check. */
  base: string;
  content: string;
  /** Edits Hallinta proposed that didn't match the file and were left out. */
  skippedEdits: number;
  /** The change only removes completed todos, so shrinking the file is expected. */
  removesCompletedOnly?: boolean;
}

export interface Proposal {
  summary: string;
  changes: ProposedChange[];
}

/** A span of a project file that supports part of an answer. */
export interface AnswerSource {
  /** Stable identity for de-duplicating repeated citations. */
  key: string;
  title: string;
  /** Project-relative file, e.g. "status.md" or "meetings/2026-09-27.md". */
  file: string;
  href: string;
  startLine: number;
  endLine: number;
  quote: string;
}

/** Streamed to the browser as newline-delimited JSON. */
export type AskEvent =
  /** A new answer segment begins; following citations attach to it. */
  | { type: "segment" }
  | { type: "text"; text: string }
  | { type: "citation"; source: AnswerSource }
  /** Hallinta has started writing a proposal (can take a while). */
  | { type: "drafting" }
  | { type: "proposal"; proposal: Proposal }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };

/** A next todo Hallinta thinks the project needs, with the lines that justify it. */
export interface TodoSuggestion {
  text: string;
  /** Heading in todos.md to add it under (may be new). */
  heading: string;
  why: string;
  evidence: { file: string; title: string; href: string; quote: string }[];
}

/** What the user dismissed: its text and the lines it was based on. */
export interface DismissedSuggestion {
  text: string;
  quotes: string[];
}

export type SuggestResult = { suggestions: TodoSuggestion[] } | { error: string };

export type StatusMergeResult = { summary: string; change: ProposedChange } | { error: string };

/** Result of "merge completed todos": a two-file proposal, or why there isn't one. */
export type MergeResult = { proposal: Proposal } | { notice: string } | { error: string };

export const AI_NOT_CONFIGURED =
  "Ask Hallinta needs an Anthropic API key. Add ANTHROPIC_API_KEY to .env.local and restart the server.";
