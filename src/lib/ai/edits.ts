export interface TextEdit {
  find: string;
  replace: string;
}

/**
 * Apply find/replace edits in order. An edit is skipped (not guessed at) when its
 * `find` text is missing or ambiguous. An empty `find` sets the content of an
 * empty file.
 */
export function applyEdits(base: string, edits: TextEdit[]): { content: string; skipped: number } {
  let content = base;
  let skipped = 0;
  for (const { find, replace } of edits) {
    if (find === "") {
      if (content.trim() === "") content = replace;
      else skipped++;
      continue;
    }
    const at = content.indexOf(find);
    if (at === -1 || content.indexOf(find, at + 1) !== -1) {
      skipped++;
      continue;
    }
    content = content.slice(0, at) + replace + content.slice(at + find.length);
  }
  return { content, skipped };
}
