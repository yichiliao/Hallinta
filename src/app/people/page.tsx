import Link from "next/link";
import { InviteForm, PeopleTable } from "@/components/people";
import { handlePageGuardError, requireManageAccounts } from "@/lib/auth/guard";
import { getUserStore, isGoogleConfigured } from "@/lib/auth/server";
import { toPublicUser } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

/** Root only: accounts, roles, and sign-in methods. */
export default async function PeoplePage() {
  const actor = await requireManageAccounts().catch((error) => handlePageGuardError(error, "/people"));
  const users = (await getUserStore().list()).map(toPublicUser);

  return (
    <main className="pb-24 pt-8">
      <h1 className="font-serif text-3xl tracking-tight">People</h1>

      {actor.implicit ? (
        <div className="mt-6 max-w-xl space-y-3 text-stone-600">
          <p>
            Hallinta is in <strong>solo mode</strong>: there are no accounts, and only this computer can use it.
          </p>
          <p>
            To share it with students or collaborators, set up accounts. You become the first <strong>root</strong>{" "}
            and decide who else can sign in and which projects they see.
          </p>
          <Link
            href="/setup"
            className="inline-block rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 hover:bg-stone-700"
          >
            Set up accounts
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-sm text-stone-500">
            <strong>Root</strong> manages people. <strong>Admins</strong> create projects, see everything, and decide
            who can view or edit each project. <strong>Regular</strong> users see only the projects shared with them.
          </p>
          <PeopleTable users={users} currentUserId={actor.id} />
          <InviteForm googleConfigured={isGoogleConfigured()} />
        </>
      )}
    </main>
  );
}
