import type { Element, Root } from "hast";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { DOCUMENTS } from "@/lib/documents";
import { plainProjectRefs } from "@/lib/markdown";
import type { Project } from "@/lib/store/types";
import { formatDate } from "@/lib/utils";

/*
 * Self-contained HTML snapshots for sharing outside Hallinta (e.g. with students).
 * No scripts, no external assets. Raw HTML in the Markdown is dropped and only
 * safe link targets are kept, so exported files are safe to hand out.
 */

const SAFE_URL = /^(https?:|mailto:|#)/i;

/** Remove links and images whose targets aren't safe (e.g. javascript:). */
function rehypeSafeUrls() {
  return (tree: Root) => {
    const visit = (node: Root | Element) => {
      for (const child of node.children) {
        if (child.type !== "element") continue;
        for (const attr of ["href", "src"] as const) {
          const value = child.properties[attr];
          if (typeof value === "string" && !SAFE_URL.test(value.trim())) delete child.properties[attr];
        }
        visit(child);
      }
    };
    visit(tree);
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype) // raw HTML is dropped (allowDangerousHtml is off)
  .use(rehypeSafeUrls)
  .use(rehypeStringify);

/** Markdown → safe HTML. [[Project]] references become plain names. */
export function markdownToHtml(markdown: string): string {
  return String(processor.processSync(plainProjectRefs(markdown)));
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLES = `
:root { color-scheme: light dark; --fg: #1c1917; --muted: #78716c; --faint: #a8a29e; --line: #e7e5e4; --bg: #fafaf9; --card: #fff; --accent: #44403c; }
@media (prefers-color-scheme: dark) { :root { --fg: #e7e5e4; --muted: #a8a29e; --faint: #78716c; --line: #292524; --bg: #0c0a09; --card: #1c1917; --accent: #d6d3d1; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 4rem; }
header { border-bottom: 1px solid var(--line); padding-bottom: 1.5rem; margin-bottom: 0.5rem; }
.eyebrow { color: var(--faint); font-size: 0.8rem; letter-spacing: 0.02em; }
h1.title { font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif; font-weight: 400; font-size: 2.4rem; line-height: 1.15; margin: 0.4rem 0 0.3rem; letter-spacing: -0.01em; }
.members { color: var(--muted); margin: 0; }
section { border-bottom: 1px solid var(--line); padding: 1.75rem 0; }
section:last-of-type { border-bottom: 0; }
.label { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 0.9rem; }
.md > :first-child { margin-top: 0; }
.md > :last-child { margin-bottom: 0; }
.md h1 { font-size: 1.5rem; } .md h2 { font-size: 1.15rem; margin-top: 1.6rem; } .md h3 { font-size: 1rem; margin-top: 1.3rem; }
.md h1, .md h2, .md h3 { font-weight: 600; line-height: 1.3; }
.md a { color: var(--fg); text-decoration-color: var(--faint); text-underline-offset: 2px; }
.md ul, .md ol { padding-left: 1.4rem; } .md li { margin: 0.2rem 0; }
.md ul.contains-task-list { list-style: none; padding-left: 0; }
.md ul.contains-task-list ul.contains-task-list { padding-left: 1.5rem; }
.md li.task-list-item input { margin: 0 0.55em 0 0; vertical-align: -0.1em; accent-color: var(--accent); }
.md li.task-list-item:has(> input:checked) { color: var(--faint); }
.md code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.88em; background: var(--line); padding: 0.1em 0.35em; border-radius: 4px; }
.md pre { background: var(--card); border: 1px solid var(--line); padding: 0.9rem 1rem; border-radius: 6px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md blockquote { margin: 1rem 0; padding-left: 1rem; border-left: 3px solid var(--line); color: var(--muted); }
.md table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; }
.md th, .md td { border: 1px solid var(--line); padding: 0.4rem 0.6rem; text-align: left; }
footer { color: var(--faint); font-size: 0.8rem; margin-top: 2rem; }
@media print { body { background: #fff; } main { padding-top: 0; } section { break-inside: avoid; } }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Hallinta">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
<footer>Snapshot exported from Hallinta. It does not update; ask for a new export for the latest version.</footer>
</main>
</body>
</html>
`;
}

function header(eyebrow: string, title: string, members: string[]): string {
  return `<header>
<div class="eyebrow">${escapeHtml(eyebrow)}</div>
<h1 class="title">${escapeHtml(title)}</h1>
${members.length ? `<p class="members">${members.map(escapeHtml).join(" · ")}</p>` : ""}
</header>`;
}

/** Every non-empty section of the project, in page order. Meeting notes are excluded. */
export function exportProjectHtml(project: Project, exportedOn: string): string {
  const sections = DOCUMENTS.filter((d) => project.documents[d.id].trim())
    .map(
      (d) => `<section id="${d.id}">
<h2 class="label">${escapeHtml(d.title)}</h2>
<div class="md">${markdownToHtml(project.documents[d.id])}</div>
</section>`,
    )
    .join("\n");
  return page(
    `${project.name} · ${formatDate(exportedOn)}`,
    `${header(`Project snapshot · ${formatDate(exportedOn)}`, project.name, project.members)}
${sections || `<p class="members">This project has no content yet.</p>`}`,
  );
}

/** A single meeting note, released on its own. */
export function exportMeetingHtml(
  project: { name: string },
  meeting: { date: string; content: string },
  exportedOn: string,
): string {
  const heading = /^#\s+(.+?)\s*$/m.exec(meeting.content)?.[1] ?? `Meeting · ${formatDate(meeting.date)}`;
  return page(
    `${heading} · ${project.name}`,
    `${header(`${project.name} · Meeting of ${formatDate(meeting.date)} · Exported ${formatDate(exportedOn)}`, heading, [])}
<section>
<div class="md">${markdownToHtml(meeting.content.replace(/^#\s+.+?\s*$\n?/m, ""))}</div>
</section>`,
  );
}

/** "heat-islands-2026-09-28.html" style names that are safe in a Content-Disposition header. */
export function exportFilename(...parts: string[]): string {
  return `${parts.join("-").replace(/[^a-zA-Z0-9._-]+/g, "-")}.html`;
}
