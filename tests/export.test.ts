import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { escapeHtml, exportFilename, exportMeetingHtml, exportProjectHtml, markdownToHtml } from "@/lib/export";
import { plainProjectRefs } from "@/lib/markdown";
import { exampleStore, readExample } from "./helpers";

describe("markdownToHtml", () => {
  test("renders GFM: task lists and tables", () => {
    const html = markdownToHtml("- [x] done\n- [ ] open\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    assert.match(html, /<input type="checkbox" checked disabled>/);
    assert.match(html, /<table>/);
  });

  test("drops raw HTML and scripts", () => {
    const html = markdownToHtml('Hi <script>alert(1)</script> <img src=x onerror="alert(1)">\n\n<div onclick="x">block</div>');
    assert.doesNotMatch(html, /<script|onerror|onclick|<div/);
  });

  test("keeps safe links, strips unsafe ones", () => {
    const html = markdownToHtml("[ok](https://example.com) [mail](mailto:a@b.c) [bad](javascript:alert(1)) [rel](/projects/x)");
    assert.match(html, /href="https:\/\/example.com"/);
    assert.match(html, /href="mailto:a@b.c"/);
    assert.doesNotMatch(html, /javascript:/);
    assert.doesNotMatch(html, /\/projects\/x/);
  });

  test("turns [[Project]] references into plain names, but not inside code", () => {
    assert.equal(plainProjectRefs("- [[Open Sensor Kit]]\n```\n[[Keep]]\n```"), "- Open Sensor Kit\n```\n[[Keep]]\n```");
    assert.match(markdownToHtml("- [[Open Sensor Kit]]\n  - shared hardware"), /<li>Open Sensor Kit/);
  });
});

describe("exportProjectHtml", () => {
  const { store } = exampleStore();

  test("includes every non-empty section in page order, and no meeting notes", async () => {
    const html = exportProjectHtml(await store.getProject("heat-islands"), "2026-09-28");
    const order = ["Project Description", "Current Status", "Related Papers", "Artifacts", "Todos", "Timeline"].map(
      (label) => html.indexOf(`>${label}<`),
    );
    assert.ok(order.every((i) => i > 0), "all sections present");
    assert.deepEqual([...order].sort((a, b) => a - b), order, "sections in page order");
    assert.doesNotMatch(html, /Weekly Meeting|Meeting Notes/);
    assert.match(html, /Project snapshot · Sep 28, 2026/);
    assert.match(html, /Ana Rivera · Mina Park · Tomás Silva/);
    assert.doesNotMatch(html, /<script/i);
  });

  test("skips empty sections", async () => {
    const html = exportProjectHtml(await store.getProject("sensor-kit"), "2026-09-28");
    assert.match(html, />Project Description</);
    assert.doesNotMatch(html, />Current Status</);
  });

  test("escapes the project name and members", async () => {
    const project = { ...(await store.getProject("sensor-kit")), name: "<b>Evil</b>", members: ['"x" & y'] };
    const html = exportProjectHtml(project, "2026-09-28");
    assert.doesNotMatch(html, /<b>Evil<\/b>/);
    assert.match(html, /&lt;b&gt;Evil&lt;\/b&gt;/);
    assert.match(html, /&quot;x&quot; &amp; y/);
  });
});

describe("exportMeetingHtml", () => {
  test("renders one meeting with its heading as the title", () => {
    const content = readExample("heat-islands/meetings/2026-09-27.md");
    const html = exportMeetingHtml({ name: "Urban Heat Islands" }, { date: "2026-09-27", content }, "2026-09-28");
    assert.match(html, /<title>Weekly Meeting — 2026-09-27 · Urban Heat Islands<\/title>/);
    assert.match(html, /Urban Heat Islands · Meeting of Sep 27, 2026 · Exported Sep 28, 2026/);
    assert.match(html, /Lead with the block-level characterization of night-time heat/);
    assert.equal((html.match(/Weekly Meeting — 2026-09-27/g) ?? []).length, 2, "heading appears as title and header only");
  });
});

describe("helpers", () => {
  test("escapeHtml and exportFilename", () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    assert.equal(exportFilename("heat-islands", "2026-09-28"), "heat-islands-2026-09-28.html");
    assert.equal(exportFilename("a b", "c\"d"), "a-b-c-d.html");
  });
});
