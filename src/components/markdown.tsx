"use client";

import { useMemo } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  MISSING_PROJECT_HREF,
  linkifyProjectRefs,
  rehypeTaskLines,
  type ProjectLinks,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";

export function Markdown({
  content,
  projectLinks = {},
  onToggleTask,
  lineOffset = 0,
  className,
}: {
  content: string;
  projectLinks?: ProjectLinks;
  /** Receives the 1-based line in the original document. */
  onToggleTask?: (line: number, checked: boolean) => void;
  /** Added to line numbers when `content` is a slice of a larger document. */
  lineOffset?: number;
  className?: string;
}) {
  const source = useMemo(() => linkifyProjectRefs(content, projectLinks), [content, projectLinks]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href = "", children }) => {
        if (href === MISSING_PROJECT_HREF) {
          return (
            <span
              className="border-b border-dashed border-stone-400 text-stone-500"
              title="No project with this name"
            >
              {children}
            </span>
          );
        }
        if (href.startsWith("#cite-")) {
          return (
            <sup>
              <a
                href={`#source-${href.slice("#cite-".length)}`}
                className="rounded bg-stone-100 px-1 text-[0.7rem] font-medium text-stone-600 no-underline hover:bg-stone-200"
              >
                {children}
              </a>
            </sup>
          );
        }
        if (href.startsWith("/")) return <Link href={href}>{children}</Link>;
        if (href.startsWith("#")) return <a href={href}>{children}</a>;
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
      input: ({ node, type, checked }) => {
        if (type !== "checkbox") return <input type={type} />;
        const line = Number(node?.properties?.dataLine);
        const interactive = onToggleTask !== undefined && line > 0;
        return (
          <input
            type="checkbox"
            checked={Boolean(checked)}
            disabled={!interactive}
            onChange={(e) => onToggleTask?.(line + lineOffset, e.target.checked)}
          />
        );
      },
    }),
    [onToggleTask, lineOffset],
  );

  return (
    <div
      className={cn(
        "prose prose-stone max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:mt-6 prose-h2:text-lg prose-h3:text-base prose-a:text-stone-900 prose-a:decoration-stone-300 prose-a:underline-offset-2 hover:prose-a:decoration-stone-600 prose-li:my-0.5",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeTaskLines]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
