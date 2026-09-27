import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { peekActor } from "@/lib/auth/guard";
import { isGoogleConfigured, isTeamMode } from "@/lib/auth/server";
import { safeRedirectPath } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; email?: string }>;
}) {
  const { error, next, email } = await searchParams;
  const returnTo = safeRedirectPath(next);
  if (!(await isTeamMode())) redirect("/");
  if (await peekActor()) redirect(returnTo);

  return (
    <main className="mx-auto max-w-sm py-16">
      <h1 className="font-serif text-3xl tracking-tight">Sign in</h1>
      {isGoogleConfigured() && (
        <>
          <a
            href={`/api/auth/google/start?next=${encodeURIComponent(returnTo)}`}
            className="mt-8 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-stone-300 bg-white text-sm font-medium text-stone-800 hover:bg-stone-100"
          >
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
            Continue with Google
          </a>
          <div className="my-6 flex items-center gap-3 text-xs text-stone-400">
            <span className="h-px flex-1 bg-stone-200" />
            or with a password
            <span className="h-px flex-1 bg-stone-200" />
          </div>
        </>
      )}
      <form method="post" action="/api/auth/login" className={isGoogleConfigured() ? "space-y-4" : "mt-8 space-y-4"}>
        <input type="hidden" name="next" value={returnTo} />
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Email</span>
          <Input name="email" type="email" autoComplete="username" defaultValue={email} required autoFocus={!email} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Password</span>
          <Input name="password" type="password" autoComplete="current-password" required autoFocus={Boolean(email)} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-xs text-stone-400">
        Accounts are created by your lab&apos;s PI. Ask them if you need access or forgot your password.
      </p>
    </main>
  );
}
