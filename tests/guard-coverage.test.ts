import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

/*
 * Structural safety net for CLAUDE.md §32.6: every server action, route handler,
 * and page must call an authorization helper from src/lib/auth/guard.ts. This
 * catches a new endpoint that forgets its check; the rules themselves are tested
 * in permissions.test.ts.
 */

const SRC = path.join(import.meta.dirname, "..", "src");
const GUARD_CALL =
  /await (requireProject|requireManageProjects|requireManageAccounts|requireActor|visibleProjects)\(/;

/**
 * Deliberately public: you can't require a sign-in to sign in. Each entry needs
 * a reason; keep this list short.
 */
const PUBLIC = new Map([
  ["app/api/auth/login/route.ts", "sign-in form target"],
  ["app/api/auth/logout/route.ts", "only clears the caller's own cookie"],
  ["app/api/auth/setup/route.ts", "first-root setup: local-only, and only while no accounts exist"],
  ["app/api/auth/google/start/route.ts", "starts Google sign-in"],
  ["app/api/auth/google/callback/route.ts", "finishes Google sign-in (invite-only)"],
  ["app/login/page.tsx", "sign-in page"],
  ["app/setup/page.tsx", "first-root setup page (same restrictions as its route)"],
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Split a module into its exported async functions: name → body text. */
function exportedFunctions(source: string): Map<string, string> {
  const parts = source.split(/\nexport (?=async function )/).slice(1);
  return new Map(parts.map((part) => [/^async function (\w+)/.exec(part)![1], part]));
}

const relative = (file: string) => path.relative(SRC, file);
const files = walk(SRC);

describe("authorization coverage", () => {
  test("every exported server action calls the guard", () => {
    const actionFiles = files.filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")));
    assert.ok(actionFiles.length >= 1);
    let count = 0;
    for (const file of actionFiles) {
      for (const [name, body] of exportedFunctions(readFileSync(file, "utf8"))) {
        count++;
        assert.match(body, GUARD_CALL, `server action ${relative(file)} ${name} has no guard`);
      }
    }
    assert.ok(count >= 8, `expected the server actions, found ${count}`);
  });

  test("every API route handler calls the guard (or is explicitly public)", () => {
    const routes = files.filter((f) => f.endsWith("route.ts") && !PUBLIC.has(relative(f)));
    assert.ok(routes.length >= 5);
    for (const file of routes) {
      const handlers = exportedFunctions(readFileSync(file, "utf8"));
      assert.ok(handlers.size > 0, `${relative(file)} exports no handlers`);
      for (const [name, body] of handlers) assert.match(body, GUARD_CALL, `${relative(file)} ${name} has no guard`);
    }
  });

  test("every page calls the guard (or is explicitly public)", () => {
    const pages = files.filter((f) => f.endsWith("page.tsx") && !PUBLIC.has(relative(f)));
    assert.ok(pages.length >= 3);
    for (const file of pages) assert.match(readFileSync(file, "utf8"), GUARD_CALL, `${relative(file)} has no guard`);
  });

  test("the public list only names files that exist", () => {
    for (const file of PUBLIC.keys()) assert.ok(files.includes(path.join(SRC, file)), `${file} is listed but missing`);
  });
});
