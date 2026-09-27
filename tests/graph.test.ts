import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildGraph, layoutGraph } from "@/lib/graph";

describe("buildGraph", () => {
  const all = [
    { id: "a", name: "Alpha" },
    { id: "b", name: "Beta" },
    { id: "c", name: "Gamma" },
    { id: "z", name: "Zed" },
  ];
  const visible = all.filter((p) => p.id !== "z").map((p) => ({ ...p, members: [] }));

  test("merges both directions into one edge with both notes", () => {
    const g = buildGraph(all, visible, {
      a: "- [[Beta]]\n  - shares code",
      b: "- [[alpha]] — same infra",
    });
    assert.deepEqual(g.edges, [{ source: "a", target: "b", notes: ["shares code", "same infra"] }]);
  });

  test("drops links to hidden (archived), unknown, and self", () => {
    const g = buildGraph(all, visible, { a: "- [[Zed]]\n- [[Nowhere]]\n- [[Alpha]]" });
    assert.deepEqual(g.edges, []);
    assert.equal(g.nodes.length, 3);
  });
});

describe("layoutGraph", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
  ];
  const positions = layoutGraph(ids, edges, 1000, 600);

  test("is deterministic regardless of input order", () => {
    assert.deepEqual(positions, layoutGraph([...ids].reverse(), edges, 1000, 600));
  });

  test("stays inside the box, leaving room for labels on the right", () => {
    for (const { x, y } of Object.values(positions)) {
      assert.ok(x >= 59 && x <= 831 && y >= 49 && y <= 551, `${x},${y}`);
    }
  });

  test("places linked projects closer than unlinked ones", () => {
    const dist = (u: string, v: string) =>
      Math.hypot(positions[u].x - positions[v].x, positions[u].y - positions[v].y);
    assert.ok(dist("a", "b") < dist("d", "e"));
  });

  test("handles zero and one node", () => {
    assert.deepEqual(layoutGraph([], [], 1000, 600), {});
    assert.deepEqual(layoutGraph(["solo"], [], 1000, 600), { solo: { x: 500, y: 300 } });
  });
});
