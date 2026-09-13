"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { RETURN_STATUS_CONSEQUENCE, canTransitionReturn } from "@/lib/order-transitions";
import type { Return } from "@/lib/commerce/types";

const STATUS_OPTIONS: Return["status"][] = ["requested", "approved", "rejected", "received", "refunded"];

const STATUS_STYLES: Record<Return["status"], string> = {
  requested: "text-luxe-gray-dark",
  approved: "text-blue-700",
  rejected: "text-destructive",
  received: "text-amber-700",
  refunded: "text-green-700",
};

interface ReturnStatusSelectProps {
  returnId: string;
  defaultStatus: Return["status"];
  onChange: (returnId: string, status: Return["status"]) => Promise<{ error?: string } | void>;
}

/**
 * Same <select> + useTransition pattern as OrderStatusSelect, persisting for real via a
 * Server Action — and, like it, offering only the reachable statuses, confirming with the
 * consequence spelled out, and reverting on a server refusal.
 */
export function ReturnStatusSelect({ returnId, defaultStatus, onChange }: ReturnStatusSelectProps) {
  const [status, setStatus] = useState(defaultStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <select
        value={status}
        disabled={isPending}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const next = e.target.value as Return["status"];
          if (next === status) return;
          if (!window.confirm(`Set return to "${next}"?\n\n${RETURN_STATUS_CONSEQUENCE[next]}`)) return;

          const previous = status;
          setStatus(next);
          setError(null);
          startTransition(async () => {
            const result = await onChange(returnId, next);
            if (result?.error) {
              setStatus(previous);
              setError(result.error);
            }
          });
        }}
        className={cn(
          "h-8 border border-border bg-transparent px-2 text-xs capitalize outline-none disabled:opacity-50 aria-[invalid]:border-destructive",
          STATUS_STYLES[status]
        )}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option} disabled={!canTransitionReturn(status, option)} className="text-luxe-black">
            {option}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
