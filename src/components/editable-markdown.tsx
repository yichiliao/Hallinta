"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { setTaskAt, splitByH2, type ProjectLinks } from "@/lib/markdown";
import { cn, type ActionResult } from "@/lib/utils";

const MarkdownEditor = dynamic(() => import("@/components/markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-md border border-stone-200 bg-white" />,
});

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{children}</h2>
  );
}

type Layout = "plain" | "artifacts";

export function EditableMarkdown({
  title,
  content,
  save,
  toggle,
  projectLinks,
  emptyText,
  layout = "plain",
  initialEditing = false,
  onSaved,
  actions,
  below,
  id,
  readOnly = false,
  className,
}: {
  id?: string;
  /** View-only access: no editing, no checkbox toggling. */
  readOnly?: boolean;
  title: ReactNode;
  content: string;
  save: (content: string, base: string | null) => Promise<ActionResult>;
  toggle: (line: number, checked: boolean, expectedLine: string) => Promise<ActionResult>;
  projectLinks: ProjectLinks;
  emptyText: string;
  layout?: Layout;
  initialEditing?: boolean;
  onSaved?: () => void;
  /** Extra header controls shown when not editing. */
  actions?: ReactNode;
  /** Shown under the header when not editing (e.g. Hallinta's suggestions). */
  below?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(content);
  const [editing, setEditing] = useState(initialEditing);
  const [draft, setDraft] = useState(content);
  const [base, setBase] = useState(content);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => setShown(content), [content]);

  const dirty = editing && draft !== base;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function startEditing() {
    setDraft(shown);
    setBase(shown);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit(force = false) {
    const content = draft;
    startTransition(async () => {
      const result = await save(content, force ? null : base);
      if (!result.ok) {
        setError({ message: result.error, conflict: Boolean(result.conflict) });
        return;
      }
      setShown(content);
      setEditing(false);
      setError(null);
      onSaved?.();
    });
  }

  function discardAndReload() {
    setEditing(false);
    setError(null);
    router.refresh();
  }

  function toggleTask(line: number, checked: boolean) {
    const previous = shown;
    const next = setTaskAt(previous, line, checked);
    if (next === null) return;
    setShown(next);
    startTransition(async () => {
      const result = await toggle(line, checked, previous.split("\n")[line - 1]);
      if (!result.ok) {
        setShown(previous);
        setError({ message: result.error, conflict: false });
      }
    });
  }

  return (
    <section id={id} className={cn("scroll-mt-4 py-8", className)}>
      <div className="mb-4 flex min-h-8 items-center justify-between gap-4">
        <SectionLabel>{title}</SectionLabel>
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-xs text-stone-400 sm:inline">⌘S save · Esc cancel</span>
            <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => commit()} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {actions}
            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                <Pencil />
                Edit
              </Button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex-1">{error.message}</span>
          {error.conflict && editing ? (
            <>
              <Button variant="outline" size="xs" onClick={() => commit(true)} disabled={pending}>
                Overwrite with my version
              </Button>
              <Button variant="ghost" size="xs" onClick={discardAndReload}>
                Discard my edits
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => setError(null)}>
              Dismiss
            </Button>
          )}
        </div>
      )}

      {!editing && below}

      {editing ? (
        <MarkdownEditor value={draft} onChange={setDraft} onSave={() => commit()} onCancel={cancel} />
      ) : !shown.trim() && readOnly ? (
        <p className="text-sm text-stone-400">Nothing here yet.</p>
      ) : !shown.trim() ? (
        <button
          type="button"
          onClick={startEditing}
          className="w-full rounded-md border border-dashed border-stone-300 px-4 py-6 text-left text-sm text-stone-400 hover:border-stone-400 hover:text-stone-500"
        >
          {emptyText}
        </button>
      ) : layout === "artifacts" ? (
        <ArtifactColumns content={shown} projectLinks={projectLinks} onToggleTask={readOnly ? undefined : toggleTask} />
      ) : (
        <Markdown content={shown} projectLinks={projectLinks} onToggleTask={readOnly ? undefined : toggleTask} />
      )}
    </section>
  );
}

/** Render "## Ongoing" and "## Finished" side by side; anything else flows around them. */
function ArtifactColumns({
  content,
  projectLinks,
  onToggleTask,
}: {
  content: string;
  projectLinks: ProjectLinks;
  onToggleTask?: (line: number, checked: boolean) => void;
}) {
  const sections = splitByH2(content);
  const find = (name: string) => sections.find((s) => s.heading?.toLowerCase() === name);
  const ongoing = find("ongoing");
  const finished = find("finished");

  if (!ongoing && !finished) {
    return <Markdown content={content} projectLinks={projectLinks} onToggleTask={onToggleTask} />;
  }

  const [preamble, ...rest] = sections;
  const others = rest.filter((s) => s !== ongoing && s !== finished);

  const renderBody = (section: typeof preamble, className?: string) => (
    <Markdown
      content={section.body}
      lineOffset={section.bodyStart - 1}
      projectLinks={projectLinks}
      onToggleTask={onToggleTask}
      className={cn("prose-h3:mt-5 prose-h3:first:mt-0", className)}
    />
  );

  const column = (label: string, section: typeof preamble | undefined) => (
    <div>
      <h3 className="mb-3 border-b border-stone-200 pb-1.5 text-sm font-semibold text-stone-700">
        {label}
      </h3>
      {section?.body.trim() ? (
        renderBody(section)
      ) : (
        <p className="text-sm text-stone-400">Nothing yet.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {preamble.body.trim() && renderBody(preamble)}
      <div className="grid gap-8 md:grid-cols-2">
        {column("Ongoing", ongoing)}
        {column("Finished", finished)}
      </div>
      {others.map((s) => (
        <div key={s.bodyStart}>
          <h3 className="mb-3 border-b border-stone-200 pb-1.5 text-sm font-semibold text-stone-700">
            {s.heading}
          </h3>
          {renderBody(s)}
        </div>
      ))}
    </div>
  );
}
