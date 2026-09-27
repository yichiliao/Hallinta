"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AccessLevel, AccessMap, Role } from "@/lib/auth/permissions";
import type { ActionResult } from "@/lib/utils";

/** A person on the People page, as the member picker needs them. */
export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: Role;
  disabled: boolean;
}

/** Team mode: members are accounts with access; `legacy` are old free-text names. */
export interface TeamMembership {
  access: AccessMap;
  legacy: string[];
  /** Everyone with an account (only passed to people who can manage the project). */
  directory: DirectoryEntry[];
  /** Names for member ids, so viewers can see who's on the project. */
  names: Record<string, string>;
  save?: (name: string, access: AccessMap, legacy: string[]) => Promise<ActionResult>;
}

function Title({ name }: { name: string }) {
  return <h1 className="mt-3 font-serif text-4xl tracking-tight">{name}</h1>;
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={onClick}
      className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
      aria-label="Edit name and members"
    >
      <Pencil />
      Edit
    </Button>
  );
}

/** Project name and members, editable in place. */
export function ProjectDetails({
  name,
  members,
  save,
  team,
}: {
  name: string;
  members: string[];
  /** Solo mode: omitted for people who can't manage the project. */
  save?: (name: string, members: string) => Promise<ActionResult>;
  team?: TeamMembership;
}) {
  const [editing, setEditing] = useState(false);

  if (team) {
    return editing && team.save ? (
      <TeamMembersForm name={name} team={team} onDone={() => setEditing(false)} />
    ) : (
      <div className="group">
        <Title name={name} />
        <div className="mt-2 flex min-h-7 flex-wrap items-center gap-x-2">
          <TeamMembersLine team={team} canManage={Boolean(team.save)} />
          {team.save && <EditButton onClick={() => setEditing(true)} />}
        </div>
      </div>
    );
  }

  return editing && save ? (
    <SoloMembersForm name={name} members={members} save={save} onDone={() => setEditing(false)} />
  ) : (
    <div className="group">
      <Title name={name} />
      <div className="mt-2 flex min-h-7 items-center gap-2">
        <p className="text-stone-500">
          {members.length > 0 ? members.join(" · ") : <span className="text-stone-400">No members listed</span>}
        </p>
        {save && <EditButton onClick={() => setEditing(true)} />}
      </div>
    </div>
  );
}

function TeamMembersLine({ team, canManage }: { team: TeamMembership; canManage: boolean }) {
  const people = Object.entries(team.access)
    .filter(([id]) => team.names[id])
    .map(([id, level]) => ({ id, name: team.names[id], level }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (people.length === 0 && team.legacy.length === 0) {
    return <p className="text-stone-400">{canManage ? "No members yet. Add people to share this project." : ""}</p>;
  }
  return (
    <p className="text-stone-500">
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && " · "}
          {p.name}
          {p.level === "view" && <span className="text-stone-400"> (view)</span>}
        </span>
      ))}
      {canManage && team.legacy.length > 0 && (
        <span className="text-stone-400" title="Names typed before accounts existed. Edit to link them.">
          {people.length > 0 && " · "}
          {team.legacy.join(" · ")} (not linked)
        </span>
      )}
    </p>
  );
}

function SoloMembersForm({
  name,
  members,
  save,
  onDone,
}: {
  name: string;
  members: string[];
  save: (name: string, members: string) => Promise<ActionResult>;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await save(String(data.get("name") ?? ""), String(data.get("members") ?? ""));
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Name</span>
          <Input name="name" defaultValue={name} autoFocus required />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Members (comma-separated)</span>
          <Input name="members" defaultValue={members.join(", ")} placeholder="Ana, Mina, Tomás" />
        </label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <FormButtons pending={pending} onCancel={onDone} />
    </form>
  );
}

function FormButtons({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

const selectClass = "h-8 rounded-md border border-stone-300 bg-white px-2 text-sm disabled:opacity-60";

function TeamMembersForm({ name, team, onDone }: { name: string; team: TeamMembership; onDone: () => void }) {
  const [title, setTitle] = useState(name);
  const [access, setAccess] = useState<AccessMap>(team.access);
  const [legacy, setLegacy] = useState<string[]>(team.legacy);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byId = new Map(team.directory.map((p) => [p.id, p]));
  const members = Object.keys(access)
    .filter((id) => byId.has(id))
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name));
  const addable = team.directory
    .filter((p) => !(p.id in access) && !p.disabled)
    .sort((a, b) => a.name.localeCompare(b.name));
  const exactMatch = (legacyName: string) =>
    addable.find((p) => p.name.trim().toLowerCase() === legacyName.trim().toLowerCase());

  const grant = (id: string, level: AccessLevel) => setAccess((a) => ({ ...a, [id]: level }));
  const revoke = (id: string) =>
    setAccess((a) => {
      const { [id]: _removed, ...rest } = a;
      return rest;
    });
  const link = (legacyName: string, id: string) => {
    grant(id, "edit");
    setLegacy((l) => l.filter((n) => n !== legacyName));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await team.save!(title, access, legacy);
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      className="mt-3 space-y-5 rounded-lg border border-stone-200 bg-white p-4"
    >
      <label className="block max-w-md space-y-1.5">
        <span className="text-xs font-medium text-stone-600">Name</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </label>

      <div>
        <p className="text-xs font-medium text-stone-600">Members</p>
        <p className="mb-2 text-xs text-stone-400">
          Members see this project. <strong>Edit</strong> lets them change it and use Hallinta; <strong>View</strong> is
          read-only. Admins and root can always see and edit every project.
        </p>
        {members.length === 0 && <p className="py-2 text-sm text-stone-400">No members yet.</p>}
        <ul className="divide-y divide-stone-100">
          {members.map((p) => {
            const alwaysEdit = p.role !== "regular";
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-40 flex-1">
                  <span className="text-stone-900">{p.name}</span>
                  <span className="ml-2 text-xs text-stone-400">{p.email}</span>
                  {p.disabled && <span className="ml-2 text-xs text-amber-700">disabled</span>}
                </div>
                {alwaysEdit ? (
                  <span className="text-xs text-stone-400">{p.role}: always edit</span>
                ) : (
                  <select
                    aria-label={`Access for ${p.name}`}
                    value={access[p.id]}
                    onChange={(e) => grant(p.id, e.target.value as AccessLevel)}
                    className={selectClass}
                  >
                    <option value="edit">Edit</option>
                    <option value="view">View</option>
                  </select>
                )}
                <Button type="button" variant="ghost" size="xs" onClick={() => revoke(p.id)} aria-label={`Remove ${p.name}`}>
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
        {addable.length > 0 ? (
          <select
            aria-label="Add member"
            value=""
            onChange={(e) => e.target.value && grant(e.target.value, "edit")}
            className={`${selectClass} mt-2`}
          >
            <option value="">+ Add member…</option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.email})
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-2 text-xs text-stone-400">Everyone with an account is a member. Add people on the People page.</p>
        )}
      </div>

      {legacy.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stone-600">Not linked yet</p>
          <p className="mb-2 text-xs text-stone-400">
            Names typed before accounts existed. Link each to an account, or remove it.
          </p>
          <ul className="divide-y divide-stone-100">
            {legacy.map((legacyName) => {
              const match = exactMatch(legacyName);
              return (
                <li key={legacyName} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-32 flex-1 text-stone-700">{legacyName}</span>
                  {match && (
                    <Button type="button" variant="outline" size="xs" onClick={() => link(legacyName, match.id)}>
                      Link to {match.name}&apos;s account
                    </Button>
                  )}
                  {addable.length > 0 && (
                    <select
                      aria-label={`Link ${legacyName} to an account`}
                      value=""
                      onChange={(e) => e.target.value && link(legacyName, e.target.value)}
                      className={selectClass}
                    >
                      <option value="">{match ? "Other account…" : "Link to account…"}</option>
                      {addable.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.email})
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setLegacy((l) => l.filter((n) => n !== legacyName))}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
      <FormButtons pending={pending} onCancel={onDone} />
    </form>
  );
}
