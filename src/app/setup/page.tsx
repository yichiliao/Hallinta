import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/policy";
import { isLocalHost, isTeamMode } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Create the first root account (switches Hallinta from solo to team mode). */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isTeamMode()) notFound();
  const { error } = await searchParams;
  const local = isLocalHost((await headers()).get("host"));

  return (
    <main className="mx-auto max-w-md py-16">
      <h1 className="font-serif text-3xl tracking-tight">Set up accounts</h1>
      <div className="mt-4 space-y-2 text-sm text-stone-600">
        <p>
          Right now Hallinta is in <strong>solo mode</strong>: no login, and only this computer can use it.
        </p>
        <p>
          Creating the first <strong>root</strong> account (for a PI) switches Hallinta to team mode. After that, everyone
          signs in, and root decides who else gets an account and what they can see. Your projects stay exactly as
          they are.
        </p>
      </div>

      {!local ? (
        <p className="mt-8 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          For safety, accounts can only be set up from the computer Hallinta runs on. Open Hallinta there, at
          http://localhost, to continue.
        </p>
      ) : (
        <form method="post" action="/api/auth/setup" className="mt-8 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Your name</span>
            <Input name="name" autoComplete="name" required autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Email</span>
            <Input name="email" type="email" autoComplete="username" required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">
              Password (at least {MIN_PASSWORD_LENGTH} characters)
            </span>
            <Input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-600">Confirm password</span>
            <Input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full">
            Create root account
          </Button>
        </form>
      )}
    </main>
  );
}
