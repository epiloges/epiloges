"use client";

import { useState, useTransition } from "react";
import type { CreateShipmentActionState } from "@/app/admin/(dashboard)/orders/actions";

interface AcsVoucherActionsProps {
  orderId: string;
  trackingNumber: string;
  /** Formatted date-time of the last print, or null while unprinted. */
  printedAt: string | null;
  /** Set once the day was closed — the voucher is a shipment now and cannot be cancelled here. */
  pickupListNo: string | null;
  onCancel: () => Promise<CreateShipmentActionState>;
}

/**
 * What an ACS voucher needs after it exists: printing (ACS's own PDF, laser or thermal)
 * and, while it is still possible, cancelling. Printing matters more than it looks — ACS
 * will not close a day's pickup list while an unprinted voucher is on it.
 */
export function AcsVoucherActions({ orderId, trackingNumber, printedAt, pickupListNo, onCancel }: AcsVoucherActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pdf = (format: "laser" | "thermal") => `/api/admin/courier/voucher?order=${encodeURIComponent(orderId)}&format=${format}`;
  const linkClass = "h-8 border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase inline-flex items-center";

  return (
    <div className="mt-5 border border-border bg-luxe-gray-light/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-luxe-gray-dark">
          ACS voucher <span className="font-mono text-luxe-black">{trackingNumber}</span>
          {pickupListNo ? (
            <>
              {" "}
              — on pickup list <span className="font-mono">{pickupListNo}</span>, handed to the courier.
            </>
          ) : printedAt ? (
            <> — printed {printedAt}. Waiting for the pickup list.</>
          ) : (
            <> — not printed yet. Print it here or in a batch from ACS Courier.</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a href={pdf("laser")} target="_blank" rel="noopener" className={linkClass}>
            Print A4
          </a>
          <a href={pdf("thermal")} target="_blank" rel="noopener" className={linkClass}>
            Print thermal
          </a>
          {pickupListNo ? null : confirming ? (
            <span className="inline-flex items-center gap-2 text-xs">
              <span className="text-luxe-gray-dark">Cancel voucher {trackingNumber}?</span>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await onCancel();
                    if (result.error) {
                      setError(result.error);
                      setConfirming(false);
                    } else {
                      window.location.reload();
                    }
                  })
                }
                className="bg-destructive px-2 py-1 font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50"
              >
                {isPending ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button type="button" disabled={isPending} onClick={() => setConfirming(false)} className="px-2 py-1 uppercase underline underline-offset-4">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-xs text-destructive underline underline-offset-4">
              Cancel voucher
            </button>
          )}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
