"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createProject } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewProjectForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProject, null);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus />
        New project
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-stone-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Name</span>
          <Input name="name" placeholder="Urban Heat Islands" autoFocus required />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-stone-600">Members (comma-separated)</span>
          <Input name="members" placeholder="Ana, Mina, Tomás" />
        </label>
      </div>
      {state && !state.ok && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
