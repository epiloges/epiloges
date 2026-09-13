"use client";

import { useActionState } from "react";
import type { OrderNoteActionState } from "@/app/admin/(dashboard)/orders/actions";

interface OrderInternalNoteFormProps {
  initialNote: string;
  action: (state: OrderNoteActionState, formData: FormData) => Promise<OrderNoteActionState>;
}

/** The shop's note to itself on an order. Saved with a button rather than on blur, because a half-typed note is worse than none. */
export function OrderInternalNoteForm({ initialNote, action }: OrderInternalNoteFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-2">
      <textarea
        name="internalNote"
        defaultValue={initialNote}
        rows={3}
        maxLength={2000}
        placeholder="Only the team sees this — e.g. “customer called, deliver after 17:00”."
        className="w-full border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-luxe-black"
      />
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${state.error ? "text-destructive" : "text-green-700"}`}>{state.error ?? state.success ?? ""}</p>
        <button
          type="submit"
          disabled={isPending}
          className="h-8 border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}
