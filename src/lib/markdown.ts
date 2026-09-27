import type { Element, Root } from "hast";
import { slugify } from "@/lib/utils";

const TASK_RE = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/;
const FENCE_RE = /^\s*(```|~~~)/;

/** Set the checkbox on a 1-based line. Returns null if that line isn't a task item. */
export function setTaskAt(markdown: string, line: number, checked: boolean): string | null {
  const lines = markdown.split("\n");
  const i = line - 1;
  if (i < 0 || i >= lines.length || !TASK_RE.test(lines[i])) return null;
  lines[i] = lines[i].replace(TASK_RE, `$1${checked ? "x" : " "}$3`);
  return lines.join("\n");
}

export const MISSING_PROJECT_HREF = "#hallinta-missing-project";

/** Lowercased project name and id → project id. */
export type ProjectLinks = Record<string, string>;

export function buildProjectLinks(projects: { id: string; name: string }[]): ProjectLinks {
  const links: ProjectLinks = {};
  for (const p of projects) {
    links[p.name.toLowerCase()] = p.id;
    links[p.id] = p.id;
  }
  return links;
}

export function resolveProjectRef(name: string, links: ProjectLinks): string | undefined {
  return links[name.toLowerCase()] ?? links[slugify(name)];
}

const PROJECT_REF_RE = /\[\[([^[\]\n]+?)\]\]/g;

export interface ProjectRef {
  name: string;
  /**
   * Text describing the relationship. For an item that starts with the
   * reference ("- [[X]] — why"), the rest of the line or else its first
   * sub-item; for a reference inside prose, the whole sentence.
   */
  note: string;
}

/** Every [[Project Name]] reference outside code fences, with its note. */
export function extractProjectRefs(markdown: string): ProjectRef[] {
  const refs: ProjectRef[] = [];
  const lines = markdown.split("\n");
  let inFence = false;
  lines.forEach((line, i) => {
    if (FENCE_RE.test(line)) inFence = !inFence;
    if (inFence) return;
    const content = line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim();
    const leading = /^\[\[[^[\]\n]+?\]\]/.exec(content);
    let note: string;
    if (leading) {
      const rest = content
        .slice(leading[0].length)
        .replace(PROJECT_REF_RE, (_m, name: string) => name.trim())
        .replace(/^[\s:—–-]+/, "")
        .trim();
      const indent = /^\s*/.exec(line)![0].length;
      const next = lines[i + 1];
      const child =
        next && next.trim() && /^\s*/.exec(next)![0].length > indent
          ? next.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim()
          : "";
      note = rest || child;
    } else {
      note = content.replace(PROJECT_REF_RE, (_m, name: string) => name.trim());
    }
    for (const match of line.matchAll(PROJECT_REF_RE)) {
      refs.push({ name: match[1].trim(), note });
    }
  });
  return refs;
}

/**
 * Rewrite [[Project Name]] into ordinary Markdown links (outside code fences).
 * Never changes line count, so source line numbers stay valid.
 */
export function linkifyProjectRefs(markdown: string, links: ProjectLinks): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE_RE.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line.replace(PROJECT_REF_RE, (_match, raw: string) => {
        const name = raw.trim();
        const id = resolveProjectRef(name, links);
        return `[${name}](${id ? `/projects/${id}` : MISSING_PROJECT_HREF})`;
      });
    })
    .join("\n");
}

export interface H2Section {
  heading: string | null;
  body: string;
  /** 1-based source line of the first body line. */
  bodyStart: number;
}

/** Split a document at `## ` headings (ignoring fenced code). */
export function splitByH2(markdown: string): H2Section[] {
  const sections: H2Section[] = [];
  let current = { heading: null as string | null, lines: [] as string[], bodyStart: 1 };
  let inFence = false;
  markdown.split("\n").forEach((line, i) => {
    if (FENCE_RE.test(line)) inFence = !inFence;
    const match = inFence ? null : /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      sections.push({ heading: current.heading, body: current.lines.join("\n"), bodyStart: current.bodyStart });
      current = { heading: match[1], lines: [], bodyStart: i + 2 };
    } else {
      current.lines.push(line);
    }
  });
  sections.push({ heading: current.heading, body: current.lines.join("\n"), bodyStart: current.bodyStart });
  return sections;
}

function findCheckbox(li: Element): Element | undefined {
  for (const child of li.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "input") return child;
    // Loose lists wrap item content in <p>.
    if (child.tagName === "p") {
      const inner = child.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "input",
      );
      if (inner) return inner;
    }
  }
}

/** Tag each task checkbox with the source line of its list item. */
export function rehypeTaskLines() {
  return (tree: Root) => {
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        if (child.tagName === "li" && child.position) {
          const box = findCheckbox(child);
          if (box) box.properties.dataLine = child.position.start.line;
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

/**
 * Add "- [ ] text" at the end of the `## heading` section, creating the section
 * at the end of the document if it doesn't exist. An empty heading appends to
 * the end of the document.
 */
export function insertTodo(markdown: string, heading: string, text: string): string {
  const item = `- [ ] ${text}`;
  const lines = markdown.replace(/\s+$/, "").split("\n");
  if (lines.length === 1 && lines[0] === "") lines.pop();

  let start = -1;
  let inFence = false;
  const wanted = heading.trim().toLowerCase();
  if (wanted) {
    lines.forEach((line, i) => {
      if (FENCE_RE.test(line)) inFence = !inFence;
      const match = !inFence && start === -1 && /^##\s+(.+?)\s*#*\s*$/.exec(line);
      if (match && match[1].toLowerCase() === wanted) start = i;
    });
  }

  if (wanted && start === -1) {
    const section = [`## ${heading.trim()}`, "", item];
    return [...lines, ...(lines.length ? [""] : []), ...section].join("\n") + "\n";
  }

  // Section runs until the next heading of level 1–2 (or the end).
  let end = lines.length;
  inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) inFence = !inFence;
    if (!inFence && /^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let last = end - 1;
  while (last > start && lines[last].trim() === "") last--;

  if (last === start && start !== -1) {
    // Heading with no items yet.
    lines.splice(start + 1, 0, "", item);
  } else {
    lines.splice(last + 1, 0, item);
  }
  return lines.join("\n") + "\n";
}

const CHECKED_TASK_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[[xX]\]\s+(.*)$/;
const OPEN_TASK_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s/;

/**
 * Remove checked todos (with their indented sub-items) from a todo list.
 * A checked item that still has an open sub-task is kept. Returns the removed
 * items as text so they can be recorded elsewhere.
 */
export function removeCompletedTodos(markdown: string): { content: string; removed: string[] } {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  const removed: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) inFence = !inFence;
    const match = inFence ? null : CHECKED_TASK_RE.exec(line);
    if (!match) {
      kept.push(line);
      continue;
    }
    const indent = match[1].length;
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== "" && /^\s*/.exec(lines[end])![0].length > indent) end++;
    const block = lines.slice(i, end);
    if (block.slice(1).some((l) => OPEN_TASK_RE.test(l))) {
      kept.push(line);
      continue;
    }
    removed.push([match[2].trim(), ...block.slice(1).map((l) => l.trim())].join("\n"));
    i = end - 1;
  }

  // Removing items can leave doubled blank lines; collapse them.
  const content = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  return { content, removed };
}

/** Replace [[Project Name]] with plain "Project Name" (outside code fences), e.g. for exports. */
export function plainProjectRefs(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE_RE.test(line)) inFence = !inFence;
      return inFence ? line : line.replace(PROJECT_REF_RE, (_m, name: string) => name.trim());
    })
    .join("\n");
}
