/*
 * Who may do what (CLAUDE.md §32). Pure functions, no I/O, so every rule is
 * unit-tested. Server code enforces these through src/lib/auth/guard.ts.
 */

export type Role = "root" | "admin" | "regular";
export type AccessLevel = "view" | "edit";
/** Per-project grants for regular users: user id → level. */
export type AccessMap = Record<string, AccessLevel>;

export interface Actor {
  id: string;
  name: string;
  role: Role;
  /** Solo mode: no accounts exist and the local user is implicitly root. */
  implicit?: boolean;
}

/** The person at the keyboard in solo mode. */
export const SOLO_ROOT: Actor = { id: "local", name: "You", role: "root", implicit: true };

export const ROLES: Role[] = ["root", "admin", "regular"];
export const ACCESS_LEVELS: AccessLevel[] = ["view", "edit"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as string[]).includes(value);
}

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === "string" && (ACCESS_LEVELS as string[]).includes(value);
}

/** Keep only well-formed grants from untrusted JSON. */
export function parseAccessMap(value: unknown): AccessMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([id, level]) => id.length > 0 && isAccessLevel(level)),
  ) as AccessMap;
}

/** Keep only grants for accounts that exist (drops removed or made-up ids). */
export function accessForKnownUsers(access: AccessMap, knownUserIds: Iterable<string>): AccessMap {
  const known = new Set(knownUserIds);
  return Object.fromEntries(Object.entries(parseAccessMap(access)).filter(([id]) => known.has(id))) as AccessMap;
}

/** The level an actor has on a project, or null for no access. Root and admins edit everything. */
export function projectAccess(actor: Actor, project: { access: AccessMap }): AccessLevel | null {
  if (actor.role === "root" || actor.role === "admin") return "edit";
  return project.access[actor.id] ?? null;
}

export function canView(actor: Actor, project: { access: AccessMap }): boolean {
  return projectAccess(actor, project) !== null;
}

export function canEdit(actor: Actor, project: { access: AccessMap }): boolean {
  return projectAccess(actor, project) === "edit";
}

/** Hallinta's AI spends the installation's API key, so it requires edit access. */
export function canUseAi(actor: Actor, project: { access: AccessMap }): boolean {
  return canEdit(actor, project);
}

/** Create, archive/unarchive, rename, assign access: root and admins. */
export function canManageProjects(actor: Actor): boolean {
  return actor.role === "root" || actor.role === "admin";
}

/** Invite and remove people, set passwords, assign roles: root only. */
export function canManageAccounts(actor: Actor): boolean {
  return actor.role === "root";
}

/** What an actor may do on one project; passed to the UI to show the right controls. */
export interface ProjectPermissions {
  view: boolean;
  edit: boolean;
  ai: boolean;
  manage: boolean;
}

export function projectPermissions(actor: Actor, project: { access: AccessMap }): ProjectPermissions {
  return {
    view: canView(actor, project),
    edit: canEdit(actor, project),
    ai: canUseAi(actor, project),
    manage: canManageProjects(actor),
  };
}

/**
 * Role changes: only root may change roles, and there must always be at least
 * one root. Returns an error message, or null if the change is allowed.
 */
export function roleChangeError(
  actor: Actor,
  target: { id: string; role: Role },
  nextRole: Role,
  rootCount: number,
): string | null {
  if (!canManageAccounts(actor)) return "Only root can change roles.";
  if (target.role === "root" && nextRole !== "root" && rootCount <= 1) {
    return "There must always be at least one root.";
  }
  return null;
}

/** Removing or disabling an account: root only, never the last root. */
export function removalError(actor: Actor, target: { id: string; role: Role }, rootCount: number): string | null {
  if (!canManageAccounts(actor)) return "Only root can remove people.";
  if (target.role === "root" && rootCount <= 1) return "The last root can't be removed.";
  return null;
}
