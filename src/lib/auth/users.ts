import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { hashPassword } from "@/lib/auth/password";
import { passwordProblem } from "@/lib/auth/policy";
import { isRole, type Role } from "@/lib/auth/permissions";

/*
 * Accounts for team mode (CLAUDE.md §32.5), stored in <data>/.hallinta/users.json.
 * No accounts means solo mode.
 */

export interface UserRecord {
  /** Random, never reused, so a new person never inherits an old person's grants. */
  id: string;
  name: string;
  /** Lowercased; used for password sign-in and matched against Google. */
  email: string;
  role: Role;
  passwordHash?: string;
  /** May sign in with a Google account for `email`. */
  google: boolean;
  disabled: boolean;
  /** Bumped to invalidate existing sessions (password change, disabling). */
  sessionVersion: number;
  created: string;
}

/** What the UI may see: never the hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  hasPassword: boolean;
  google: boolean;
  disabled: boolean;
  created: string;
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { id, name, email, role, google, disabled, created } = user;
  return { id, name, email, role, google, disabled, created, hasPassword: Boolean(user.passwordHash) };
}

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUserRecord(value: unknown): value is UserRecord {
  const u = value as Partial<UserRecord>;
  return (
    typeof u?.id === "string" &&
    typeof u.name === "string" &&
    typeof u.email === "string" &&
    isRole(u.role) &&
    typeof u.google === "boolean" &&
    typeof u.disabled === "boolean" &&
    typeof u.sessionVersion === "number"
  );
}

function hasActiveRoot(users: UserRecord[]): boolean {
  return users.some((u) => u.role === "root" && !u.disabled);
}

export interface NewUser {
  name: string;
  email: string;
  role: Role;
  password?: string;
  google: boolean;
  /** First-root setup: fail if any account already exists. */
  onlyIfNoAccounts?: boolean;
}

export class UserStore {
  private readonly file: string;
  /** Serialises read-modify-write cycles within this process. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dir: string) {
    this.file = path.join(dir, "users.json");
  }

  async list(): Promise<UserRecord[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const json = JSON.parse(raw) as { users?: unknown };
    return Array.isArray(json.users) ? json.users.filter(isUserRecord) : [];
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async get(id: string): Promise<UserRecord | undefined> {
    return (await this.list()).find((u) => u.id === id);
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const wanted = normalizeEmail(email);
    return (await this.list()).find((u) => u.email === wanted);
  }

  private mutate<T>(change: (users: UserRecord[]) => Promise<T> | T): Promise<T> {
    const run = async () => {
      const users = await this.list();
      const hadAccounts = users.length > 0;
      const result = await change(users);
      // Invariant (CLAUDE.md §32.2): once accounts exist, at least one active root remains.
      // This includes removing the last account, which would otherwise fall back to solo mode.
      if ((hadAccounts || users.length > 0) && !hasActiveRoot(users)) {
        throw new UserError("There must always be at least one active root.");
      }
      await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify({ users }, null, 2) + "\n", { mode: 0o600 });
      await fs.rename(tmp, this.file);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private static find(users: UserRecord[], id: string): UserRecord {
    const user = users.find((u) => u.id === id);
    if (!user) throw new UserError("No such person.");
    return user;
  }

  async create(input: NewUser): Promise<UserRecord> {
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    if (!name) throw new UserError("Enter a name.");
    if (!EMAIL_RE.test(email)) throw new UserError("Enter a valid email address.");
    if (!isRole(input.role)) throw new UserError("Unknown role.");
    if (!input.password && !input.google) throw new UserError("Choose at least one way to sign in.");
    if (input.password) {
      const problem = passwordProblem(input.password);
      if (problem) throw new UserError(problem);
    }
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    return this.mutate((users) => {
      if (input.onlyIfNoAccounts && users.length > 0) throw new UserError("Accounts are already set up.");
      if (users.some((u) => u.email === email)) throw new UserError("Someone with that email already exists.");
      const user: UserRecord = {
        id: `u_${randomBytes(9).toString("base64url")}`,
        name,
        email,
        role: input.role,
        ...(passwordHash ? { passwordHash } : {}),
        google: input.google,
        disabled: false,
        sessionVersion: 1,
        created: new Date().toISOString().slice(0, 10),
      };
      users.push(user);
      return user;
    });
  }

  async update(id: string, patch: { name?: string; role?: Role; google?: boolean; disabled?: boolean }): Promise<UserRecord> {
    return this.mutate((users) => {
      const user = UserStore.find(users, id);
      if (patch.name !== undefined) {
        if (!patch.name.trim()) throw new UserError("Enter a name.");
        user.name = patch.name.trim();
      }
      if (patch.role !== undefined) {
        if (!isRole(patch.role)) throw new UserError("Unknown role.");
        user.role = patch.role;
      }
      if (patch.google !== undefined) {
        if (!patch.google && !user.passwordHash) throw new UserError("They need a password before Google can be turned off.");
        user.google = patch.google;
      }
      if (patch.disabled !== undefined && patch.disabled !== user.disabled) {
        user.disabled = patch.disabled;
        if (patch.disabled) user.sessionVersion++;
      }
      return user;
    });
  }

  /** Set (or clear, with null) a password. Signs the person out everywhere. */
  async setPassword(id: string, password: string | null): Promise<UserRecord> {
    if (password !== null) {
      const problem = passwordProblem(password);
      if (problem) throw new UserError(problem);
    }
    const passwordHash = password === null ? undefined : await hashPassword(password);
    return this.mutate((users) => {
      const user = UserStore.find(users, id);
      if (!passwordHash && !user.google) throw new UserError("They need Google sign-in before the password can be removed.");
      if (passwordHash) user.passwordHash = passwordHash;
      else delete user.passwordHash;
      user.sessionVersion++;
      return user;
    });
  }

  async remove(id: string): Promise<void> {
    await this.mutate((users) => {
      const index = users.findIndex((u) => u.id === id);
      if (index === -1) throw new UserError("No such person.");
      users.splice(index, 1);
    });
  }
}
