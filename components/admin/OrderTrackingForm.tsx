"use client";

import { useState, useTransition } from "react";
import type { OrderTrackingInput } from "@/services/orders";

const inputClass =
  "h-10 w-full border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black";
const labelClass = "mb-1.5 block text-eyebrow";

interface OrderTrackingFormProps {
  defaultCarrier?: string;
  defaultTrackingNumber?: string;
  defaultTrackingUrl?: string;
  onSave: (input: OrderTrackingInput) => Promise<void>;
}

/**
 * Manual carrier/tracking entry — no live courier integration is configured for this
 * deployment, so this is the only way an order gets a tracking number. See lib/courier
 * for how to register a real provider (and its own "create shipment" UI) later.
 */
export function OrderTrackingForm({ defaultCarrier, defaultTrackingNumber, defaultTrackingUrl, onSave }: OrderTrackingFormProps) {
  const [carrier, setCarrier] = useState(defaultCarrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(defaultTrackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(defaultTrackingUrl ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      try {
        await onSave({ carrier: carrier || undefined, trackingNumber: trackingNumber || undefined, trackingUrl: trackingUrl || undefined });
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    });
  };

  return (
    <div className="border border-border bg-luxe-white p-6">
      <h3 className="mb-4 text-sm font-medium tracking-[0.05em] uppercase">Shipment & Tracking</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="ot-carrier">Carrier</label>
          <input id="ot-carrier" className={inputClass} value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Courier" />
        </div>
        <div>
          <label className={labelClass} htmlFor="ot-tracking">Tracking Number</label>
          <input id="ot-tracking" className={inputClass} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="ot-url">Tracking URL</label>
          <input id="ot-url" className={inputClass} value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        {status === "saved" ? <span className="text-xs text-green-700">Saved</span> : null}
        {status === "error" ? <span className="text-xs text-destructive">Couldn&apos;t save. Try again.</span> : null}
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="h-9 bg-luxe-black px-5 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save Tracking"}
        </button>
      </div>
    </div>
  );
}
