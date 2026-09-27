import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSessionSecret, getUserStore, isLocalHost } from "@/lib/auth/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import {
  SOLO_ROOT,
  canManageAccounts,
  canManageProjects,
  canView,
  projectPermissions,
  type Actor,
  type ProjectPermissions,
} from "@/lib/auth/permissions";
import { getStore, StoreError, type ProjectSummary } from "@/lib/store";

/*
 * Server-side enforcement of CLAUDE.md §32. Every page, server action, and route
 * handler goes through these helpers (tests/guard-coverage.test.ts checks this).
 * Hiding controls in the UI is cosmetic; this is the protection.
 */

/** Thrown when the actor may see a project but not perform the action. */
export class AccessDenied extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "AccessDenied";
  }
}

/** Thrown in team mode when there is no valid session. */
export class NotSignedIn extends Error {
  constructor() {
    super("Please sign in.");
    this.name = "NotSignedIn";
  }
}

/**
 * Who is making this request.
 * - Solo mode (no accounts): the implicit local root, but only for requests to
 *   the local machine; a solo Hallinta exposed on a network refuses everyone else.
 * - Team mode: the signed-in user, looked up fresh so role changes apply at once.
 */
export async function currentActor(): Promise<Actor> {
  const users = getUserStore();
  const all = await users.list();
  if (all.length === 0) {
    if (!isLocalHost((await headers()).get("host"))) {
      throw new AccessDenied("This Hallinta is in solo mode and only serves the computer it runs on.");
    }
    return SOLO_ROOT;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token, await getSessionSecret()) : null;
  const user = session ? all.find((u) => u.id === session.uid) : undefined;
  if (!session || !user || user.disabled || user.sessionVersion !== session.ver) throw new NotSignedIn();
  return { id: user.id, name: user.name, role: user.role };
}

/** The current actor, or null when signed out (for chrome like the header). */
export async function peekActor(): Promise<Actor | null> {
  try {
    return await currentActor();
  } catch {
    return null;
  }
}

/** Any signed-in person (or the solo root). */
export async function requireActor(): Promise<Actor> {
  return currentActor();
}

/** For pages: turn guard failures into a sign-in redirect or a 404. */
export function handlePageGuardError(error: unknown, returnTo = "/"): never {
  if (error instanceof NotSignedIn) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  // Pages someone may not use look like pages that don't exist.
  if (error instanceof StoreError || error instanceof AccessDenied) notFound();
  throw error;
}

export type ProjectNeed = keyof Omit<ProjectPermissions, "manage"> | "manage";

/**
 * Load a project's summary and check the actor's rights on it. A project the
 * actor cannot view is reported as not found, so its existence doesn't leak.
 */
export async function requireProject(
  projectId: string,
  need: ProjectNeed,
): Promise<{ actor: Actor; project: ProjectSummary; permissions: ProjectPermissions }> {
  const actor = await currentActor();
  const project = await getStore().getProjectSummary(projectId);
  const permissions = projectPermissions(actor, project);
  if (!permissions.view) throw new StoreError("not_found", `Project "${projectId}" not found.`);
  if (!permissions[need]) {
    throw new AccessDenied(
      need === "manage"
        ? "Only admins can manage projects."
        : "You have view-only access to this project.",
    );
  }
  return { actor, project, permissions };
}

/** Create projects: root and admins. */
export async function requireManageProjects(): Promise<Actor> {
  const actor = await currentActor();
  if (!canManageProjects(actor)) throw new AccessDenied("Only admins can create projects.");
  return actor;
}

/** Accounts and roles: root only. */
export async function requireManageAccounts(): Promise<Actor> {
  const actor = await currentActor();
  if (!canManageAccounts(actor)) throw new AccessDenied("Only root can manage people.");
  return actor;
}

/** Every project the current actor can view (active and archived). */
export async function visibleProjects(): Promise<{ actor: Actor; projects: ProjectSummary[] }> {
  const actor = await currentActor();
  const projects = (await getStore().listProjects()).filter((p) => canView(actor, p));
  return { actor, projects };
}

/** Map a guard/store error to an HTTP response for route handlers; rethrows anything else. */
export function deniedResponse(error: unknown): Response {
  if (error instanceof NotSignedIn) return Response.json({ error: error.message }, { status: 401 });
  if (error instanceof AccessDenied) return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof StoreError && error.code !== "exists") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  throw error;
}
