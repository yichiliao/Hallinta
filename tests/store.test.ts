import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { LocalProjectStore } from "@/lib/store/local";
import { StoreError } from "@/lib/store/types";
import { exampleStore } from "./helpers";

const isCode = (code: StoreError["code"]) => (e: unknown) => e instanceof StoreError && e.code === code;

describe("LocalProjectStore: reading", () => {
  const { store } = exampleStore();

  test("lists projects sorted by name", async () => {
    const projects = await store.listProjects();
    assert.deepEqual(
      projects.map((p) => [p.id, p.archived]),
      [["air-quality", false], ["cooling-policy", false], ["sensor-kit", false], ["tree-census", false], ["heat-islands", false]],
    );
  });

  test("loads a project with documents and meetings (newest first)", async () => {
    const p = await store.getProject("heat-islands");
    assert.equal(p.name, "Urban Heat Islands");
    assert.deepEqual(p.members, ["Ana Rivera", "Mina Park", "Tomás Silva"]);
    assert.deepEqual(p.meetings.map((m) => m.id), ["2026-09-27", "2026-09-20", "2026-09-13"]);
    assert.equal(p.meetings[0].title, "Weekly Meeting — 2026-09-27");
    assert.match(p.documents.status, /refocusing the paper/);
  });

  test("a missing document reads as empty", async () => {
    assert.equal(await store.readDocument("sensor-kit", "status"), "");
  });

  test("rejects invalid ids and path traversal", async () => {
    for (const bad of ["../etc", "HEAT", "a/b", "", "archive"]) {
      await assert.rejects(store.readDocument(bad, "status"), isCode("invalid"), bad);
    }
    await assert.rejects(store.readDocument("heat-islands", "../project"), isCode("invalid"));
    await assert.rejects(store.writeDocument("heat-islands", "project.json", "x"), isCode("invalid"));
    await assert.rejects(store.readMeeting("heat-islands", "../todos"), isCode("invalid"));
  });

  test("unknown projects are not found and nothing is created", async () => {
    await assert.rejects(store.getProject("nope"), isCode("not_found"));
    await assert.rejects(store.writeDocument("nope", "status", "x"), isCode("not_found"));
  });
});

describe("LocalProjectStore: writing", () => {
  const { store, root } = exampleStore();

  test("writes documents atomically without leaving temp files", async () => {
    await store.writeDocument("heat-islands", "status", "new status\n");
    assert.equal(await store.readDocument("heat-islands", "status"), "new status\n");
    assert.deepEqual(readdirSync(path.join(root, "heat-islands")).filter((f) => f.endsWith(".tmp")), []);
  });

  test("meeting create / duplicate / update / delete", async () => {
    await store.createMeeting("heat-islands", "2026-10-04", "# Weekly Meeting — 2026-10-04\n");
    await assert.rejects(store.createMeeting("heat-islands", "2026-10-04", "x"), isCode("exists"));
    await store.createMeeting("heat-islands", "2026-10-04-2", "# Follow-up\n");
    const ids = (await store.listMeetings("heat-islands")).map((m) => m.id);
    assert.deepEqual(ids.slice(0, 2), ["2026-10-04-2", "2026-10-04"]);
    await store.updateMeeting("heat-islands", "2026-10-04", "# Changed\n");
    assert.equal(await store.readMeeting("heat-islands", "2026-10-04"), "# Changed\n");
    await store.deleteMeeting("heat-islands", "2026-10-04");
    await assert.rejects(store.readMeeting("heat-islands", "2026-10-04"), isCode("not_found"));
    await assert.rejects(store.updateMeeting("heat-islands", "2026-10-04", "x"), isCode("not_found"));
  });

  test("creates a project with templates and rejects duplicates", async () => {
    await store.createProject({ id: "new-one", name: "New One", members: ["A"], created: "2026-09-28" });
    const p = await store.getProject("new-one");
    assert.equal(p.name, "New One");
    assert.match(p.documents.artifacts, /## Ongoing/);
    await assert.rejects(
      store.createProject({ id: "new-one", name: "x", members: [], created: "" }),
      isCode("exists"),
    );
  });

  test("creates the root folder on first project", async () => {
    const fresh = new LocalProjectStore(path.join(root, "does/not/exist"));
    assert.deepEqual(await fresh.listProjects(), []);
    await fresh.createProject({ id: "first", name: "First", members: [], created: "" });
    assert.equal((await fresh.listProjects()).length, 1);
  });

  test("reads and writes per-project access; renaming keeps it", async () => {
    assert.deepEqual((await store.getProjectSummary("heat-islands")).access, {});
    await store.setProjectAccess("heat-islands", { "student-a": "edit", ext: "view", bad: "owner" as never });
    assert.deepEqual((await store.getProjectSummary("heat-islands")).access, { "student-a": "edit", ext: "view" });
    await store.updateProject("heat-islands", { name: "Urban Heat Islands", members: ["Ana Rivera"] });
    assert.deepEqual((await store.getProject("heat-islands")).access, { "student-a": "edit", ext: "view" });
    await store.setProjectAccess("heat-islands", {});
  });

  test("updateMembership writes name, free-text members, and access together", async () => {
    await store.updateMembership("cooling-policy", { name: "Cooling Policy Study", members: ["Old Name"], access: { u1: "view" } });
    const p = await store.getProjectSummary("cooling-policy");
    assert.deepEqual([p.name, p.members, p.access], ["Cooling Policy Study", ["Old Name"], { u1: "view" }]);
    assert.equal(JSON.parse(readFileSync(path.join(root, "cooling-policy/project.json"), "utf8")).created, "2026-05-15");
  });

  test("ignores malformed access in project.json", async () => {
    const file = path.join(root, "sensor-kit/project.json");
    const json = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...json, access: { a: "edit", b: "superuser", c: 3 } }));
    assert.deepEqual((await store.getProjectSummary("sensor-kit")).access, { a: "edit" });
    writeFileSync(file, JSON.stringify({ ...json, access: "everyone" }));
    assert.deepEqual((await store.getProjectSummary("sensor-kit")).access, {});
  });

  test("updates name and members, preserving other fields", async () => {
    await store.updateProject("heat-islands", { name: "Urban Heat Islands v2", members: ["Ana Rivera", "Leo Chen"] });
    const p = await store.getProject("heat-islands");
    assert.equal(p.name, "Urban Heat Islands v2");
    assert.deepEqual(p.members, ["Ana Rivera", "Leo Chen"]);
    const json = JSON.parse(readFileSync(path.join(root, "heat-islands/project.json"), "utf8"));
    assert.equal(json.id, "heat-islands");
    assert.equal(json.created, "2026-09-01");
  });
});

describe("LocalProjectStore: archiving", () => {
  const { store, root } = exampleStore();

  test("archive moves the folder; the project stays usable at the same id", async () => {
    await store.archiveProject("sensor-kit");
    assert.ok(existsSync(path.join(root, "archive/sensor-kit/project.json")));
    assert.ok(!existsSync(path.join(root, "sensor-kit")));
    const kit = (await store.listProjects()).find((p) => p.id === "sensor-kit");
    assert.equal(kit?.archived, true);
    await store.writeDocument("sensor-kit", "status", "still editable\n");
    assert.equal(await store.readDocument("sensor-kit", "status"), "still editable\n");
    await store.createMeeting("sensor-kit", "2026-10-01", "# m\n");
    assert.equal((await store.listMeetings("sensor-kit")).length, 1);
  });

  test("ids stay unique across active and archived", async () => {
    await assert.rejects(store.archiveProject("sensor-kit"), isCode("invalid"));
    await assert.rejects(
      store.createProject({ id: "sensor-kit", name: "x", members: [], created: "" }),
      isCode("exists"),
    );
    await assert.rejects(
      store.createProject({ id: "archive", name: "x", members: [], created: "" }),
      isCode("invalid"),
    );
  });

  test("unarchive moves it back", async () => {
    await store.unarchiveProject("sensor-kit");
    assert.ok(existsSync(path.join(root, "sensor-kit/status.md")));
    assert.equal((await store.getProject("sensor-kit")).archived, false);
    await assert.rejects(store.unarchiveProject("sensor-kit"), isCode("invalid"));
    await assert.rejects(store.archiveProject("nope"), isCode("not_found"));
  });
});
