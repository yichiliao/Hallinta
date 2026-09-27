import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  SOLO_ROOT,
  canEdit,
  canManageAccounts,
  canManageProjects,
  canUseAi,
  accessForKnownUsers,
  canView,
  parseAccessMap,
  projectAccess,
  projectPermissions,
  removalError,
  roleChangeError,
  type Actor,
} from "@/lib/auth/permissions";

const root: Actor = { id: "pi", name: "PI", role: "root" };
const admin: Actor = { id: "postdoc", name: "Postdoc", role: "admin" };
const student: Actor = { id: "student-a", name: "Mina Park", role: "regular" };
const collaborator: Actor = { id: "ext", name: "External", role: "regular" };
const stranger: Actor = { id: "nobody", name: "Nobody", role: "regular" };

const project = { access: parseAccessMap({ "student-a": "edit", ext: "view" }) };

describe("project access", () => {
  test("root and admins can edit every project, even with no grants", () => {
    for (const actor of [root, admin, SOLO_ROOT]) {
      assert.equal(projectAccess(actor, { access: {} }), "edit", actor.id);
    }
  });

  test("regular users get exactly their grant", () => {
    assert.equal(projectAccess(student, project), "edit");
    assert.equal(projectAccess(collaborator, project), "view");
    assert.equal(projectAccess(stranger, project), null);
  });

  test("view vs edit vs AI", () => {
    assert.deepEqual([canView(student, project), canEdit(student, project), canUseAi(student, project)], [true, true, true]);
    assert.deepEqual(
      [canView(collaborator, project), canEdit(collaborator, project), canUseAi(collaborator, project)],
      [true, false, false],
      "view-only users can read but never spend AI credits",
    );
    assert.deepEqual([canView(stranger, project), canEdit(stranger, project), canUseAi(stranger, project)], [false, false, false]);
  });

  test("a grant for one user never leaks to another with a similar id", () => {
    assert.equal(projectAccess({ ...student, id: "student-a2" }, project), null);
    assert.equal(projectAccess({ ...student, id: "Student-A" }, project), null);
  });

  test("an admin grant in project.json does not elevate a regular user beyond edit", () => {
    const weird = { access: parseAccessMap({ "student-a": "admin", ext: "root" }) };
    assert.equal(projectAccess(student, weird), null);
    assert.equal(projectAccess(collaborator, weird), null);
  });
});

describe("parseAccessMap", () => {
  test("keeps only valid grants from untrusted JSON", () => {
    assert.deepEqual(parseAccessMap({ a: "view", b: "edit", c: "owner", d: 1, "": "edit" }), { a: "view", b: "edit" });
    for (const junk of [null, undefined, "edit", ["a"], 42]) assert.deepEqual(parseAccessMap(junk), {});
  });
});

describe("accessForKnownUsers", () => {
  test("drops grants for unknown or removed accounts and invalid levels", () => {
    assert.deepEqual(
      accessForKnownUsers({ a: "edit", gone: "view", b: "owner" as never, c: "view" }, ["a", "b", "c"]),
      { a: "edit", c: "view" },
    );
  });
});

describe("role capabilities", () => {
  test("only root and admins manage projects", () => {
    assert.deepEqual([root, admin, student, SOLO_ROOT].map(canManageProjects), [true, true, false, true]);
  });

  test("only root manages accounts", () => {
    assert.deepEqual([root, admin, student, SOLO_ROOT].map(canManageAccounts), [true, false, false, true]);
  });

  test("projectPermissions summarises everything the UI needs", () => {
    assert.deepEqual(projectPermissions(collaborator, project), { view: true, edit: false, ai: false, manage: false });
    assert.deepEqual(projectPermissions(admin, project), { view: true, edit: true, ai: true, manage: true });
  });
});

describe("role changes and removal", () => {
  test("only root may change roles", () => {
    assert.match(roleChangeError(admin, student, "admin", 1) ?? "", /Only root/);
    assert.match(roleChangeError(student, student, "root", 1) ?? "", /Only root/);
    assert.equal(roleChangeError(root, student, "admin", 1), null);
    assert.equal(roleChangeError(root, admin, "root", 1), null, "root can promote a co-PI");
  });

  test("the last root cannot be demoted or removed", () => {
    assert.match(roleChangeError(root, root, "admin", 1) ?? "", /at least one root/);
    assert.equal(roleChangeError(root, root, "admin", 2), null, "fine when another root exists");
    assert.match(removalError(root, root, 1) ?? "", /last root/);
    assert.equal(removalError(root, root, 2), null);
    assert.match(removalError(admin, student, 1) ?? "", /Only root/);
  });
});
