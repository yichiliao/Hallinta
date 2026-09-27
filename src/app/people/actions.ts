"use server";

import { revalidatePath } from "next/cache";
import { requireManageAccounts } from "@/lib/auth/guard";
import { isRole, removalError, roleChangeError, type Role } from "@/lib/auth/permissions";
import { getUserStore } from "@/lib/auth/server";
import { getStore } from "@/lib/store";
import type { ActionResult } from "@/lib/utils";

/* Account management: root only (CLAUDE.md §32.2). Every action checks first. */

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function rootCount(): Promise<number> {
  return (await getUserStore().list()).filter((u) => u.role === "root" && !u.disabled).length;
}

async function target(id: string) {
  const user = await getUserStore().get(id);
  if (!user) throw new Error("No such person.");
  return user;
}

export async function inviteUser(_prev: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  try {
    await requireManageAccounts();
    const role = String(formData.get("role") ?? "regular");
    if (!isRole(role)) return failure("Unknown role.");
    const usePassword = formData.get("usePassword") === "on";
    await getUserStore().create({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      role,
      password: usePassword ? String(formData.get("password") ?? "") : undefined,
      google: formData.get("google") === "on",
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/people");
  return { ok: true };
}

export async function setUserRole(id: string, role: Role): Promise<ActionResult> {
  try {
    const actor = await requireManageAccounts();
    if (!isRole(role)) return failure("Unknown role.");
    const problem = roleChangeError(actor, await target(id), role, await rootCount());
    if (problem) return failure(problem);
    await getUserStore().update(id, { role });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/people");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<ActionResult> {
  try {
    const actor = await requireManageAccounts();
    if (id === actor.id) return failure("You can't disable your own account.");
    if (disabled) {
      const problem = removalError(actor, await target(id), await rootCount());
      if (problem) return failure(problem);
    }
    await getUserStore().update(id, { disabled });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/people");
  return { ok: true };
}

export async function setUserGoogle(id: string, allowed: boolean): Promise<ActionResult> {
  try {
    await requireManageAccounts();
    await getUserStore().update(id, { google: allowed });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/people");
  return { ok: true };
}

/** Set a new password for someone (they're signed out everywhere). */
export async function resetUserPassword(id: string, password: string): Promise<ActionResult> {
  try {
    await requireManageAccounts();
    await target(id);
    await getUserStore().setPassword(id, typeof password === "string" ? password : "");
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/people");
  return { ok: true };
}

/** Remove an account and its project grants. */
export async function removeUser(id: string): Promise<ActionResult> {
  try {
    const actor = await requireManageAccounts();
    if (id === actor.id) return failure("You can't remove your own account.");
    const problem = removalError(actor, await target(id), await rootCount());
    if (problem) return failure(problem);
    await getUserStore().remove(id);
    const store = getStore();
    for (const project of await store.listProjects()) {
      if (project.access[id]) {
        const { [id]: _removed, ...rest } = project.access;
        await store.setProjectAccess(project.id, rest);
      }
    }
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/people");
  return { ok: true };
}
