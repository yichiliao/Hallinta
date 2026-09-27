import { NextResponse } from "next/server";
import { getUserStore, isLocalHost, isSecureRequest, isTeamMode, sessionCookie } from "@/lib/auth/server";
import { UserError } from "@/lib/auth/users";

/**
 * POST (form: name, email, password) → creates the first root account and signs
 * it in, switching Hallinta to team mode. Only while no accounts exist, and only
 * from the local machine, so an exposed server can't be claimed by a stranger.
 */
export async function POST(request: Request) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (await isTeamMode()) return to("/login");
  if (!isLocalHost(request.headers.get("host"))) {
    return NextResponse.json({ error: "Set up accounts from the computer Hallinta runs on." }, { status: 403 });
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) {
    return to(`/setup?error=${encodeURIComponent("The passwords don't match.")}`);
  }
  try {
    const user = await getUserStore().create({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      role: "root",
      password,
      google: false,
      onlyIfNoAccounts: true,
    });
    const response = to("/");
    const cookie = await sessionCookie(user, isSecureRequest(request));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    if (error instanceof UserError) return to(`/setup?error=${encodeURIComponent(error.message)}`);
    throw error;
  }
}
