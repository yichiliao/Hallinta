import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyEdits } from "@/lib/ai/edits";
import { lineDiff, removedOpenTodos, removedQuestions, shrinkWarning, type DiffRow } from "@/lib/diff";

type LineRow = Exclude<DiffRow, { type: "skip" }>;

describe("lineDiff", () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
  const after = before.replace("line 10\n", "line 10 edited\nnew line\n");

  test("counts changes and collapses distant context", () => {
    const d = lineDiff(before, after);
    assert.equal(d.added, 2);
    assert.equal(d.removed, 1);
    assert.deepEqual(d.rows[0], { type: "skip", count: 6 });
    assert.deepEqual(d.rows.at(-1), { type: "skip", count: 7 });
  });

  test("keeps old and new line numbers aligned", () => {
    const rows = lineDiff(before, after).rows.filter((r): r is LineRow => r.type !== "skip");
    assert.equal(rows.find((r) => r.type === "del")?.oldLine, 10);
    assert.deepEqual(rows.filter((r) => r.type === "add").map((r) => r.newLine), [10, 11]);
    assert.equal(rows.find((r) => r.type === "same" && r.oldLine === 11)?.newLine, 12);
  });

  test("handles new files and identical input", () => {
    assert.equal(lineDiff("", "- [ ] a\n- [ ] b\n").added, 2);
    const same = lineDiff(before, before);
    assert.equal(same.added + same.removed, 0);
  });
});

describe("review warnings", () => {
  test("shrinkWarning flags large losses only", () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    assert.ok(shrinkWarning(long, "line 1\nline 2\n"));
    assert.equal(shrinkWarning("a\nb\nc\n", "a\n"), null);
    assert.equal(shrinkWarning("", "new\n"), null);
  });

  test("removedOpenTodos flags dropped open todos, not checked-off or done ones", () => {
    const base = "## W\n\n- [ ] Update Figure 3\n- [ ] Write up the cooling result\n- [x] Done thing\n";
    assert.deepEqual(removedOpenTodos(base, base.replace("- [ ] Update Figure 3", "- [x] Update Figure 3")), []);
    assert.deepEqual(
      removedOpenTodos(base, base.replace("- [ ] Write up the cooling result\n", "- [ ] Rewrite introduction\n")),
      ["Write up the cooling result"],
    );
    assert.deepEqual(removedOpenTodos(base, base.replace("- [x] Done thing\n", "")), []);
  });
});

describe("removedQuestions", () => {
  const base = "## Open Questions\n\n- Does the model transfer?\n- Do we need another environment?\n";

  test("flags questions that disappear, not ones that stay or move", () => {
    assert.deepEqual(removedQuestions(base, base.replace("- Does the model transfer?\n", "")), [
      "Does the model transfer?",
    ]);
    assert.deepEqual(removedQuestions(base, "Intro\n" + base), []);
    assert.deepEqual(removedQuestions(base, base.replace("## Open Questions\n\n", "")), []);
  });
});

describe("applyEdits", () => {
  const base = "## A\n\n- [ ] one\n- [ ] two\n";

  test("applies exact, unique replacements in order", () => {
    assert.deepEqual(applyEdits(base, [{ find: "- [ ] one", replace: "- [x] one" }]), {
      content: "## A\n\n- [x] one\n- [ ] two\n",
      skipped: 0,
    });
    assert.equal(
      applyEdits(base, [{ find: "one", replace: "uno" }, { find: "- [ ] uno", replace: "- [x] uno" }]).content,
      "## A\n\n- [x] uno\n- [ ] two\n",
    );
  });

  test("skips missing or ambiguous text rather than guessing", () => {
    assert.deepEqual(applyEdits(base, [{ find: "missing", replace: "x" }]), { content: base, skipped: 1 });
    assert.deepEqual(applyEdits(base, [{ find: "- [ ] ", replace: "x" }]), { content: base, skipped: 1 });
  });

  test("empty find only fills an empty file", () => {
    assert.deepEqual(applyEdits("", [{ find: "", replace: "new\n" }]), { content: "new\n", skipped: 0 });
    assert.deepEqual(applyEdits(base, [{ find: "", replace: "clobber" }]), { content: base, skipped: 1 });
  });
});
