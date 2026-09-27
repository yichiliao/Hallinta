"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { saveMarkdown } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { lineDiff, removedOpenTodos, removedQuestions, shrinkWarning } from "@/lib/diff";
import type { Proposal, ProposedChange } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

const MarkdownEditor = dynamic(() => import("@/components/markdown-editor"), {
  ssr: false,
  loading: () => <div className="h-40 animate-pulse rounded-md border border-stone-200 bg-white" />,
});

type Status = "pending" | "editing" | "accepted" | "rejected";

interface ChangeState {
  status: Status;
  /** The proposed content, or the user's edited version of it. */
  content: string;
  error: string | null;
  conflict: boolean;
}

export function ProposalReview({ projectId, proposal }: { projectId: string; proposal: Proposal }) {
  const [states, setStates] = useState<ChangeState[]>(() =>
    proposal.changes.map((c) => ({ status: "pending", content: c.content, error: null, conflict: false })),
  );
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<ChangeState>) =>
    setStates((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  async function accept(i: number, content: string, force = false) {
    const change = proposal.changes[i];
    const result = await saveMarkdown(
      projectId,
      { kind: "document", id: change.documentId },
      content,
      force ? null : change.base,
    );
    if (result.ok) {
      update(i, { status: "accepted", content, error: null, conflict: false });
    } else {
      update(i, { content, error: result.error, conflict: Boolean(result.conflict) });
    }
  }

  function acceptAll() {
    startTransition(async () => {
      for (const [i, st] of states.entries()) {
        if (st.status === "pending") await accept(i, st.content);
      }
    });
  }

  const open = states.filter((s) => s.status === "pending" || s.status === "editing").length;
  const accepted = states.filter((s) => s.status === "accepted").length;

  return (
    <div className="mt-4 space-y-4 border-t border-stone-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-700">
          <span className="font-medium">Proposed update:</span> {proposal.summary}
        </p>
        {open > 1 && (
          <Button size="sm" onClick={acceptAll} disabled={pending}>
            <Check />
            Accept all ({open})
          </Button>
        )}
        {open === 0 && (
          <p className="text-sm text-stone-500">
            {accepted === 0 ? "No changes applied." : `Applied ${accepted} of ${states.length}.`}
          </p>
        )}
      </div>

      {proposal.changes.map((change, i) => (
        <ChangeCard
          key={change.file}
          change={change}
          state={states[i]}
          busy={pending}
          onAccept={(content, force) => startTransition(() => accept(i, content, force))}
          onEdit={() => update(i, { status: "editing", error: null })}
          onCancelEdit={() => update(i, { status: "pending" })}
          onDraftChange={(content) => update(i, { content })}
          onReject={() => update(i, { status: "rejected", error: null, conflict: false })}
        />
      ))}
    </div>
  );
}

function ChangeCard({
  change,
  state,
  busy,
  onAccept,
  onEdit,
  onCancelEdit,
  onDraftChange,
  onReject,
}: {
  change: ProposedChange;
  state: ChangeState;
  busy: boolean;
  onAccept: (content: string, force?: boolean) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDraftChange: (content: string) => void;
  onReject: () => void;
}) {
  const diff = useMemo(() => lineDiff(change.base, state.content), [change.base, state.content]);
  const warning = useMemo(
    () => (change.removesCompletedOnly && state.content === change.content ? null : shrinkWarning(change.base, state.content)),
    [change, state.content],
  );
  const droppedQuestions = useMemo(() => removedQuestions(change.base, state.content), [change.base, state.content]);
  const droppedTodos = useMemo(() => removedOpenTodos(change.base, state.content), [change.base, state.content]);
  const done = state.status === "accepted" || state.status === "rejected";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-stone-200",
        state.status === "rejected" && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
        <div className="flex items-baseline gap-2 text-sm">
          <span className="font-medium text-stone-800">{change.title}</span>
          <span className="font-mono text-xs text-stone-400">{change.file}</span>
          <span className="font-mono text-xs text-emerald-700">+{diff.added}</span>
          <span className="font-mono text-xs text-red-700">−{diff.removed}</span>
        </div>
        <div className="flex items-center gap-1">
          {state.status === "accepted" && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <Check className="size-3.5" /> Applied
            </span>
          )}
          {state.status === "rejected" && <span className="text-xs text-stone-500">Rejected</span>}
          {state.status === "pending" && (
            <>
              <Button variant="ghost" size="xs" onClick={onReject} disabled={busy}>
                <X />
                Reject
              </Button>
              <Button variant="ghost" size="xs" onClick={onEdit} disabled={busy}>
                <Pencil />
                Edit
              </Button>
              <Button variant="outline" size="xs" onClick={() => onAccept(state.content)} disabled={busy}>
                <Check />
                Accept
              </Button>
            </>
          )}
          {state.status === "editing" && (
            <>
              <Button variant="ghost" size="xs" onClick={onCancelEdit} disabled={busy}>
                Back to diff
              </Button>
              <Button size="xs" onClick={() => onAccept(state.content)} disabled={busy}>
                <Check />
                Save &amp; accept
              </Button>
            </>
          )}
        </div>
      </div>

      {change.reason && !done && <p className="px-3 pt-2 text-xs text-stone-500">{change.reason}</p>}

      {change.skippedEdits > 0 && !done && (
        <p className="mx-3 mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {change.skippedEdits} proposed edit{change.skippedEdits === 1 ? "" : "s"} didn&apos;t match the file and
          {change.skippedEdits === 1 ? " was" : " were"} left out. Use Edit to add anything missing.
        </p>
      )}

      {droppedTodos.length > 0 && !done && (
        <p className="mx-3 mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            Removes {droppedTodos.length === 1 ? "an open todo" : `${droppedTodos.length} open todos`}:{" "}
            {droppedTodos.map((t) => `“${t}”`).join(", ")}. Reject or edit if it wasn&apos;t dropped.
          </span>
        </p>
      )}

      {droppedQuestions.length > 0 && !done && (
        <p className="mx-3 mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            Removes {droppedQuestions.length === 1 ? "an open question" : `${droppedQuestions.length} open questions`}:{" "}
            {droppedQuestions.map((q) => `“${q}”`).join(", ")}. Keep it unless it was actually answered.
          </span>
        </p>
      )}

      {warning && !done && (
        <p className="mx-3 mt-2 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {warning}
        </p>
      )}

      {state.error && (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <span className="flex-1">
            {state.conflict
              ? `${change.file} changed since Hallinta read it. Applying would overwrite those edits.`
              : state.error}
          </span>
          {state.conflict && (
            <Button variant="outline" size="xs" onClick={() => onAccept(state.content, true)} disabled={busy}>
              Overwrite anyway
            </Button>
          )}
        </div>
      )}

      {state.status === "editing" ? (
        <div className="p-3">
          <MarkdownEditor
            value={state.content}
            onChange={onDraftChange}
            onSave={() => onAccept(state.content)}
            onCancel={onCancelEdit}
          />
        </div>
      ) : (
        !done && <DiffView rows={diff.rows} />
      )}
    </div>
  );
}

function DiffView({ rows }: { rows: ReturnType<typeof lineDiff>["rows"] }) {
  return (
    <div className="mt-2 overflow-x-auto border-t border-stone-100 font-mono text-xs leading-5">
      {rows.map((row, i) =>
        row.type === "skip" ? (
          <div key={i} className="bg-stone-50 px-3 text-stone-400">
            ⋯ {row.count} unchanged line{row.count === 1 ? "" : "s"}
          </div>
        ) : (
          <div
            key={i}
            className={cn(
              "flex",
              row.type === "add" && "bg-emerald-50 text-emerald-950",
              row.type === "del" && "bg-red-50 text-red-950",
            )}
          >
            {/* Old and new line numbers, like a unified diff. */}
            <span className="w-8 shrink-0 select-none pr-1.5 text-right text-stone-400">{row.oldLine ?? ""}</span>
            <span className="w-8 shrink-0 select-none pr-1.5 text-right text-stone-400">{row.newLine ?? ""}</span>
            <span className="w-4 shrink-0 select-none text-stone-400">
              {row.type === "add" ? "+" : row.type === "del" ? "−" : ""}
            </span>
            <span className="whitespace-pre-wrap break-words pr-3">{row.text || " "}</span>
          </div>
        ),
      )}
    </div>
  );
}
