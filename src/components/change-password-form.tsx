"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeOwnPassword } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/policy";

export function ChangePasswordForm({ needsCurrent }: { needsCurrent: boolean }) {
  const [state, formAction, pending] = useActionState(changeOwnPassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-3">
      {needsCurrent && (
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Current password</span>
          <Input name="current" type="password" autoComplete="current-password" required />
        </label>
      )}
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-stone-600">New password ({MIN_PASSWORD_LENGTH}+ characters)</span>
        <Input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-stone-600">Confirm new password</span>
        <Input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </label>
      {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">Password changed. Other devices have been signed out.</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
