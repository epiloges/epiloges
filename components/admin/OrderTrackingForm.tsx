"use client";

import { useState, useTransition } from "react";
import type { OrderTrackingInput } from "@/services/orders";
import type { CreateShipmentActionState, CreateShipmentOptions } from "@/app/admin/(dashboard)/orders/actions";
import type { Address } from "@/lib/commerce/types";

const inputClass =
  "h-10 w-full border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black";
const labelClass = "mb-1.5 block text-eyebrow";

interface OrderTrackingFormProps {
  defaultCarrier?: string;
  defaultTrackingNumber?: string;
  defaultTrackingUrl?: string;
  /** Computed server-side (COURIER_PROVIDER isn't a NEXT_PUBLIC_ var, so this can't be read client-side) — gates whether the "Create ACS Shipment" button renders at all. */
  courierProviderIsAcs: boolean;
  onSave: (input: OrderTrackingInput) => Promise<void>;
  onCreateAcsShipment?: (options: CreateShipmentOptions) => Promise<CreateShipmentActionState>;
  /** Shown beside the create button, so the address is read before a voucher is bought against it. */
  shippingAddress?: Address;
  /** Pairs in the order — the default parcel count, one box per pair. */
  unitCount?: number;
}

/**
 * What can be checked about an address without a courier database: the things a voucher
 * is refused or a parcel comes back for. Each is a warning, not a block — the person
 * creating the voucher decides — but the confirmation box below stays unticked until
 * they have read them.
 */
function addressWarnings(address: Address): string[] {
  const warnings: string[] = [];
  const postal = address.postalCode.replace(/\s+/g, "");
  if (address.countryCode === "GR" && !/^\d{5}$/.test(postal)) warnings.push(`Ο Τ.Κ. «${address.postalCode}» δεν είναι πενταψήφιος.`);
  if (!/\d/.test(address.address1)) warnings.push("Η διεύθυνση δεν έχει αριθμό.");
  if (address.address1.trim().length < 5) warnings.push("Η διεύθυνση είναι πολύ σύντομη.");
  if (address.city.trim().length < 3) warnings.push("Η πόλη λείπει ή είναι πολύ σύντομη.");
  const phone = (address.phone ?? "").replace(/[\s\-()]/g, "").replace(/^\+30/, "").replace(/^0030/, "");
  if (!phone) warnings.push("Δεν υπάρχει τηλέφωνο — η ACS δεν θα μπορεί να ειδοποιήσει τον παραλήπτη.");
  else if (!/^(69\d{8}|2\d{9})$/.test(phone)) warnings.push(`Το τηλέφωνο «${address.phone}» δεν μοιάζει με ελληνικό κινητό ή σταθερό.`);
  if (address.countryCode === "GR" && /^[A-Za-z0-9\s.,'\-/]+$/.test(`${address.address1} ${address.city}`)) {
    warnings.push("Διεύθυνση με λατινικούς χαρακτήρες — ελέγξτε ότι ο διανομέας θα την καταλάβει.");
  }
  return warnings;
}

export function OrderTrackingForm({
  defaultCarrier,
  defaultTrackingNumber,
  defaultTrackingUrl,
  courierProviderIsAcs,
  onSave,
  onCreateAcsShipment,
  shippingAddress,
  unitCount = 1,
}: OrderTrackingFormProps) {
  const [pieces, setPieces] = useState(Math.max(1, unitCount));
  const [addressChecked, setAddressChecked] = useState(false);
  const warnings = shippingAddress ? addressWarnings(shippingAddress) : [];
  const [carrier, setCarrier] = useState(defaultCarrier ?? "");
  const [trackingNumber, setTrackingNumber] = useState(defaultTrackingNumber ?? "");
  const [trackingUrl, setTrackingUrl] = useState(defaultTrackingUrl ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "shipmentError">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCreatingShipment, startCreatingShipment] = useTransition();

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

  const handleCreateShipment = () => {
    if (!onCreateAcsShipment) return;
    startCreatingShipment(async () => {
      const result = await onCreateAcsShipment({ pieces });
      if (result.error) {
        setErrorMessage(result.error);
        setStatus("shipmentError");
      } else {
        setStatus("saved");
        // The server action already persisted the result — reload to reflect it in the fields.
        window.location.reload();
      }
    });
  };

  return (
    <div className="border border-border bg-luxe-white p-6">
      <h3 className="mb-4 text-sm font-medium tracking-[0.05em] uppercase">Shipment & Tracking</h3>

      {courierProviderIsAcs && onCreateAcsShipment ? (
        <div className="mb-5 space-y-3 border border-border bg-luxe-gray-light/40 p-3">
          {shippingAddress ? (
            <div className="text-xs">
              <p className="text-eyebrow mb-1">Παραλήπτης</p>
              <p className="whitespace-pre-line text-luxe-black">
                {[
                  `${shippingAddress.firstName} ${shippingAddress.lastName}`,
                  shippingAddress.company,
                  [shippingAddress.address1, shippingAddress.address2].filter(Boolean).join(", "),
                  `${shippingAddress.postalCode} ${shippingAddress.city}`,
                  shippingAddress.phone,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </p>
              {warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 border-l-2 border-amber-500 pl-2 text-amber-900">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className={labelClass} htmlFor="ot-pieces">Δέματα</label>
              <input
                id="ot-pieces"
                type="number"
                min={1}
                max={20}
                value={pieces}
                onChange={(e) => setPieces(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                className="h-8 w-20 border border-border bg-luxe-white px-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-luxe-gray-dark">Ένα ανά ζευγάρι — η ACS βγάζει μία ετικέτα για κάθε δέμα.</p>
            </div>
            <label className="flex items-center gap-2 pb-1 text-xs">
              <input type="checkbox" checked={addressChecked} onChange={(e) => setAddressChecked(e.target.checked)} />
              Έλεγξα τη διεύθυνση και το τηλέφωνο
            </label>
            <button
              type="button"
              onClick={handleCreateShipment}
              disabled={isCreatingShipment || !addressChecked}
              className="ml-auto h-8 shrink-0 border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase disabled:opacity-50"
            >
              {isCreatingShipment ? "Creating..." : `Create ACS Shipment · ${pieces} ${pieces === 1 ? "parcel" : "parcels"}`}
            </button>
          </div>
        </div>
      ) : null}

      {status === "shipmentError" ? <p className="mb-4 text-xs text-destructive">{errorMessage}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="ot-carrier">Carrier</label>
          <input id="ot-carrier" className={inputClass} value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="ACS Courier" />
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
