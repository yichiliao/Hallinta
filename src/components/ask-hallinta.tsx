"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CornerDownLeft, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown";
import { ProposalReview } from "@/components/proposal-review";
import { AI_NOT_CONFIGURED, type AnswerSource, type AskEvent, type Proposal } from "@/lib/ai/types";
import type { ProjectLinks } from "@/lib/markdown";

interface Segment {
  text: string;
  /** 1-based indices into the sources list. */
  cites: number[];
}

/** Join segments into Markdown, placing citation markers before trailing whitespace. */
function answerMarkdown(segments: Segment[]): string {
  return segments
    .map(({ text, cites }) => {
      if (cites.length === 0) return text;
      const markers = cites.map((n) => ` [${n}](#cite-${n})`).join("");
      return text.replace(/(\s*)$/, `${markers}$1`);
    })
    .join("");
}

function updateLast(segments: Segment[], update: (s: Segment) => Segment): Segment[] {
  const last = segments.at(-1) ?? { text: "", cites: [] };
  return [...segments.slice(0, -1), update(last)];
}

export function AskHallinta({
  projectId,
  configured,
  projectLinks,
}: {
  projectId: string;
  configured: boolean;
  projectLinks: ProjectLinks;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [sources, setSources] = useState<AnswerSource[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  // "/" focuses the input from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || target.closest("input, textarea, [contenteditable=true], .cm-editor")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  function reset(q: string | null) {
    stop();
    setAsked(q);
    setSegments([]);
    setSources([]);
    setNotice(null);
    setError(null);
    setDrafting(false);
    setProposal(null);
  }

  async function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || streaming) return;
    reset(q);
    if (!configured) {
      setError(AI_NOT_CONFIGURED);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const sourceNumbers = new Map<string, number>();
    const handle = (event: AskEvent) => {
      switch (event.type) {
        case "segment":
          setSegments((s) => [...s, { text: "", cites: [] }]);
          break;
        case "text":
          setSegments((s) => updateLast(s, (last) => ({ ...last, text: last.text + event.text })));
          break;
        case "citation": {
          let n = sourceNumbers.get(event.source.key);
          if (n === undefined) {
            n = sourceNumbers.size + 1;
            sourceNumbers.set(event.source.key, n);
            setSources((s) => [...s, event.source]);
          }
          const num = n;
          setSegments((s) =>
            updateLast(s, (last) =>
              last.cites.includes(num) ? last : { ...last, cites: [...last.cites, num] },
            ),
          );
          break;
        }
        case "drafting":
          setDrafting(true);
          break;
        case "proposal":
          setDrafting(false);
          setProposal(event.proposal);
          break;
        case "notice":
          setNotice(event.message);
          break;
        case "error":
          setError(event.message);
          break;
      }
    };

    setStreaming(true);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, question: q }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed (${res.status}).`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (line.trim()) handle(JSON.parse(line) as AskEvent);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
        setDrafting(false);
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  const answer = answerMarkdown(segments);

  return (
    <div className="mt-6">
      <form onSubmit={ask} className="relative">
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Hallinta, or tell it what happened…"
          aria-label="Ask Hallinta about this project"
          className="h-11 w-full rounded-lg border border-stone-300 bg-white pl-4 pr-12 text-[15px] shadow-sm outline-none placeholder:text-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-stone-200 px-1.5 text-xs text-stone-400">
          {question ? <CornerDownLeft className="my-0.5 size-3" /> : "/"}
        </kbd>
      </form>

      {asked !== null && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-4">
            <p className="text-sm font-medium text-stone-500">{asked}</p>
            <div className="-mr-2 -mt-1 flex shrink-0 gap-1">
              {streaming && (
                <Button variant="ghost" size="xs" onClick={stop}>
                  <Square />
                  Stop
                </Button>
              )}
              <Button variant="ghost" size="xs" onClick={() => reset(null)} aria-label="Close answer">
                <X />
              </Button>
            </div>
          </div>

          {answer.trim() ? (
            <Markdown content={answer} projectLinks={projectLinks} />
          ) : (
            streaming && <p className="animate-pulse text-sm text-stone-400">Reading the project…</p>
          )}
          {drafting && (
            <p className="mt-3 animate-pulse text-sm text-stone-400">Drafting changes…</p>
          )}
          {notice && <p className="mt-3 text-sm text-stone-500">{notice}</p>}
          {error && <p className="mt-3 text-sm text-amber-800">{error}</p>}

          {proposal && <ProposalReview projectId={projectId} proposal={proposal} />}

          {sources.length > 0 && (
            <ol className="mt-5 space-y-2.5 border-t border-stone-100 pt-4 text-sm">
              {sources.map((s, i) => (
                <li key={s.key} id={`source-${i + 1}`} className="flex gap-3 scroll-mt-6">
                  <span className="w-4 shrink-0 text-right tabular-nums text-stone-400">{i + 1}</span>
                  <div className="min-w-0">
                    <Link href={s.href} className="font-medium text-stone-800 hover:underline">
                      {s.title}
                    </Link>
                    <span className="ml-2 text-xs text-stone-400">
                      {s.file}:{s.startLine}
                      {s.endLine !== s.startLine && `–${s.endLine}`}
                    </span>
                    <p className="line-clamp-2 text-stone-500">{s.quote}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
