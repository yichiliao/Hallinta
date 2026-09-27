import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProjectContext } from "@/lib/ai/context";
import { groundSuggestions } from "@/lib/ai/grounding";

const context = {
  name: "Test",
  members: [],
  created: "",
  meetings: [],
  documents: [
    {
      file: "todos.md",
      title: "Todos",
      href: "/p#todos",
      lines: [
        { text: "## Writing", line: 1 },
        { text: "- [ ] Update Figure 3", line: 2 },
      ],
    },
    {
      file: "artifacts.md",
      title: "Artifacts",
      href: "/p#artifacts",
      lines: [
        { text: "### Figure 3", line: 1 },
        { text: "- Drone survey missing", line: 2 },
      ],
    },
    {
      file: "meetings/2026-09-27.md",
      title: "Meeting · Sep 27, 2026",
      href: "/p/m",
      lines: [{ text: "- Is the **drone survey** necessary?", line: 5 }],
    },
  ],
  sections: { todos: "## Writing\n- [ ] Update Figure 3\n- [x] Deploy the Riverside sensors\n" },
} as unknown as ProjectContext;

const meetingEvidence = [{ file: "meetings/2026-09-27.md", quote: "Is the drone survey necessary" }];
const suggestion = (text: string, evidence: unknown = meetingEvidence, heading = "") => ({
  text,
  heading,
  why: "because",
  evidence,
});

describe("groundSuggestions", () => {
  test("keeps grounded suggestions and cleans headings", () => {
    const out = groundSuggestions(
      [suggestion("Decide whether the drone survey is needed", meetingEvidence, "## Experiments")],
      context,
      [],
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].heading, "Experiments");
    assert.equal(out[0].evidence[0].href, "/p/m");
  });

  test("drops existing todos (open or done), repeats, and malformed input", () => {
    const out = groundSuggestions(
      [
        suggestion("Update figure 3."),
        suggestion("Deploy the Riverside sensors"),
        suggestion("Plan ablation"),
        suggestion("Plan ablation"),
        { text: 42 },
      ],
      context,
      [],
    );
    assert.deepEqual(out.map((s) => s.text), ["Plan ablation"]);
    assert.deepEqual(groundSuggestions("nope", context, []), []);
  });

  test("drops ungrounded evidence: invented quotes, unknown files, trivial quotes", () => {
    const out = groundSuggestions(
      [
        suggestion("Read more papers", [{ file: "meetings/2026-09-27.md", quote: "we should read papers" }]),
        suggestion("Unknown file", [{ file: "../secret.md", quote: "Is the drone survey necessary" }]),
        suggestion("Short quote", [{ file: "todos.md", quote: "Figure" }]),
      ],
      context,
      [],
    );
    assert.deepEqual(out, []);
  });

  test("drops dismissed ideas even when reworded (shared or containing evidence)", () => {
    const dismissed = [
      { text: "Decide on the drone survey", quotes: ["Is the drone survey necessary?", "Drone survey missing"] },
    ];
    const out = groundSuggestions(
      [
        suggestion("Resolve whether drone survey is necessary"),
        suggestion("Decide on the baseline", [...meetingEvidence, { file: "todos.md", quote: "Update Figure 3" }]),
        suggestion("Verify baseline", [{ file: "artifacts.md", quote: "### Figure 3\n\n- Drone survey missing" }]),
        suggestion("Finish Figure 3", [{ file: "todos.md", quote: "Update Figure 3" }]),
      ],
      context,
      dismissed,
    );
    assert.deepEqual(out.map((s) => s.text), ["Finish Figure 3"]);
  });

  test("returns at most three suggestions", () => {
    const many = ["A one", "B two", "C three", "D four"].map((t) => suggestion(t));
    assert.equal(groundSuggestions(many, context, []).length, 3);
  });
});
