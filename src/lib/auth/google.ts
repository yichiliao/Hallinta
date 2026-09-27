import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/*
 * "Sign in with Google" (OpenID Connect authorization-code flow with PKCE),
 * invite-only (CLAUDE.md §32.4). No SDK: the ID token comes straight from
 * Google's token endpoint over TLS, which OpenID Connect Core §3.1.3.7 accepts
 * in place of verifying its signature; we still check issuer, audience,
 * expiry, and that Google verified the email.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const OAUTH_COOKIE = "hallinta_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Short-lived state kept in a signed cookie between "start" and "callback". */
export interface OAuthState {
  state: string;
  verifier: string;
  next: string;
  exp: number;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function newOAuthState(next: string, nowSeconds = Date.now() / 1000): OAuthState {
  return {
    state: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
    next,
    exp: Math.floor(nowSeconds) + OAUTH_TTL_SECONDS,
  };
}

/** PKCE S256 challenge for a verifier (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export function authorizationUrl(config: GoogleConfig, oauth: OAuthState): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: oauth.state,
    code_challenge: pkceChallenge(oauth.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export function signOAuthState(oauth: OAuthState, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(oauth)));
  const mac = createHmac("sha256", `oauth:${secret}`).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyOAuthState(token: string | undefined, secret: string, nowSeconds = Date.now() / 1000): OAuthState | null {
  if (!token) return null;
  const [body, mac, ...rest] = token.split(".");
  if (!body || !mac || rest.length) return null;
  const expected = Buffer.from(createHmac("sha256", `oauth:${secret}`).update(body).digest("base64url"));
  const actual = Buffer.from(mac);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<OAuthState>;
    if (typeof o.state !== "string" || typeof o.verifier !== "string" || typeof o.next !== "string") return null;
    if (typeof o.exp !== "number" || o.exp <= nowSeconds) return null;
    return o as OAuthState;
  } catch {
    return null;
  }
}

/** Constant-time comparison of the returned `state` with the one we issued. */
export function stateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface GoogleIdentity {
  email: string;
  name?: string;
}

/** Decode an ID token's claims and check they're for us, fresh, and email-verified. */
export function identityFromIdToken(idToken: string, clientId: string, nowSeconds = Date.now() / 1000): GoogleIdentity | string {
  const parts = idToken.split(".");
  if (parts.length !== 3) return "Google returned an invalid sign-in token.";
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return "Google returned an invalid sign-in token.";
  }
  if (!ISSUERS.includes(String(claims.iss))) return "The sign-in token wasn't issued by Google.";
  const aud = claims.aud;
  if (aud !== clientId && !(Array.isArray(aud) && aud.includes(clientId))) return "The sign-in token is for a different app.";
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) return "The Google sign-in expired. Try again.";
  if (typeof claims.email !== "string" || claims.email_verified !== true) {
    return "Google hasn't verified this account's email address.";
  }
  return { email: claims.email.toLowerCase(), name: typeof claims.name === "string" ? claims.name : undefined };
}

/** Exchange the authorization code for an ID token at Google's token endpoint. */
export async function exchangeCode(
  config: GoogleConfig,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
  if (!response.ok || typeof json.id_token !== "string") {
    throw new Error(`Google sign-in failed${typeof json.error === "string" ? ` (${json.error})` : ""}.`);
  }
  return json.id_token;
}
