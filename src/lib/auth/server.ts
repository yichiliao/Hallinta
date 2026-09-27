import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { GoogleConfig } from "@/lib/auth/google";
import { RateLimiter } from "@/lib/auth/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { UserStore, type UserRecord } from "@/lib/auth/users";
import { dataRoot } from "@/lib/store";

/** Account data lives in <data>/.hallinta/ (CLAUDE.md §32.5). */
function accountDir(): string {
  return path.join(dataRoot(), ".hallinta");
}

let users: UserStore | undefined;

export function getUserStore(): UserStore {
  users ??= new UserStore(accountDir());
  return users;
}

/** Team mode is on as soon as any account exists. */
export async function isTeamMode(): Promise<boolean> {
  return (await getUserStore().count()) > 0;
}

let secret: Promise<string> | undefined;

/**
 * Session-signing secret: HALLINTA_SESSION_SECRET if set (≥ 32 chars), else a random
 * secret generated once and kept in <data>/.hallinta/secret (mode 600).
 */
export function getSessionSecret(): Promise<string> {
  secret ??= (async () => {
    const fromEnv = process.env.HALLINTA_SESSION_SECRET;
    if (fromEnv && fromEnv.length >= 32) return fromEnv;
    const file = path.join(accountDir(), "secret");
    try {
      return (await fs.readFile(file, "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await fs.mkdir(accountDir(), { recursive: true, mode: 0o700 });
    const generated = randomBytes(32).toString("base64url");
    try {
      await fs.writeFile(file, generated + "\n", { mode: 0o600, flag: "wx" });
      return generated;
    } catch {
      // Another request created it first.
      return (await fs.readFile(file, "utf8")).trim();
    }
  })();
  return secret;
}

/** Is this request addressed to the local machine? (Host header of loopback names.) */
export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const name = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  return ["localhost", "127.0.0.1", "[::1]"].includes(name.toLowerCase());
}

/** Slows password guessing: attempts per email per 15 minutes. */
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);

/** Cookie settings for a new session for `user`. */
export async function sessionCookie(user: UserRecord, secure: boolean) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return {
    name: SESSION_COOKIE,
    value: signSession({ uid: user.id, ver: user.sessionVersion, exp }, await getSessionSecret()),
    options: { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}

/** Whether the request came over HTTPS (directly or via a reverse proxy). */
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

/** Is Google sign-in configured (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)? */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Google OAuth settings. The redirect URI must match one registered in Google
 * Cloud exactly; HALLINTA_PUBLIC_URL overrides the request's origin (needed behind
 * a reverse proxy).
 */
export function googleConfig(request: Request): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = (process.env.HALLINTA_PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, "");
  return { clientId, clientSecret, redirectUri: `${base}/api/auth/google/callback` };
}
