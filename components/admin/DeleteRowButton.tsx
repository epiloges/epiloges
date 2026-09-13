"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

interface DeleteRowButtonProps {
  id: string;
  onDelete: (id: string) => Promise<void>;
  confirmMessage?: string;
}

/**
 * Generic delete-row action for admin list pages (Discounts, Gift Cards) that have no
 * dedicated detail page to redirect from.
 *
 * Confirms inline rather than with `window.confirm()`. Embedded browsers — the preview pane
 * in the Claude desktop app among them — swallow native dialogs and answer "cancel", which
 * made the trash icon look broken: the click fired, the question was never shown, and
 * nothing happened. Two buttons in the row are visible everywhere.
 */
export function DeleteRowButton({ id, onDelete, confirmMessage = "Delete this? It can't be undone." }: DeleteRowButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
        <span className="text-luxe-gray-dark">{confirmMessage}</span>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await onDelete(id);
            });
          }}
          className="bg-destructive px-2 py-1 font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50"
        >
          {isPending ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="px-2 py-1 tracking-[0.05em] uppercase underline underline-offset-4 disabled:opacity-50"
        >
          Keep
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-destructive underline underline-offset-4"
      aria-label="Delete"
    >
      <Trash2 className="size-4" strokeWidth={1.5} />
    </button>
  );
}
