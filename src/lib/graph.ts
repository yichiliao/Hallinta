import { buildProjectLinks, extractProjectRefs, resolveProjectRef } from "@/lib/markdown";

export interface GraphNode {
  id: string;
  name: string;
  members: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Relationship notes from either side's Related Projects section. */
  notes: string[];
}

/**
 * Undirected project graph from each project's Related Projects Markdown.
 * `all` includes archived projects so references to them resolve (and are then
 * dropped); only `visible` projects become nodes.
 */
export function buildGraph(
  all: { id: string; name: string }[],
  visible: GraphNode[],
  related: Record<string, string>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const links = buildProjectLinks(all);
  const visibleIds = new Set(visible.map((n) => n.id));
  const edges = new Map<string, GraphEdge>();

  for (const node of visible) {
    for (const ref of extractProjectRefs(related[node.id] ?? "")) {
      const target = resolveProjectRef(ref.name, links);
      if (!target || target === node.id || !visibleIds.has(target)) continue;
      const [a, b] = [node.id, target].sort();
      const key = `${a}\u0000${b}`;
      const edge = edges.get(key) ?? { source: a, target: b, notes: [] };
      if (ref.note && !edge.notes.includes(ref.note)) edge.notes.push(ref.note);
      edges.set(key, edge);
    }
  }
  return { nodes: visible, edges: [...edges.values()] };
}

export type Positions = Record<string, { x: number; y: number }>;

/**
 * Deterministic Fruchterman–Reingold layout fitted into width × height, so the
 * picture is stable across reloads.
 */
export function layoutGraph(
  ids: string[],
  edges: { source: string; target: string }[],
  width: number,
  height: number,
): Positions {
  const sorted = [...ids].sort();
  const n = sorted.length;
  const cx = width / 2;
  const cy = height / 2;
  if (n === 0) return {};
  if (n === 1) return { [sorted[0]]: { x: cx, y: cy } };

  const k = Math.sqrt((width * height) / n) * 0.75;
  const pos = sorted.map((_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: cx + Math.cos(angle) * width * 0.3, y: cy + Math.sin(angle) * height * 0.3 };
  });
  const index = new Map(sorted.map((id, i) => [id, i]));
  const pairs = edges.flatMap((e) => {
    const a = index.get(e.source);
    const b = index.get(e.target);
    return a === undefined || b === undefined ? [] : [[a, b] as const];
  });

  let temperature = width / 8;
  for (let iter = 0; iter < 400; iter++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d = Math.max(Math.hypot(dx, dy), 0.01);
        const f = (k * k) / d;
        disp[i].x += (dx / d) * f;
        disp[i].y += (dy / d) * f;
        disp[j].x -= (dx / d) * f;
        disp[j].y -= (dy / d) * f;
      }
    }
    for (const [a, b] of pairs) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const f = (d * d) / k;
      disp[a].x -= (dx / d) * f;
      disp[a].y -= (dy / d) * f;
      disp[b].x += (dx / d) * f;
      disp[b].y += (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      // Gentle pull to the centre keeps unconnected projects from drifting away.
      disp[i].x -= (pos[i].x - cx) * 0.05 * (k / 10);
      disp[i].y -= (pos[i].y - cy) * 0.05 * (k / 10);
      const d = Math.max(Math.hypot(disp[i].x, disp[i].y), 0.01);
      const step = Math.min(d, temperature);
      pos[i].x += (disp[i].x / d) * step;
      pos[i].y += (disp[i].y / d) * step;
    }
    temperature *= 0.985;
  }

  // Fit into the box, leaving room for labels (drawn to the right of dots).
  // Axes scale independently to use the space, within a limited distortion.
  const [padLeft, padRight, padY] = [60, 170, 50];
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const MAX_STRETCH = 1.6;
  let scaleX = (width - padLeft - padRight) / spanX;
  let scaleY = (height - 2 * padY) / spanY;
  scaleX = Math.min(scaleX, scaleY * MAX_STRETCH);
  scaleY = Math.min(scaleY, scaleX * MAX_STRETCH);
  const offsetX = padLeft + (width - padLeft - padRight - spanX * scaleX) / 2;
  const offsetY = (height - spanY * scaleY) / 2;
  return Object.fromEntries(
    sorted.map((id, i) => [
      id,
      { x: offsetX + (pos[i].x - minX) * scaleX, y: offsetY + (pos[i].y - minY) * scaleY },
    ]),
  );
}
