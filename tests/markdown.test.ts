import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Element, Root } from "hast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import {
  buildProjectLinks,
  extractProjectRefs,
  insertTodo,
  linkifyProjectRefs,
  rehypeTaskLines,
  removeCompletedTodos,
  setTaskAt,
  splitByH2,
} from "@/lib/markdown";
import { readExample } from "./helpers";

/** Checkbox line numbers exactly as the Markdown component receives them. */
function checkboxLines(md: string): number[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeTaskLines);
  const tree = processor.runSync(processor.parse(md)) as Root;
  const lines: number[] = [];
  const visit = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "input") lines.push(Number(child.properties.dataLine));
      visit(child);
    }
  };
  visit(tree);
  return lines;
}

/** Every rendered checkbox must map to a line setTaskAt can toggle. */
function assertAllTogglable(md: string, expected: number) {
  const lines = checkboxLines(md);
  assert.equal(lines.length, expected, `checkbox count in:\n${md}`);
  for (const line of lines) {
    assert.notEqual(setTaskAt(md, line, true), null, `line ${line}: ${JSON.stringify(md.split("\n")[line - 1])}`);
  }
}

describe("task checkboxes", () => {
  test("map to source lines in the example todos", () => {
    const md = readExample("heat-islands/todos.md");
    assert.deepEqual(checkboxLines(md), [3, 4, 8, 9, 13]);
    assertAllTogglable(md, 5);
  });

  test("map correctly for nested, loose, ordered, quoted and CRLF lists", () => {
    assertAllTogglable("- [ ] a\n  - [x] nested\n  - [ ] nested2\n- [ ] b", 4);
    assertAllTogglable("- [ ] loose a\n\n- [x] loose b\n\n  continued para", 2);
    assertAllTogglable("1. [ ] first\n2. [x] second", 2);
    assertAllTogglable("> - [ ] quoted", 1);
    assertAllTogglable("- [ ] a\r\n- [x] b\r\n", 2);
    assertAllTogglable("* [ ] star\n+ [X] plus", 2);
  });

  test("map correctly in every example file with tasks", () => {
    for (const file of ["heat-islands/todos.md", "heat-islands/meetings/2026-09-13.md", "heat-islands/meetings/2026-09-27.md"]) {
      const md = readExample(file);
      assertAllTogglable(md, (md.match(/^\s*[-*+] \[[ xX]\]/gm) ?? []).length);
    }
  });

  test("setTaskAt flips only the target line", () => {
    const md = "## A\n\n- [ ] one\n- [x] two\n";
    assert.equal(setTaskAt(md, 3, true), "## A\n\n- [x] one\n- [x] two\n");
    assert.equal(setTaskAt(md, 4, false), "## A\n\n- [ ] one\n- [ ] two\n");
    assert.equal(setTaskAt(md, 1, true), null);
    assert.equal(setTaskAt(md, 99, true), null);
    assert.equal(setTaskAt("- [ ] a\r\n- [ ] b", 1, true), "- [x] a\r\n- [ ] b");
  });
});

describe("splitByH2", () => {
  test("offsets map section checkboxes back to file lines", () => {
    const md = "Intro\n\n## Ongoing\n\n### Fig 3\n\n- [ ] missing baseline\n\n## Finished\n\n- [x] table\n";
    const sections = splitByH2(md);
    assert.deepEqual(sections.map((s) => s.heading), [null, "Ongoing", "Finished"]);
    for (const s of sections.slice(1)) {
      for (const local of checkboxLines(s.body)) {
        assert.notEqual(setTaskAt(md, local + s.bodyStart - 1, true), null);
      }
    }
  });

  test("ignores headings inside code fences", () => {
    assert.equal(splitByH2("```\n## not a heading\n```").length, 1);
  });
});

describe("project references", () => {
  const links = buildProjectLinks([
    { id: "sensor-kit", name: "Open Sensor Kit" },
    { id: "cooling-policy", name: "Cooling Policy Study" },
  ]);

  test("linkify resolves names and ids, marks missing, skips fences, keeps line count", () => {
    const md = "- [[Open Sensor Kit]]\n- [[cooling policy study]]\n- [[Nope]]\n```\n[[Open Sensor Kit]]\n```";
    const out = linkifyProjectRefs(md, links);
    assert.match(out, /\[Open Sensor Kit\]\(\/projects\/sensor-kit\)/);
    assert.match(out, /\[cooling policy study\]\(\/projects\/cooling-policy\)/);
    assert.match(out, /\[Nope\]\(#hallinta-missing-project\)/);
    assert.match(out, /```\n\[\[Open Sensor Kit\]\]\n```/);
    assert.equal(out.split("\n").length, md.split("\n").length);
  });

  test("extracts references with their notes", () => {
    const refs = extractProjectRefs(
      "- [[Open Sensor Kit]]\n  - Shared sensor hardware.\n- [[Cooling Policy Study]] — uses our heat maps\n```\n[[Hidden]]\n```\nSee [[X]] and [[Y]].",
    );
    assert.deepEqual(refs, [
      { name: "Open Sensor Kit", note: "Shared sensor hardware." },
      { name: "Cooling Policy Study", note: "uses our heat maps" },
      { name: "X", note: "See X and Y." },
      { name: "Y", note: "See X and Y." },
    ]);
  });
});

describe("insertTodo", () => {
  const todos = readExample("heat-islands/todos.md");

  test("appends to the end of an existing section", () => {
    assert.match(
      insertTodo(todos, "Analysis", "Rewrite the introduction"),
      /- \[ \] Write up the night-time cooling result\n- \[ \] Rewrite the introduction\n\n## Release/,
    );
    assert.match(insertTodo(todos, "release", "Tag v1"), /- \[ \] Publish the cleaned sensor dataset\n- \[ \] Tag v1\n$/);
  });

  test("creates a missing section at the end", () => {
    assert.match(
      insertTodo(todos, "Outreach", "Present at the city workshop"),
      /- \[ \] Publish the cleaned sensor dataset\n\n## Outreach\n\n- \[ \] Present at the city workshop\n$/,
    );
  });

  test("handles empty files, empty headings, and empty sections", () => {
    assert.equal(insertTodo("", "Experiments", "Run it"), "## Experiments\n\n- [ ] Run it\n");
    assert.equal(insertTodo("", "", "Run it"), "- [ ] Run it\n");
    assert.equal(insertTodo("- [ ] a\n", "", "b"), "- [ ] a\n- [ ] b\n");
    assert.equal(
      insertTodo("## Ongoing\n\n## Done\n- [x] z\n", "Ongoing", "q"),
      "## Ongoing\n\n- [ ] q\n\n## Done\n- [x] z\n",
    );
  });

  test("ignores fenced headings and keeps sub-items attached", () => {
    assert.match(insertTodo("```\n## Writing\n```\n", "Writing", "x"), /```\n\n## Writing\n\n- \[ \] x\n$/);
    assert.equal(insertTodo("## A\n- [ ] one\n  - sub\n", "A", "two"), "## A\n- [ ] one\n  - sub\n- [ ] two\n");
  });
});

describe("removeCompletedTodos", () => {
  test("removes checked items from the example todos", () => {
    const { content, removed } = removeCompletedTodos(readExample("heat-islands/todos.md"));
    assert.deepEqual(removed, ["Deploy 40 sensors in the Riverside district"]);
    assert.doesNotMatch(content, /Deploy 40 sensors/);
    assert.match(content, /## Fieldwork\n\n- \[ \] Calibrate the second batch of street sensors\n\n## Analysis/);
  });

  test("takes sub-items along and tidies blank lines left behind", () => {
    const md = "## A\n\n- [ ] keep\n\n## B\n\n- [x] done\n  - detail one\n  - detail two\n\n## C\n\n- [X] also done\n";
    const { content, removed } = removeCompletedTodos(md);
    assert.deepEqual(removed, ["done\n- detail one\n- detail two", "also done"]);
    assert.equal(content, "## A\n\n- [ ] keep\n\n## B\n\n## C\n\n");
  });

  test("keeps a checked item that still has an open sub-task; removes checked children alone", () => {
    const md = "- [x] parent\n  - [ ] open child\n- [ ] open parent\n  - [x] done child\n";
    const { content, removed } = removeCompletedTodos(md);
    assert.deepEqual(removed, ["done child"]);
    assert.equal(content, "- [x] parent\n  - [ ] open child\n- [ ] open parent\n");
  });

  test("ignores fenced code and reports nothing when nothing is done", () => {
    const md = "```\n- [x] not a real todo\n```\n- [ ] open\n";
    assert.deepEqual(removeCompletedTodos(md), { content: md, removed: [] });
  });
});
