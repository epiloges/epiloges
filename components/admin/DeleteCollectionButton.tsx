"use client";

import { useState, useTransition } from "react";
import { deleteCollection } from "@/app/admin/(dashboard)/collections/actions";

/**
 * Confirm + delete for the collection detail page. The previous control was a bare form
 * submit — one click, no confirmation, no way to show the "still linked from the homepage"
 * refusal the action now returns.
 */
export function DeleteCollectionButton({ id, title }: { id: string; title: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete the collection "${title}"? Products stay; only the grouping goes. This can't be undone.`)) return;
    startTransition(async () => {
      const result = await deleteCollection(id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="h-9 border border-destructive px-4 text-xs font-medium tracking-[0.05em] text-destructive uppercase disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete Collection"}
      </button>
      {error ? <p className="mt-2 max-w-xs text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
