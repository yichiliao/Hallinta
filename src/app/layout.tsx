import type { Metadata } from "next";
import Link from "next/link";
import { peekActor } from "@/lib/auth/guard";
import { canManageAccounts } from "@/lib/auth/permissions";
import { isTeamMode } from "@/lib/auth/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hallinta",
  description: "Living research project documents.",
};

async function Account() {
  const actor = await peekActor();
  if (!actor) return null;
  if (!(await isTeamMode())) {
    return (
      <Link href="/people" className="text-xs text-stone-400 hover:text-stone-600">
        Solo mode
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-4 text-sm text-stone-500">
      {canManageAccounts(actor) && (
        <Link href="/people" className="hover:text-stone-900">
          People
        </Link>
      )}
      <Link href="/account" className="hover:text-stone-900">
        {actor.name}
      </Link>
      <form action="/api/auth/logout" method="post">
        <button type="submit" className="hover:text-stone-900">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-4xl px-6">
          <nav className="flex h-14 items-center justify-between">
            <Link href="/" className="font-serif text-lg tracking-tight text-stone-800">
              hallinta
            </Link>
            <Account />
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
