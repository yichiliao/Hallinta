import { createHmac, timingSafeEqual } from "node:crypto";

/*
 * Stateless session tokens: base64url(JSON payload) + "." + HMAC-SHA256.
 * The user record is looked up on every request, so role changes apply at
 * once; `ver` must match the user's sessionVersion, so bumping it (password
 * change, disabling) invalidates existing sessions.
 */

export const SESSION_COOKIE = "hallinta_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionPayload {
  uid: string;
  ver: number;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** The payload if the token is authentic and unexpired, else null. */
export function verifySession(token: string, secret: string, nowSeconds = Date.now() / 1000): SessionPayload | null {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (typeof payload.uid !== "string" || typeof payload.ver !== "number" || typeof payload.exp !== "number") {
      return null;
    }
    if (payload.exp <= nowSeconds) return null;
    return { uid: payload.uid, ver: payload.ver, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Where to send someone after signing in: only same-site paths, never "//evil.com". */
export function safeRedirectPath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
