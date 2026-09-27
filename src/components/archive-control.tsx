"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/utils";

/** Archive button (with confirmation) for active projects. */
export function ArchiveButton({ archive }: { archive: () => Promise<ActionResult> }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="xs" onClick={() => setConfirming(true)}>
        <Archive />
        Archive
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      <span className="mr-1 text-xs text-stone-500">
        {error ?? "Move to data/archive/ and hide from the graph?"}
      </span>
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await archive();
            if (result.ok) setConfirming(false);
            else setError(result.error);
          })
        }
      >
        Archive
      </Button>
      <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

/** Banner shown on archived projects. */
export function ArchivedBanner({ unarchive }: { unarchive?: () => Promise<ActionResult> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-600">
      <span>{error ?? "This project is archived. It's hidden from the graph view."}</span>
      {unarchive && (
        <Button
          variant="outline"
          size="xs"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await unarchive();
              if (!result.ok) setError(result.error);
            })
          }
        >
          <ArchiveRestore />
          Unarchive
        </Button>
      )}
    </div>
  );
}
