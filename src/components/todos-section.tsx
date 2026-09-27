"use client";

import { useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { Check, Lightbulb, ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditableMarkdown } from "@/components/editable-markdown";
import { ProposalReview } from "@/components/proposal-review";
import {
  AI_NOT_CONFIGURED,
  type DismissedSuggestion,
  type MergeResult,
  type Proposal,
  type SuggestResult,
  type TodoSuggestion,
} from "@/lib/ai/types";
import type { ActionResult } from "@/lib/utils";

type Item = TodoSuggestion & { status: "open" | "adding" | "added"; error?: string };

function dismissedKey(projectId: string) {
  return `hallinta:dismissed-todos:${projectId}`;
}

function loadDismissed(projectId: string): DismissedSuggestion[] {
  try {
    const value = JSON.parse(localStorage.getItem(dismissedKey(projectId)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((v): v is DismissedSuggestion => typeof v?.text === "string" && Array.isArray(v?.quotes))
      : [];
  } catch {
    return [];
  }
}

function saveDismissed(projectId: string, dismissed: DismissedSuggestion[]) {
  try {
    localStorage.setItem(dismissedKey(projectId), JSON.stringify(dismissed.slice(-50)));
  } catch {
    // Storage unavailable (private mode etc.): dismissals just won't persist.
  }
}

const COMPLETED_TODO = /^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]\s/m;

/** Shared header for the panels Hallinta opens inside the Todos section. */
function PanelHeader({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</span>
      <Button variant="ghost" size="xs" className="-mr-2" onClick={onClose} aria-label="Close">
        <X />
      </Button>
    </div>
  );
}

/**
 * The Todos section, plus two Hallinta actions: "Suggest" next todos, and
 * "Merge completed" todos into Current Status (reviewed as diffs).
 */
export function TodosSection({
  projectId,
  configured,
  ai,
  addTodo,
  ...section
}: ComponentProps<typeof EditableMarkdown> & {
  projectId: string;
  configured: boolean;
  /** May this person use Hallinta's AI on this project (Suggest, Merge)? */
  ai: boolean;
  addTodo: (heading: string, text: string) => Promise<ActionResult>;
}) {
  const abortRef = useRef<AbortController | null>(null);
  const [mode, setMode] = useState<"suggest" | "merge" | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Cancel any in-flight request and open a fresh panel. */
  function start(next: "suggest" | "merge"): AbortController {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMode(next);
    setItems([]);
    setProposal(null);
    setNotice(null);
    setError(null);
    return controller;
  }

  async function merge() {
    const controller = start("merge");
    if (!configured) {
      setError(AI_NOT_CONFIGURED);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/merge-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as MergeResult | null;
      if (!data) throw new Error(`Request failed (${res.status}).`);
      if ("error" in data) throw new Error(data.error);
      if ("notice" in data) setNotice(data.notice);
      else setProposal(data.proposal);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }

  async function suggest() {
    const controller = start("suggest");
    if (!configured) {
      setError(AI_NOT_CONFIGURED);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, dismissed: loadDismissed(projectId) }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => null)) as SuggestResult | null;
      if (!data) throw new Error(`Request failed (${res.status}).`);
      if ("error" in data) throw new Error(data.error);
      setItems(data.suggestions.map((s) => ({ ...s, status: "open" })));
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }

  function close() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setMode(null);
  }

  const update = (i: number, patch: Partial<Item>) =>
    setItems((list) => list.map((item, j) => (j === i ? { ...item, ...patch } : item)));

  async function add(i: number) {
    const item = items[i];
    update(i, { status: "adding", error: undefined });
    const result = await addTodo(item.heading, item.text);
    update(i, result.ok ? { status: "added" } : { status: "open", error: result.error });
  }

  function dismiss(i: number) {
    const { text, evidence } = items[i];
    saveDismissed(projectId, [...loadDismissed(projectId), { text, quotes: evidence.map((e) => e.quote) }]);
    setItems((list) => list.filter((_, j) => j !== i));
  }

  const mergePanel = mode === "merge" && (
    <div className="mb-5 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <PanelHeader label="Merge completed todos" onClose={close} />
      {loading && <p className="animate-pulse py-2 text-sm text-stone-400">Drafting the status update…</p>}
      {notice && <p className="py-2 text-sm text-stone-500">{notice}</p>}
      {error && <p className="py-2 text-sm text-amber-800">{error}</p>}
      {proposal && <ProposalReview projectId={projectId} proposal={proposal} />}
    </div>
  );

  const suggestPanel = mode === "suggest" && (
    <div className="mb-5 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <PanelHeader label="Hallinta suggests" onClose={close} />

      {loading && <p className="animate-pulse py-2 text-sm text-stone-400">Reading the project…</p>}
      {error && <p className="py-2 text-sm text-amber-800">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="py-2 text-sm text-stone-500">Nothing clearly warranted right now.</p>
      )}

      <ul>
        {items.map((item, i) => (
          <li key={item.text} className="flex gap-3 border-t border-stone-100 py-3 first:border-0">
            <span
              className="mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-sm border border-stone-400"
              aria-hidden
            >
              {item.status === "added" && <Check className="size-3 text-emerald-700" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-stone-900">
                {item.text}
                {item.heading && <span className="ml-2 text-xs text-stone-400">→ {item.heading}</span>}
              </p>
              <p className="mt-0.5 text-sm text-stone-500">{item.why}</p>
              <ul className="mt-1.5 space-y-0.5">
                {item.evidence.map((e) => (
                  <li key={e.file + e.quote} className="truncate text-xs text-stone-400">
                    <Link href={e.href} className="font-medium text-stone-500 hover:underline">
                      {e.title}
                    </Link>{" "}
                    “{e.quote}”
                  </li>
                ))}
              </ul>
              {item.error && <p className="mt-1 text-xs text-amber-800">{item.error}</p>}
            </div>
            <div className="flex shrink-0 items-start gap-1">
              {item.status === "added" ? (
                <span className="text-xs font-medium text-emerald-700">Added</span>
              ) : (
                <>
                  <Button variant="ghost" size="xs" onClick={() => dismiss(i)} disabled={item.status === "adding"}>
                    Dismiss
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => add(i)} disabled={item.status === "adding"}>
                    <Plus />
                    {item.status === "adding" ? "Adding…" : "Add to Todos"}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <EditableMarkdown
      {...section}
      below={suggestPanel || mergePanel}
      actions={
        ai && (
          <>
            {(COMPLETED_TODO.test(section.content) || mode === "merge") && (
              <Button variant="ghost" size="sm" onClick={merge} disabled={loading}>
                <ListChecks />
                {loading && mode === "merge" ? "Drafting…" : "Merge completed"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={suggest} disabled={loading}>
              <Lightbulb />
              {loading && mode === "suggest" ? "Thinking…" : "Suggest"}
            </Button>
          </>
        )
      }
    />
  );
}
