"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EditableMarkdown } from "@/components/editable-markdown";
import type { ProjectLinks } from "@/lib/markdown";
import type { ActionResult } from "@/lib/utils";

export function NewMeeting({ create }: { create: (date: string) => Promise<ActionResult> }) {
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (date === null) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => setDate(new Date().toLocaleDateString("en-CA"))}
      >
        <Plus />
        New meeting
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await create(date);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <Input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-auto"
        autoFocus
        required
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setDate(null)}>
        Cancel
      </Button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </form>
  );
}

function DeleteMeeting({ remove }: { remove: () => Promise<ActionResult> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 />
        Delete
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="mr-1 text-xs text-stone-500">{error ?? "Delete this meeting note?"}</span>
      <Button
        variant="destructive"
        size="xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await remove();
            if (result && !result.ok) setError(result.error);
          })
        }
      >
        Delete
      </Button>
      <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
}

export function MeetingNote({
  title,
  content,
  save,
  toggle,
  remove,
  projectLinks,
  initialEditing,
  exportHref,
  readOnly,
}: {
  exportHref: string;
  readOnly: boolean;
  title: string;
  content: string;
  save: (content: string, base: string | null) => Promise<ActionResult>;
  toggle: (line: number, checked: boolean, expectedLine: string) => Promise<ActionResult>;
  remove: () => Promise<ActionResult>;
  projectLinks: ProjectLinks;
  initialEditing: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <EditableMarkdown
      title={title}
      content={content}
      save={save}
      toggle={toggle}
      projectLinks={projectLinks}
      emptyText="This meeting note is empty."
      initialEditing={initialEditing}
      readOnly={readOnly}
      // Drop ?edit=1 so a reload doesn't reopen the editor.
      onSaved={() => initialEditing && router.replace(pathname)}
      actions={
        <>
          <a
            href={exportHref}
            download
            title="Download this meeting note as a standalone HTML file"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Download />
            Export
          </a>
          {!readOnly && <DeleteMeeting remove={remove} />}
        </>
      }
    />
  );
}
