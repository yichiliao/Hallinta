import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_COOKIE, exchangeCode, identityFromIdToken, stateMatches, verifyOAuthState } from "@/lib/auth/google";
import {
  getSessionSecret,
  getUserStore,
  googleConfig,
  isSecureRequest,
  isTeamMode,
  loginLimiter,
  sessionCookie,
} from "@/lib/auth/server";

/**
 * GET ?code&state → finishes Google sign-in. Invite-only: the verified Google
 * email must belong to an account on the People page with Google allowed.
 * Public by design (it is the sign-in).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secure = isSecureRequest(request);
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url), 303);
    response.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, sameSite: "lax", secure, path: "/api/auth/google", maxAge: 0 });
    return response;
  };
  const fail = (message: string) => finish(`/login?error=${encodeURIComponent(message)}`);

  if (!(await isTeamMode())) return finish("/");
  const config = googleConfig(request);
  if (!config) return fail("Google sign-in isn't set up on this Hallinta.");
  if (url.searchParams.get("error")) return fail("Google sign-in was cancelled.");

  const oauth = verifyOAuthState((await cookies()).get(OAUTH_COOKIE)?.value, await getSessionSecret());
  if (!oauth || !stateMatches(oauth.state, url.searchParams.get("state"))) {
    return fail("That sign-in link expired or didn't come from this Hallinta. Try again.");
  }
  const code = url.searchParams.get("code");
  if (!code) return fail("Google didn't return a sign-in code.");

  let identity;
  try {
    identity = identityFromIdToken(await exchangeCode(config, code, oauth.verifier), config.clientId);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Google sign-in failed.");
  }
  if (typeof identity === "string") return fail(identity);

  if (!loginLimiter.hit(`google:${identity.email}`)) return fail("Too many attempts. Wait a few minutes and try again.");
  const user = await getUserStore().findByEmail(identity.email);
  if (!user || !user.google || user.disabled) {
    return fail(`${identity.email} hasn't been invited to use Google sign-in here. Ask your PI to add you.`);
  }

  const response = finish(oauth.next);
  const cookie = await sessionCookie(user, secure);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
