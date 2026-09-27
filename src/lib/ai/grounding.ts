import type { ProjectContext } from "./context";
import type { DismissedSuggestion, TodoSuggestion } from "./types";

const MAX_SUGGESTIONS = 3;
const MIN_QUOTE_LENGTH = 8;
const TODO_LINE = /^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$/;

/** Loose comparison form: ignore case, Markdown emphasis, dash style, and spacing. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*_`]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:,]+$/, "");
}

interface RawSuggestion {
  text?: unknown;
  heading?: unknown;
  why?: unknown;
  evidence?: unknown;
}

/**
 * Keep only suggestions that quote real project text, aren't already todos,
 * aren't repeated, and weren't dismissed before. A suggestion citing any line a
 * dismissed suggestion cited is treated as the same idea reworded.
 */
export function groundSuggestions(
  raw: unknown,
  context: ProjectContext,
  dismissed: DismissedSuggestion[],
): TodoSuggestion[] {
  if (!Array.isArray(raw)) return [];

  const files = new Map(
    context.documents.map((d) => [
      d.file,
      { title: d.title, href: d.href, text: normalizeForMatch(d.lines.map((l) => l.text).join("\n")) },
    ]),
  );
  const seen = new Set([
    ...context.sections.todos.split("\n").flatMap((l) => {
      const m = TODO_LINE.exec(l);
      return m ? [normalizeForMatch(m[1])] : [];
    }),
    ...dismissed.map((d) => normalizeForMatch(d.text)),
  ]);
  const dismissedQuotes = dismissed.flatMap((d) => d.quotes.map(normalizeForMatch)).filter(Boolean);
  const overlapsDismissed = (quote: string) => {
    const q = normalizeForMatch(quote);
    return dismissedQuotes.some((d) => q.includes(d) || d.includes(q));
  };

  const result: TodoSuggestion[] = [];
  for (const s of raw as RawSuggestion[]) {
    if (typeof s?.text !== "string" || typeof s.why !== "string" || !Array.isArray(s.evidence)) continue;
    const text = s.text.replace(/\s+/g, " ").replace(/^[-*+]\s+\[[ xX]\]\s*/, "").trim();
    const key = normalizeForMatch(text);
    if (!text || text.length > 300 || seen.has(key)) continue;

    const evidence = (s.evidence as Array<{ file?: unknown; quote?: unknown }>).flatMap((e) => {
      const file = typeof e?.file === "string" ? files.get(e.file) : undefined;
      const quote = typeof e?.quote === "string" ? e.quote.trim() : "";
      if (!file || quote.length < MIN_QUOTE_LENGTH || !file.text.includes(normalizeForMatch(quote))) return [];
      return [{ file: e.file as string, title: file.title, href: file.href, quote }];
    });
    if (evidence.length === 0) continue;
    if (evidence.some((e) => overlapsDismissed(e.quote))) continue;

    seen.add(key);
    result.push({
      text,
      heading: typeof s.heading === "string" ? s.heading.replace(/^#+\s*/, "").trim().slice(0, 60) : "",
      why: s.why.trim(),
      evidence,
    });
    if (result.length === MAX_SUGGESTIONS) break;
  }
  return result;
}
