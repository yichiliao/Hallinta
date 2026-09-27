import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import {
  GOOGLE_TOKEN_URL,
  authorizationUrl,
  exchangeCode,
  identityFromIdToken,
  newOAuthState,
  pkceChallenge,
  signOAuthState,
  stateMatches,
  verifyOAuthState,
} from "@/lib/auth/google";

const config = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "shh", redirectUri: "http://localhost:3000/api/auth/google/callback" };
const secret = "s".repeat(32);
const now = 1_900_000_000;

function idToken(claims: Record<string, unknown>): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256" })}.${enc(claims)}.signature`;
}
const good = { iss: "https://accounts.google.com", aud: config.clientId, exp: now + 300, email: "Student@Example.com", email_verified: true, name: "Student" };

describe("Google sign-in", () => {
  test("authorization URL carries state, PKCE S256, scopes, and our redirect", () => {
    const oauth = newOAuthState("/projects/x", now);
    const url = new URL(authorizationUrl(config, oauth));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(url.searchParams.get("state"), oauth.state);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("code_challenge"), pkceChallenge(oauth.verifier));
    assert.equal(url.searchParams.get("scope"), "openid email profile");
    assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
    assert.equal(url.searchParams.get("client_secret"), null, "the secret never goes to the browser");
  });

  test("PKCE challenge matches RFC 7636", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    assert.equal(pkceChallenge(verifier), createHash("sha256").update(verifier).digest("base64url"));
    assert.equal(pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("OAuth state cookie: round-trip, tamper, expiry, wrong secret", () => {
    const oauth = newOAuthState("/", now);
    const token = signOAuthState(oauth, secret);
    assert.deepEqual(verifyOAuthState(token, secret, now), oauth);
    assert.equal(verifyOAuthState(token, "t".repeat(32), now), null);
    assert.equal(verifyOAuthState(token, secret, now + 601), null);
    const forged = Buffer.from(JSON.stringify({ ...oauth, next: "//evil" })).toString("base64url");
    assert.equal(verifyOAuthState(`${forged}.${token.split(".")[1]}`, secret, now), null);
    assert.equal(verifyOAuthState(undefined, secret, now), null);
  });

  test("state comparison", () => {
    assert.equal(stateMatches("abc", "abc"), true);
    assert.equal(stateMatches("abc", "abd"), false);
    assert.equal(stateMatches("abc", null), false);
  });

  test("ID token: accepts a valid token, lowercasing the email", () => {
    assert.deepEqual(identityFromIdToken(idToken(good), config.clientId, now), { email: "student@example.com", name: "Student" });
    assert.deepEqual(identityFromIdToken(idToken({ ...good, iss: "accounts.google.com" }), config.clientId, now).constructor, Object);
  });

  test("ID token: rejects wrong issuer, audience, expiry, unverified email, junk", () => {
    const reject = (claims: Record<string, unknown>) => typeof identityFromIdToken(idToken(claims), config.clientId, now) === "string";
    assert.ok(reject({ ...good, iss: "https://evil.example" }));
    assert.ok(reject({ ...good, aud: "someone-else" }));
    assert.ok(reject({ ...good, exp: now - 1 }));
    assert.ok(reject({ ...good, email_verified: false }));
    assert.ok(reject({ ...good, email_verified: "true" }), "must be the boolean true");
    assert.ok(reject({ ...good, email: undefined }));
    assert.equal(typeof identityFromIdToken("not-a-jwt", config.clientId, now), "string");
  });

  test("code exchange sends code, verifier, and secret to Google's token endpoint", async () => {
    let seen: { url: string; body: URLSearchParams } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, body: init.body as URLSearchParams };
      return new Response(JSON.stringify({ id_token: "the.id.token" }), { status: 200 });
    }) as unknown as typeof fetch;
    assert.equal(await exchangeCode(config, "code-1", "verifier-1", fakeFetch), "the.id.token");
    assert.equal(seen?.url, GOOGLE_TOKEN_URL);
    assert.equal(seen?.body.get("code_verifier"), "verifier-1");
    assert.equal(seen?.body.get("client_secret"), "shh");
    assert.equal(seen?.body.get("grant_type"), "authorization_code");
  });

  test("code exchange surfaces Google errors", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    await assert.rejects(exchangeCode(config, "bad", "v", fakeFetch), /invalid_grant/);
  });
});
