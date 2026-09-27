import { diffLines } from "diff";

export type DiffRow =
  | { type: "same" | "add" | "del"; text: string; oldLine?: number; newLine?: number }
  | { type: "skip"; count: number };

export interface LineDiff {
  rows: DiffRow[];
  added: number;
  removed: number;
}

function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** Line diff with unchanged runs collapsed to `context` lines around each change. */
export function lineDiff(before: string, after: string, context = 3): LineDiff {
  const full: Exclude<DiffRow, { type: "skip" }>[] = [];
  let oldLine = 1;
  let newLine = 1;
  let added = 0;
  let removed = 0;

  for (const part of diffLines(before, after)) {
    for (const text of splitLines(part.value)) {
      if (part.added) {
        full.push({ type: "add", text, newLine: newLine++ });
        added++;
      } else if (part.removed) {
        full.push({ type: "del", text, oldLine: oldLine++ });
        removed++;
      } else {
        full.push({ type: "same", text, oldLine: oldLine++, newLine: newLine++ });
      }
    }
  }

  // Keep unchanged rows within `context` of a change; collapse the rest.
  const keep = full.map(() => false);
  full.forEach((row, i) => {
    if (row.type === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(full.length - 1, i + context); j++) keep[j] = true;
  });

  const rows: DiffRow[] = [];
  let skipped = 0;
  full.forEach((row, i) => {
    if (keep[i]) {
      if (skipped) rows.push({ type: "skip", count: skipped });
      skipped = 0;
      rows.push(row);
    } else {
      skipped++;
    }
  });
  if (skipped) rows.push({ type: "skip", count: skipped });

  return { rows, added, removed };
}

function countNonBlank(value: string): number {
  return value.split("\n").filter((l) => l.trim()).length;
}

/**
 * Warn when a rewrite shrinks a file substantially — the typical failure mode
 * of a model reproducing a whole file and silently dropping content.
 */
export function shrinkWarning(before: string, after: string): string | null {
  const b = countNonBlank(before);
  const a = countNonBlank(after);
  if (b - a >= 3 && a < b * 0.7) {
    return `This change shortens the file from ${b} to ${a} lines. Check that nothing important was dropped.`;
  }
  return null;
}

/** Open questions (lines ending in "?") in `before` that are gone from `after`. */
export function removedQuestions(before: string, after: string): string[] {
  const remaining = new Set(after.split("\n").map((l) => l.trim()));
  return before
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith("?") && !remaining.has(l))
    .map((l) => l.replace(/^(?:[-*+]|\d+[.)])\s+/, ""));
}

const OPEN_TODO = /^\s*[-*+]\s+\[ \]\s+(.+?)\s*$/;
const ANY_TODO = /^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$/;

/** Unchecked todos in `before` that no longer appear (checked or not) in `after`. */
export function removedOpenTodos(before: string, after: string): string[] {
  const remaining = new Set(
    after.split("\n").flatMap((l) => {
      const m = ANY_TODO.exec(l);
      return m ? [m[1]] : [];
    }),
  );
  return before.split("\n").flatMap((l) => {
    const m = OPEN_TODO.exec(l);
    return m && !remaining.has(m[1]) ? [m[1]] : [];
  });
}
