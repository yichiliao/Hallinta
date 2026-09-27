import { NextResponse } from "next/server";
import { OAUTH_COOKIE, authorizationUrl, newOAuthState, signOAuthState } from "@/lib/auth/google";
import { getSessionSecret, googleConfig, isSecureRequest, isTeamMode } from "@/lib/auth/server";
import { safeRedirectPath } from "@/lib/auth/session";

/** GET ?next=/path → redirects to Google's sign-in page. Public by design. */
export async function GET(request: Request) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (!(await isTeamMode())) return to("/");
  const config = googleConfig(request);
  if (!config) return to(`/login?error=${encodeURIComponent("Google sign-in isn't set up on this Hallinta.")}`);

  const next = safeRedirectPath(new URL(request.url).searchParams.get("next"));
  const oauth = newOAuthState(next);
  const response = NextResponse.redirect(authorizationUrl(config, oauth), 303);
  response.cookies.set(OAUTH_COOKIE, signOAuthState(oauth, await getSessionSecret()), {
    httpOnly: true,
    // Lax so the cookie comes back on Google's top-level redirect to our callback.
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
  return response;
}
