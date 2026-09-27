import { NextResponse } from "next/server";
import { DUMMY_HASH_PROMISE, verifyPassword } from "@/lib/auth/password";
import { getUserStore, isSecureRequest, isTeamMode, loginLimiter, sessionCookie } from "@/lib/auth/server";
import { safeRedirectPath } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/auth/users";

/** POST (form: email, password, next) → sets the session cookie and redirects. Public by design. */
export async function POST(request: Request) {
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") ?? ""));
  const password = String(form.get("password") ?? "");
  const next = safeRedirectPath(form.get("next"));
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  const fail = (message: string) =>
    to(`/login?error=${encodeURIComponent(message)}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`);

  if (!(await isTeamMode())) return to("/");
  if (!loginLimiter.hit(email)) return fail("Too many attempts. Wait a few minutes and try again.");

  const user = await getUserStore().findByEmail(email);
  // Always run one hash check so response time doesn't reveal whether the email exists.
  const valid = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH_PROMISE));
  if (!user || !user.passwordHash || user.disabled || !valid) return fail("Email or password is incorrect.");

  loginLimiter.reset(email);
  const response = to(next);
  const cookie = await sessionCookie(user, isSecureRequest(request));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
