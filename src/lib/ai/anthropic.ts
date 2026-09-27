import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DOCUMENTS } from "@/lib/documents";
import type { AiProvider } from "./index";
import type { ContextDocument, ProjectContext } from "./context";
import { applyEdits } from "./edits";
import { groundSuggestions } from "./grounding";
import type {
  AnswerSource,
  AskEvent,
  DismissedSuggestion,
  Proposal,
  StatusMergeResult,
  ProposedChange,
  SuggestResult,
} from "./types";

const DEFAULT_MODEL = "claude-haiku-4-5";

/*
 * Two calls, because answering and editing need different views of the project:
 *
 * 1. ASK sees each file as citable line blocks, so answers carry line-level
 *    citations. If the user is describing a change, it calls request_update.
 * 2. UPDATE (only then) sees every file's exact raw text and replies with
 *    propose_changes: find/replace edits applied here, so lines the model
 *    doesn't touch can't drift. (Citation-enabled documents lose blank lines
 *    and leak citation markup into rewrites, so they are unsuitable for editing.)
 */

const ASK_SYSTEM = `You are Hallinta, a thoughtful research collaborator built into an academic research group's project tool. You work with one research project's Markdown files: description, current status, related papers, resources, related projects, artifacts, todos, timeline, and dated meeting notes.

- Ground every factual claim in the documents and cite the lines that support it.
- Be concise. Lead with the direct answer; use a few sentences or a short list.
- The most recent meeting notes are usually the best evidence of where things stand. If documents disagree, or a section looks stale relative to recent meetings, say so.
- If the documents do not answer the question, say what is missing rather than guessing.
- Do not invent tasks, deadlines, or decisions. No cheerleading, no emoji.

When the user reports something that happened ("Figure 3 is finished", "we dropped the robustness experiment") or asks you to change the project ("update the project based on today's meeting"), do not answer in prose. Write one short sentence saying what you will look at, then call request_update. The changes are drafted separately and shown to the user as diffs to accept or reject.`;

const EDIT_MECHANICS = `## How edits work

Each edit replaces one exact passage of a file: "find" is copied character-for-character from the current file (whole lines, including list markers) and must appear exactly once; "replace" is its new text. Everything outside your edits stays untouched.
- To add a line, find the neighbouring line and replace it with that line plus the new one.
- To check off a todo, find "- [ ] Task" and replace with "- [x] Task".
- To move an entry between sections, use one edit to remove it (replace with "") and another to insert it.
- For a currently empty file, use an empty "find" and put the full content in "replace".
- Keep edits small. Never delete content unless the user says it was dropped or is obsolete; never delete a todo — check it off instead. Do not add titles or headings that are not already in the file. Do not reword existing text unless the instruction requires it.`;

const UPDATE_SYSTEM = `You are Hallinta, a careful editor of one research project's Markdown files. The user has described a development or asked for an update. Propose edits with the propose_changes tool; the user reviews each file as a diff and decides what to apply.

${EDIT_MECHANICS}

## What to change

- Make the smallest set of edits that records what was reported; a good update usually touches one to three files with a few lines each. Omit files that need no change.
- State facts from the documents plainly. Do not add interpretation, emphasis, priorities, or commentary, such as parenthetical notes or claims like "finalized" that the documents don't make.
- Leave description.md unchanged unless the project's research question or intended contribution itself changed.
- When something is reported finished, do all of it: check off its todo if one exists, and for an artifact remove its block from "## Ongoing" and add it under "## Finished" (two edits).
- Never remove an unchecked todo unless the user says it was dropped.
- todos.md: add new todos under the fitting heading; check off a todo only when it is reported done; don't duplicate existing todos.
- artifacts.md: meaningful research outputs under "## Ongoing" and "## Finished"; move an artifact to Finished only when it is reported finished.
- timeline.md: only meaningful events and milestones ("- Sep 27 — Reframed the contribution"), never every todo.
- status.md: where the project stands now; update outdated statements rather than appending history.
- "Today's meeting" or "the latest meeting" means the most recent meeting note. Carry its decisions into status.md, its new todos into todos.md, and significant events into timeline.md.
- Meeting notes are read-only.
- In each change's reason, say what justifies it (for example, "Sep 27 meeting: decided to refocus the paper on night-time heat").`;

const MERGE_SYSTEM = `You are Hallinta, a careful editor of one research project's Markdown files. The team has completed some todos, and they are being removed from todos.md. Fold that completed work into status.md with the propose_changes tool, so the status stays a concise, current picture of the project. The user reviews the diff before anything is applied.

${EDIT_MECHANICS}

## What to change

- Only edit status.md.
- Update the statements the completed work affects. For example, a blocker or open item that a completed todo resolves should no longer read as pending.
- Integrate related items together, in the file's existing style and sections. Don't paste the todo list verbatim or add a changelog. If no existing statement fits, add one brief line to the most fitting section.
- Completing a todo means it was done, not what it found. Never state results, findings, numbers, or conclusions that the todo text and documents don't state. For example, a completed "Run the transfer experiment" becomes "The transfer experiment has been run." and not a claim about what it showed.
- Keep open questions open. Remove or rewrite a question only if a completed todo explicitly states its answer; running the experiment meant to answer it is not an answer.
- Keep everything else in status.md unchanged.
- In the reason, name the completed todos you folded in.`;

const SUGGEST_SYSTEM = `You are Hallinta, a thoughtful research collaborator. Suggest the next todo items for one research project, based only on its Markdown files.

- Suggest at most three todos that the documents show are needed but that are not already in todos.md (checked or unchecked). Fewer is better; return an empty list if nothing is clearly warranted.
- Every suggestion must be grounded in specific text: an open question left unresolved in a meeting, a decision that implies concrete work, a missing piece of an ongoing artifact, a deadline in the timeline with unfinished prerequisites, or similar.
- For evidence, copy the supporting text verbatim from the files (a phrase or a line) and give the file path exactly as shown.
- Never suggest generic advice such as reading more papers, analyzing the results, improving the writing, running more experiments, or thinking about the contribution.
- text: a short imperative todo in the style of the existing ones.
- why: one or two plain sentences naming the source, for example "The Sep 27 meeting left open whether the model transfers to a new district."
- heading: an existing "##" heading in todos.md that fits, or a short new one if none does.
- Do not repeat previously dismissed suggestions.`;

const SUGGEST_TODOS: Anthropic.Tool = {
  name: "suggest_todos",
  description: "Return grounded next todo suggestions for the user to review.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            heading: { type: "string" },
            why: { type: "string" },
            evidence: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  file: { type: "string", description: "File path, e.g. meetings/2026-09-27.md" },
                  quote: { type: "string", description: "Supporting text copied verbatim." },
                },
                required: ["file", "quote"],
                additionalProperties: false,
              },
            },
          },
          required: ["text", "heading", "why", "evidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["suggestions"],
    additionalProperties: false,
  },
};

const SECTION_FILES = DOCUMENTS.map((d) => `${d.id}.md`);

const REQUEST_UPDATE: Anthropic.Tool = {
  name: "request_update",
  description:
    "Start drafting changes to the project's files, for the user to review. Use when the user reports a development or asks to update the project.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      instruction: { type: "string", description: "What should change, restated precisely." },
    },
    required: ["instruction"],
    additionalProperties: false,
  },
};

/** The edit tool, limited to the given section files. */
function proposeTool(files: string[]): Anthropic.Tool {
  return {
    name: "propose_changes",
    description: "Propose edits to section files for the user to review as diffs.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One sentence describing the overall update." },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file: { type: "string", enum: files },
              reason: { type: "string", description: "What justifies this change." },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    find: { type: "string", description: "Exact current text to replace; empty only for an empty file." },
                    replace: { type: "string", description: "The new text." },
                  },
                  required: ["find", "replace"],
                  additionalProperties: false,
                },
              },
            },
            required: ["file", "reason", "edits"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "changes"],
      additionalProperties: false,
    },
  };
}

const PROPOSE_CHANGES = proposeTool(SECTION_FILES);
const EDIT_STATUS = proposeTool(["status.md"]);

function projectHeader(context: ProjectContext): string {
  return [
    `Project: ${context.name}`,
    context.members.length ? `Members: ${context.members.join(", ")}` : null,
    context.created ? `Started: ${context.created}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** Every file's exact text, for calls that need precise content rather than citations. */
function rawProjectText(context: ProjectContext): string {
  const meetings = context.meetings
    .map((m) => `<meeting path="${m.file}" title="${m.title}">\n${m.content}</meeting>`)
    .join("\n\n");
  const files = DOCUMENTS.map(
    (d) => `<file path="${d.id}.md" title="${d.title}">\n${context.sections[d.id]}</file>`,
  ).join("\n\n");
  return [
    projectHeader(context),
    `Meeting notes (read-only, oldest first):\n\n${meetings || "(none)"}`,
    `Section files, exactly as they are now:\n\n${files}`,
  ].join("\n\n");
}

function toSource(citation: Anthropic.CitationsDelta["citation"], documents: ContextDocument[]): AnswerSource | null {
  if (citation.type !== "content_block_location") return null;
  const doc = documents[citation.document_index];
  const first = doc?.lines[citation.start_block_index];
  if (!doc || !first) return null;
  const cited = doc.lines.slice(citation.start_block_index, citation.end_block_index);
  const last = cited.at(-1) ?? first;
  return {
    key: `${doc.file}:${first.line}-${last.line}`,
    title: doc.title,
    file: doc.file,
    href: doc.href,
    startLine: first.line,
    endLine: last.line,
    // cited_text concatenates blocks with no separator; rebuild it from the lines.
    quote: cited.map((l) => l.text.trim()).join(" "),
  };
}

/** Apply the proposed edits to the real files; drop anything malformed or unchanged. */
function toProposal(input: unknown, context: ProjectContext): Proposal | null {
  if (typeof input !== "object" || input === null) return null;
  const { summary, changes } = input as { summary?: unknown; changes?: unknown };
  if (typeof summary !== "string" || !Array.isArray(changes)) return null;

  const byFile = new Map<string, ProposedChange>();
  for (const change of changes as Array<Record<string, unknown>>) {
    const doc = DOCUMENTS.find((d) => `${d.id}.md` === change?.file);
    if (!doc || !Array.isArray(change.edits)) continue;
    const edits = (change.edits as Array<Record<string, unknown>>).filter(
      (e): e is { find: string; replace: string } =>
        typeof e?.find === "string" && typeof e?.replace === "string",
    );
    const base = context.sections[doc.id];
    const applied = applyEdits(base, edits);
    let content = applied.content;
    if (content.trim() && !content.endsWith("\n")) content += "\n";
    if (content === base) continue;
    byFile.set(doc.id, {
      documentId: doc.id,
      file: `${doc.id}.md`,
      title: doc.title,
      reason: typeof change.reason === "string" ? change.reason : "",
      base,
      content,
      skippedEdits: applied.skipped,
    });
  }
  // Keep page order regardless of the order the model listed files in.
  const ordered = DOCUMENTS.flatMap((d) => byFile.get(d.id) ?? []);
  return { summary, changes: ordered };
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the Anthropic API. Try again in a moment.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the Anthropic API. Check your network connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error${error.status ? ` (${error.status})` : ""}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export class AnthropicProvider implements AiProvider {
  private readonly client = new Anthropic();
  private readonly model = process.env.HALLINTA_MODEL || DEFAULT_MODEL;
  /** Drafting edits benefits more from a stronger model than answering does. */
  private readonly updateModel = process.env.HALLINTA_UPDATE_MODEL || this.model;

  async *ask(context: ProjectContext, question: string, signal: AbortSignal): AsyncGenerator<AskEvent> {
    try {
      const instruction = yield* this.answer(context, question, signal);
      if (instruction !== null) yield* this.propose(context, question, instruction, signal);
    } catch (error) {
      if (signal.aborted) return;
      yield { type: "error", message: describeError(error) };
    }
  }

  /** Stream a cited answer. Returns the update instruction if Hallinta asked to draft changes. */
  private async *answer(
    context: ProjectContext,
    question: string,
    signal: AbortSignal,
  ): AsyncGenerator<AskEvent, string | null> {
    // Stable prefix (header + documents) first so it can be prompt-cached;
    // the date and question come after the cache breakpoint.
    const header: Anthropic.TextBlockParam = {
      type: "text",
      text: `${projectHeader(context)}\n\nThe project's non-empty Markdown files follow, one document per file. Each line is a separate citable block.`,
    };
    const documents: Anthropic.DocumentBlockParam[] = context.documents.map((doc) => ({
      type: "document",
      title: doc.file,
      context: doc.title,
      citations: { enabled: true },
      source: { type: "content", content: doc.lines.map((l) => ({ type: "text", text: l.text })) },
    }));
    if (documents.length > 0) documents[documents.length - 1].cache_control = { type: "ephemeral" };

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: 16000,
        system: ASK_SYSTEM,
        tools: [REQUEST_UPDATE],
        messages: [
          {
            role: "user",
            content: [
              header,
              ...documents,
              { type: "text", text: `Today is ${new Date().toLocaleDateString("en-CA")}.\n\n${question}` },
            ],
          },
        ],
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "text") yield { type: "segment" };
        else if (event.content_block.type === "tool_use") yield { type: "drafting" };
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        } else if (event.delta.type === "citations_delta") {
          const source = toSource(event.delta.citation, context.documents);
          if (source) yield { type: "citation", source };
        }
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield { type: "notice", message: "Hallinta declined to respond to this." };
      return null;
    }
    if (final.stop_reason === "max_tokens") {
      yield { type: "notice", message: "The answer was cut off." };
      return null;
    }
    const toolUse = final.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === REQUEST_UPDATE.name,
    );
    if (!toolUse) return null;
    const { instruction } = toolUse.input as { instruction?: unknown };
    return typeof instruction === "string" ? instruction : question;
  }

  /** Draft file changes from the exact current file text. */
  private async *propose(
    context: ProjectContext,
    question: string,
    instruction: string,
    signal: AbortSignal,
  ): AsyncGenerator<AskEvent> {
    const stream = this.client.messages.stream(
      {
        model: this.updateModel,
        max_tokens: 16000,
        system: UPDATE_SYSTEM,
        tools: [PROPOSE_CHANGES],
        tool_choice: { type: "tool", name: PROPOSE_CHANGES.name },
        messages: [
          {
            role: "user",
            content: [
              rawProjectText(context),
              `Today is ${new Date().toLocaleDateString("en-CA")}.`,
              `User's words: ${question}`,
              `What should change: ${instruction}`,
            ].join("\n\n"),
          },
        ],
      },
      { signal },
    );

    const final = await stream.finalMessage();
    if (final.stop_reason === "max_tokens") {
      yield {
        type: "notice",
        message: "The proposed update was too large and got cut off. Try a narrower instruction.",
      };
      return;
    }
    if (final.stop_reason === "refusal") {
      yield { type: "notice", message: "Hallinta declined to draft this update." };
      return;
    }
    const toolUse = final.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === PROPOSE_CHANGES.name,
    );
    const proposal = toolUse ? toProposal(toolUse.input, context) : null;
    if (!proposal) {
      yield { type: "error", message: "Hallinta returned a malformed proposal. Try again." };
    } else if (proposal.changes.length === 0) {
      yield { type: "notice", message: "Hallinta found nothing that needs to change." };
    } else {
      yield { type: "proposal", proposal };
    }
  }

  async mergeCompletedTodos(
    context: ProjectContext,
    completed: string[],
    signal: AbortSignal,
  ): Promise<StatusMergeResult> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.updateModel,
          max_tokens: 16000,
          system: MERGE_SYSTEM,
          tools: [EDIT_STATUS],
          tool_choice: { type: "tool", name: EDIT_STATUS.name },
          messages: [
            {
              role: "user",
              content: [
                rawProjectText(context),
                `Today is ${new Date().toLocaleDateString("en-CA")}.`,
                `Completed todos being removed from todos.md:\n${completed.map((c) => `- ${c.replace(/\n/g, "\n  ")}`).join("\n")}`,
              ].join("\n\n"),
            },
          ],
        },
        { signal },
      );
      const final = await stream.finalMessage();
      if (final.stop_reason === "max_tokens") return { error: "The status update was too large and got cut off." };
      if (final.stop_reason === "refusal") return { error: "Hallinta declined to draft this update." };
      const toolUse = final.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === EDIT_STATUS.name,
      );
      const proposal = toolUse ? toProposal(toolUse.input, context) : null;
      const change = proposal?.changes.find((c) => c.documentId === "status");
      if (!proposal || !change) {
        return { error: "Hallinta couldn't fold these into Current Status. Try again, or edit it by hand." };
      }
      return { summary: proposal.summary, change };
    } catch (error) {
      if (signal.aborted) return { error: "Cancelled." };
      return { error: describeError(error) };
    }
  }

  async suggestTodos(
    context: ProjectContext,
    dismissed: DismissedSuggestion[],
    signal: AbortSignal,
  ): Promise<SuggestResult> {
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 4000,
          system: SUGGEST_SYSTEM,
          tools: [SUGGEST_TODOS],
          tool_choice: { type: "tool", name: SUGGEST_TODOS.name },
          messages: [
            {
              role: "user",
              content: [
                rawProjectText(context),
                `Today is ${new Date().toLocaleDateString("en-CA")}.`,
                dismissed.length
                  ? `Previously dismissed suggestions (do not suggest these or rewordings of them):\n${dismissed.map((d) => `- ${d.text}`).join("\n")}`
                  : null,
                "Suggest the next todos.",
              ]
                .filter((part) => part !== null)
                .join("\n\n"),
            },
          ],
        },
        { signal },
      );
      if (response.stop_reason === "refusal") return { error: "Hallinta declined to suggest todos." };
      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === SUGGEST_TODOS.name,
      );
      const raw = (toolUse?.input as { suggestions?: unknown } | undefined)?.suggestions;
      return { suggestions: groundSuggestions(raw, context, dismissed) };
    } catch (error) {
      return { error: describeError(error) };
    }
  }
}
