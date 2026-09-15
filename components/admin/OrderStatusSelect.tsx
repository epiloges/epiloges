"use client";

import { useState, useTransition } from "react";
import { ORDER_STATUS_CONSEQUENCE, ORDER_STATUS_LABEL, ORDER_STATUS_OPTIONS } from "@/constants/order-status";
import { canTransitionOrder } from "@/lib/order-transitions";
import type { Order } from "@/lib/commerce/types";

interface OrderStatusSelectProps {
  orderId: string;
  defaultStatus: Order["status"];
  /** Set when the order has no tracking number, so "shipped" can warn about it. */
  hasTracking?: boolean;
  onChange: (orderId: string, status: Order["status"]) => Promise<{ error?: string } | void>;
}

/**
 * Same <select> + useTransition pattern as RoleSelect/ReturnStatusSelect, persisting for
 * real via a Server Action.
 *
 * - Only offers the statuses the order can actually move to (lib/order-transitions.ts);
 *   the rest are listed but disabled, so the graph is visible rather than a surprise.
 * - Confirms first, and the confirmation says what the status DOES — which email goes out,
 *   whether stock moves — because that is the information a mis-click needs to be caught.
 *   The confirmation is drawn in the page, not a `window.confirm`: a native dialog is
 *   silently answered "no" by embedded browsers and some popup blockers, and the owner's
 *   report was exactly that — choose "Shipped", nothing happens.
 * - Shows the server's refusal and puts the select back, instead of leaving the dropdown
 *   claiming a status the database rejected.
 */
export function OrderStatusSelect({ orderId, defaultStatus, hasTracking = true, onChange }: OrderStatusSelectProps) {
  const [status, setStatus] = useState(defaultStatus);
  const [pending, setPending] = useState<Order["status"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirm = () => {
    if (!pending) return;
    const next = pending;
    const previous = status;
    setPending(null);
    setStatus(next);
    setError(null);
    startTransition(async () => {
      const result = await onChange(orderId, next);
      if (result?.error) {
        setStatus(previous);
        setError(result.error);
      }
    });
  };

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <select
        value={pending ?? status}
        disabled={isPending}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const next = e.target.value as Order["status"];
          setError(null);
          setPending(next === status ? null : next);
        }}
        className="h-8 border border-border bg-transparent px-2 text-xs capitalize outline-none focus:border-luxe-black disabled:opacity-50 aria-[invalid]:border-destructive"
      >
        {ORDER_STATUS_OPTIONS.map((option) => (
          <option key={option} value={option} disabled={!canTransitionOrder(status, option)}>
            {ORDER_STATUS_LABEL[option]}
          </option>
        ))}
      </select>
      {pending ? (
        <div role="dialog" aria-label={`Set order to ${ORDER_STATUS_LABEL[pending]}?`} className="max-w-xs border border-luxe-black bg-luxe-white p-3 text-xs shadow-sm">
          <p className="font-medium">Set order to &ldquo;{ORDER_STATUS_LABEL[pending]}&rdquo;?</p>
          <p className="mt-1 text-luxe-gray-dark">{ORDER_STATUS_CONSEQUENCE[pending]}</p>
          {pending === "shipped" && !hasTracking ? (
            <p className="mt-1 text-amber-800">No tracking number is set — the email will not include one.</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setPending(null)} className="h-7 px-2 text-luxe-gray-dark uppercase">
              Cancel
            </button>
            <button type="button" onClick={confirm} autoFocus className="h-7 border border-luxe-black bg-luxe-black px-3 font-medium tracking-[0.05em] text-luxe-white uppercase">
              Confirm
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="max-w-xs text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
