import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/change-password-form";
import { handlePageGuardError, requireActor } from "@/lib/auth/guard";
import { getUserStore } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const ROLE_DESCRIPTIONS = {
  root: "Root: you manage people and can see and edit every project.",
  admin: "Admin: you create projects, see and edit every project, and decide who can access them.",
  regular: "Regular: you see the projects shared with you.",
} as const;

export default async function AccountPage() {
  const actor = await requireActor().catch((error) => handlePageGuardError(error, "/account"));
  if (actor.implicit) redirect("/people");
  const user = await getUserStore().get(actor.id);
  if (!user) redirect("/login");

  return (
    <main className="max-w-md pb-24 pt-8">
      <h1 className="font-serif text-3xl tracking-tight">Account</h1>
      <p className="mt-4 font-medium text-stone-900">{user.name}</p>
      <p className="text-sm text-stone-500">{user.email}</p>
      <p className="mt-3 text-sm text-stone-600">{ROLE_DESCRIPTIONS[user.role]}</p>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        {user.passwordHash ? "Change password" : "Set a password"}
      </h2>
      <ChangePasswordForm needsCurrent={Boolean(user.passwordHash)} />
    </main>
  );
}
