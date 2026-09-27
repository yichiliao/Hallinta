import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { RateLimiter } from "@/lib/auth/rate-limit";
import { safeRedirectPath, signSession, verifySession } from "@/lib/auth/session";
import { UserError, UserStore, toPublicUser } from "@/lib/auth/users";

function tempUserStore(): { store: UserStore; dir: string } {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "hallinta-users-")), ".hallinta");
  after(() => rmSync(path.dirname(dir), { recursive: true, force: true }));
  return { store: new UserStore(dir), dir };
}

describe("passwords", () => {
  test("hash and verify; wrong passwords and malformed hashes fail", async () => {
    const hash = await hashPassword("correct horse battery");
    assert.match(hash, /^scrypt\$32768\$8\$1\$/);
    assert.equal(await verifyPassword("correct horse battery", hash), true);
    assert.equal(await verifyPassword("correct horse batterY", hash), false);
    for (const bad of ["", "plain", "scrypt$1$2$3$x$y", hash.replace("scrypt", "bcrypt")]) {
      assert.equal(await verifyPassword("correct horse battery", bad), false, bad);
    }
    assert.notEqual(await hashPassword("correct horse battery"), hash, "salted");
  });

  test("minimum length", () => {
    assert.match(passwordProblem("short") ?? "", /at least 10/);
    assert.equal(passwordProblem("long enough pw"), null);
  });
});

describe("session tokens", () => {
  const secret = "s".repeat(32);
  const payload = { uid: "u_1", ver: 1, exp: 2_000_000_000 };

  test("round-trip", () => {
    assert.deepEqual(verifySession(signSession(payload, secret), secret, 1_000), payload);
  });

  test("reject tampering, wrong secret, expiry, and junk", () => {
    const token = signSession(payload, secret);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, uid: "u_root" })).toString("base64url");
    assert.equal(verifySession(`${forged}.${sig}`, secret, 1_000), null);
    assert.equal(verifySession(token, "t".repeat(32), 1_000), null);
    assert.equal(verifySession(token, secret, 2_000_000_001), null);
    for (const junk of ["", "abc", `${body}.`, `${body}.${sig}.x`]) assert.equal(verifySession(junk, secret, 1_000), null);
  });

  test("safe redirect paths only", () => {
    assert.equal(safeRedirectPath("/projects/x"), "/projects/x");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "evil", undefined, 3]) {
      assert.equal(safeRedirectPath(bad), "/", String(bad));
    }
  });
});

describe("RateLimiter", () => {
  test("allows up to the limit per window, then resets", () => {
    const limiter = new RateLimiter(3, 1000);
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.hit("a", 0)), [true, true, true, false]);
    assert.equal(limiter.hit("b", 0), true, "keys are independent");
    assert.equal(limiter.hit("a", 1001), true, "new window");
    limiter.hit("a", 1001);
    limiter.reset("a");
    assert.equal(limiter.hit("a", 1002), true);
  });
});

describe("UserStore", () => {
  test("starts empty (solo mode) and creates the first root", async () => {
    const { store, dir } = tempUserStore();
    assert.equal(await store.count(), 0);
    await assert.rejects(
      store.create({ name: "Student", email: "s@lab.org", role: "regular", password: "long password 1", google: false }),
      /at least one active root/,
      "the first account must be a root",
    );
    const root = await store.create({ name: "PI", email: " PI@Lab.org ", role: "root", password: "long password 1", google: true });
    assert.equal(root.email, "pi@lab.org");
    assert.match(root.id, /^u_[\w-]{12}$/);
    assert.equal((statSync(path.join(dir, "users.json")).mode & 0o777).toString(8), "600");
    assert.equal(await verifyPassword("long password 1", (await store.findByEmail("pi@LAB.org"))!.passwordHash!), true);
    assert.deepEqual(Object.keys(toPublicUser(root)).includes("passwordHash"), false);
  });

  test("first-root setup can't race: only one succeeds", async () => {
    const { store } = tempUserStore();
    const attempt = (n: number) =>
      store.create({ name: `R${n}`, email: `r${n}@lab.org`, role: "root", password: "long password 1", google: false, onlyIfNoAccounts: true });
    const results = await Promise.allSettled([attempt(1), attempt(2), attempt(3)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await store.count(), 1);
  });

  test("validates input and rejects duplicate emails", async () => {
    const { store } = tempUserStore();
    await store.create({ name: "PI", email: "pi@lab.org", role: "root", password: "long password 1", google: false });
    const base = { name: "X", email: "x@lab.org", role: "regular" as const, google: false };
    await assert.rejects(store.create({ ...base, password: "long password 1", email: "PI@lab.org" }), /already exists/);
    await assert.rejects(store.create({ ...base, email: "not-an-email", password: "long password 1" }), /valid email/);
    await assert.rejects(store.create({ ...base, password: "short" }), /at least 10/);
    await assert.rejects(store.create({ ...base }), /at least one way to sign in/);
    const google = await store.create({ ...base, google: true });
    assert.equal(google.passwordHash, undefined, "Google-only accounts have no password");
  });

  test("ids are never reused", async () => {
    const { store } = tempUserStore();
    await store.create({ name: "PI", email: "pi@lab.org", role: "root", password: "long password 1", google: false });
    const a = await store.create({ name: "A", email: "a@lab.org", role: "regular", google: true });
    await store.remove(a.id);
    const again = await store.create({ name: "A", email: "a@lab.org", role: "regular", google: true });
    assert.notEqual(again.id, a.id);
  });

  test("always keeps at least one active root", async () => {
    const { store } = tempUserStore();
    const pi = await store.create({ name: "PI", email: "pi@lab.org", role: "root", password: "long password 1", google: false });
    await assert.rejects(store.update(pi.id, { role: "admin" }), UserError);
    await assert.rejects(store.update(pi.id, { disabled: true }), /active root/);
    await assert.rejects(store.remove(pi.id), /active root/, "removing the last account must not fall back to solo mode");
    assert.equal(await store.count(), 1);
    assert.equal((await store.get(pi.id))?.role, "root", "failed changes are not saved");
    const coPi = await store.create({ name: "Co-PI", email: "co@lab.org", role: "root", google: true });
    await store.update(pi.id, { role: "admin" });
    await assert.rejects(store.remove(coPi.id), /active root/);
  });

  test("password changes and disabling invalidate sessions; sign-in methods can't all be removed", async () => {
    const { store } = tempUserStore();
    await store.create({ name: "PI", email: "pi@lab.org", role: "root", password: "long password 1", google: false });
    const s = await store.create({ name: "S", email: "s@lab.org", role: "regular", password: "long password 2", google: false });
    const v = s.sessionVersion;
    assert.equal((await store.setPassword(s.id, "long password 3")).sessionVersion, v + 1);
    assert.equal((await store.update(s.id, { disabled: true })).sessionVersion, v + 2);
    await assert.rejects(store.setPassword(s.id, null), /Google sign-in before/);
    await store.update(s.id, { google: true });
    const cleared = await store.setPassword(s.id, null);
    assert.equal(cleared.passwordHash, undefined);
    await assert.rejects(store.update(s.id, { google: false }), /need a password/);
  });

  test("concurrent writes don't lose updates", async () => {
    const { store } = tempUserStore();
    await store.create({ name: "PI", email: "pi@lab.org", role: "root", password: "long password 1", google: false });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => store.create({ name: `S${i}`, email: `s${i}@lab.org`, role: "regular", google: true })),
    );
    assert.equal(await store.count(), 9);
  });
});
