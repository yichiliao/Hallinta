"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import {
  inviteUser,
  removeUser,
  resetUserPassword,
  setUserDisabled,
  setUserGoogle,
  setUserRole,
} from "@/app/people/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/policy";
import { ROLES, type Role } from "@/lib/auth/permissions";
import type { PublicUser } from "@/lib/auth/users";
import { cn, type ActionResult } from "@/lib/utils";

const ROLE_LABELS: Record<Role, string> = { root: "Root", admin: "Admin", regular: "Regular" };

/** Readable random password for sharing once. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className="h-8 rounded-md border border-stone-300 bg-white px-2 text-sm disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function PersonRow({ user, isSelf }: { user: PublicUser; isSelf: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setError(null);
        after?.();
      } else {
        setError(result.error);
      }
    });

  return (
    <li className={cn("py-4", user.disabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-48 flex-1">
          <p className="font-medium text-stone-900">
            {user.name}
            {isSelf && <span className="ml-2 text-xs font-normal text-stone-400">(you)</span>}
            {user.disabled && <span className="ml-2 text-xs font-normal text-amber-700">disabled</span>}
          </p>
          <p className="text-sm text-stone-500">{user.email}</p>
        </div>

        <RoleSelect value={user.role} disabled={pending} onChange={(role) => run(() => setUserRole(user.id, role))} />

        <div className="flex items-center gap-3 text-sm text-stone-600">
          <span className={user.hasPassword ? "" : "text-stone-400 line-through"}>Password</span>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={user.google}
              disabled={pending}
              onChange={(e) => run(() => setUserGoogle(user.id, e.target.checked))}
              className="accent-stone-700"
            />
            Google
          </label>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setResetting((r) => !r)} disabled={pending}>
            {user.hasPassword ? "Reset password" : "Set password"}
          </Button>
          {!isSelf && (
            <Button
              variant="ghost"
              size="xs"
              disabled={pending}
              onClick={() => run(() => setUserDisabled(user.id, !user.disabled))}
            >
              {user.disabled ? "Enable" : "Disable"}
            </Button>
          )}
          {!isSelf &&
            (confirmRemove ? (
              <>
                <Button variant="destructive" size="xs" disabled={pending} onClick={() => run(() => removeUser(user.id))}>
                  Remove {user.name.split(" ")[0]}
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setConfirmRemove(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="xs" disabled={pending} onClick={() => setConfirmRemove(true)}>
                Remove
              </Button>
            ))}
        </div>
      </div>

      {resetting && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => resetUserPassword(user.id, newPassword), () => {
              setResetting(false);
              setNewPassword("");
            });
          }}
        >
          <Input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
            className="max-w-xs font-mono"
            autoFocus
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => setNewPassword(generatePassword())}>
            Generate
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
          <span className="w-full text-xs text-stone-400">
            They&apos;ll be signed out everywhere. Share the new password privately.
          </span>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </li>
  );
}

export function PeopleTable({ users, currentUserId }: { users: PublicUser[]; currentUserId: string }) {
  const order: Record<Role, number> = { root: 0, admin: 1, regular: 2 };
  const sorted = [...users].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  return (
    <ul className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
      {sorted.map((u) => (
        <PersonRow key={u.id} user={u} isSelf={u.id === currentUserId} />
      ))}
    </ul>
  );
}

export function InviteForm({ googleConfigured }: { googleConfigured: boolean }) {
  const [state, formAction, pending] = useActionState(inviteUser, null);
  const [open, setOpen] = useState(false);
  const [usePassword, setUsePassword] = useState(true);
  const [password, setPassword] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setPassword("");
    }
  }, [state]);

  if (!open) {
    return (
      <Button variant="outline" className="mt-6" onClick={() => setOpen(true)}>
        <UserPlus />
        Add person
      </Button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-4 rounded-lg border border-stone-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Name</span>
          <Input name="name" required autoFocus />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Email</span>
          <Input name="email" type="email" required />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Role</span>
          <select
            name="role"
            defaultValue="regular"
            className="h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-stone-600">How they sign in</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="usePassword"
            checked={usePassword}
            onChange={(e) => setUsePassword(e.target.checked)}
            className="accent-stone-700"
          />
          Password you set now
        </label>
        {usePassword && (
          <div className="ml-6 flex flex-wrap items-center gap-2">
            <Input
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
              className="max-w-xs font-mono"
              required
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="google" className="accent-stone-700" />
          Google account with this email
          {!googleConfigured && (
            <span className="text-xs text-stone-400">(Google sign-in isn&apos;t set up yet; see docs/google-sign-in.md)</span>
          )}
        </label>
      </fieldset>

      {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-emerald-700">
          Added. Share their password privately; they can change it on their Account page.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add person"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
