"use server";

import { cookies, headers } from "next/headers";
import { requireActor } from "@/lib/auth/guard";
import { verifyPassword } from "@/lib/auth/password";
import { getUserStore, sessionCookie } from "@/lib/auth/server";
import type { ActionResult } from "@/lib/utils";

/** Change your own password. Other sessions are signed out; this one stays signed in. */
export async function changeOwnPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  try {
    const actor = await requireActor();
    if (actor.implicit) return { ok: false, error: "Solo mode has no accounts." };
    const users = getUserStore();
    const user = await users.get(actor.id);
    if (!user) return { ok: false, error: "Account not found." };

    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("password") ?? "");
    if (next !== String(formData.get("confirm") ?? "")) return { ok: false, error: "The new passwords don't match." };
    if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) {
      return { ok: false, error: "Your current password is incorrect." };
    }

    const updated = await users.setPassword(user.id, next);
    const h = await headers();
    const secure = h.get("x-forwarded-proto") === "https" || (h.get("origin") ?? "").startsWith("https:");
    const cookie = await sessionCookie(updated, secure);
    (await cookies()).set(cookie.name, cookie.value, cookie.options);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true };
}
