"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { layoutGraph, type GraphEdge, type GraphNode } from "@/lib/graph";
import { cn } from "@/lib/utils";

const WIDTH = 1000;
const HEIGHT = 600;

export function ProjectGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const positions = useMemo(
    () => layoutGraph(nodes.map((n) => n.id), edges, WIDTH, HEIGHT),
    [nodes, edges],
  );
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<GraphEdge | null>(null);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.source, (d.get(e.source) ?? 0) + 1);
      d.set(e.target, (d.get(e.target) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const neighbours = useMemo(() => {
    if (!hoverNode) return null;
    const set = new Set([hoverNode]);
    for (const e of edges) {
      if (e.source === hoverNode) set.add(e.target);
      if (e.target === hoverNode) set.add(e.source);
    }
    return set;
  }, [hoverNode, edges]);

  if (nodes.length === 0) {
    return <p className="py-16 text-center text-stone-500">No active projects to show.</p>;
  }

  const pct = (x: number, y: number) => ({ left: `${(x / WIDTH) * 100}%`, top: `${(y / HEIGHT) * 100}%` });
  const touches = (e: GraphEdge, id: string | null) => id !== null && (e.source === id || e.target === id);

  return (
    <div>
      <div
        className="relative w-full overflow-hidden rounded-lg border border-stone-200 bg-white"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 size-full" aria-hidden>
          {edges.map((e) => {
            const a = positions[e.source];
            const b = positions[e.target];
            const active = touches(e, hoverNode) || hoverEdge === e;
            const dimmed = (hoverNode !== null || hoverEdge !== null) && !active;
            return (
              <g key={`${e.source}-${e.target}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={cn(
                    "transition-[stroke,opacity]",
                    active ? "stroke-stone-600" : "stroke-stone-300",
                    dimmed && "opacity-30",
                  )}
                  strokeWidth={active ? 2 : 1.5}
                />
                {/* Wide invisible stroke makes the edge easy to hover. */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={16}
                  className="pointer-events-auto cursor-help"
                  onMouseEnter={() => setHoverEdge(e)}
                  onMouseLeave={() => setHoverEdge(null)}
                />
              </g>
            );
          })}
        </svg>

        {nodes.map((node) => {
          const p = positions[node.id];
          const size = 10 + Math.min(degree.get(node.id) ?? 0, 5) * 2;
          const dimmed = neighbours !== null && !neighbours.has(node.id);
          const labelLeft = p.x > WIDTH * 0.8;
          return (
            <Link
              key={node.id}
              href={`/projects/${node.id}`}
              style={{
                ...pct(p.x, p.y),
                // Centre the dot (not the label) on the node's position.
                transform: labelLeft
                  ? `translate(calc(-100% + ${size / 2}px), -50%)`
                  : `translate(-${size / 2}px, -50%)`,
              }}
              className={cn(
                "group absolute flex items-center gap-2 outline-none transition-opacity",
                labelLeft && "flex-row-reverse",
                dimmed && "opacity-30",
              )}
              onMouseEnter={() => setHoverNode(node.id)}
              onMouseLeave={() => setHoverNode(null)}
              onFocus={() => setHoverNode(node.id)}
              onBlur={() => setHoverNode(null)}
            >
              <span
                className="shrink-0 rounded-full bg-stone-800 ring-4 ring-white transition-transform group-hover:scale-125 group-focus-visible:scale-125"
                style={{ width: size, height: size }}
              />
              <span className="whitespace-nowrap rounded bg-white/80 px-1 text-sm font-medium text-stone-800 group-hover:underline group-focus-visible:underline">
                {node.name}
              </span>
            </Link>
          );
        })}

        {hoverEdge && (
          <EdgeNote edge={hoverEdge} nodes={nodes} positions={positions} pct={pct} />
        )}
      </div>
      <p className="mt-3 text-xs text-stone-400">
        Links come from each project&apos;s Related Projects section ([[Project Name]]). Hover a link to see why.
      </p>
    </div>
  );
}

function EdgeNote({
  edge,
  nodes,
  positions,
  pct,
}: {
  edge: GraphEdge;
  nodes: GraphNode[];
  positions: ReturnType<typeof layoutGraph>;
  pct: (x: number, y: number) => { left: string; top: string };
}) {
  const a = positions[edge.source];
  const b = positions[edge.target];
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <div
      style={pct((a.x + b.x) / 2, (a.y + b.y) / 2)}
      className="pointer-events-none absolute z-10 w-max max-w-64 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-stone-200 bg-white px-3 py-2 text-xs shadow-md"
    >
      <p className="font-medium text-stone-800">
        {name(edge.source)} — {name(edge.target)}
      </p>
      {edge.notes.length > 0 ? (
        edge.notes.map((note) => (
          <p key={note} className="mt-0.5 text-stone-500">
            {note}
          </p>
        ))
      ) : (
        <p className="mt-0.5 text-stone-400">No note</p>
      )}
    </div>
  );
}
