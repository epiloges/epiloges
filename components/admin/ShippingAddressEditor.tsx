"use client";

import { useState, useTransition } from "react";
import type { Address } from "@/lib/commerce/types";
import type { ShippingAddressActionState, ShippingAddressInput } from "@/app/admin/(dashboard)/orders/actions";

const inputClass = "h-9 w-full border border-border bg-transparent px-2.5 text-sm outline-none focus:border-luxe-black";
const labelClass = "mb-1 block text-[10px] tracking-[0.1em] uppercase text-luxe-gray-dark";

/**
 * The delivery address, fixable on the order. A customer who types "Μινωος 98" for
 * "Μίνωος 98" or a wrong postal code is not a lost parcel: the shop corrects it here and
 * the courier voucher — created afterwards from the order — carries the corrected one.
 * Locked while a voucher exists, because the label already printed the old address; the
 * voucher has to be cancelled first, and the form says so.
 */
export function ShippingAddressEditor({
  address,
  lockedBy,
  onSave,
}: {
  address: Address;
  /** The voucher number that pins the address, if any. */
  lockedBy?: string | null;
  onSave: (input: ShippingAddressInput) => Promise<ShippingAddressActionState>;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<ShippingAddressInput>(() => toInput(address));

  const set = (key: keyof ShippingAddressInput) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  if (!editing) {
    return (
      <div className="mt-3">
        {lockedBy ? (
          <p className="text-[11px] text-luxe-gray-dark">Locked by voucher {lockedBy} — cancel it to change the address.</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setForm(toInput(address));
              setError(null);
              setEditing(true);
            }}
            className="text-[11px] tracking-[0.05em] uppercase underline underline-offset-4"
          >
            Edit address
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSave(form);
          if (result.error) {
            setError(result.error);
            return;
          }
          // The server has the new address; reload so every block on the page reads it.
          window.location.reload();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="sa-firstName">Όνομα</label>
          <input id="sa-firstName" className={inputClass} value={form.firstName} onChange={set("firstName")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="sa-lastName">Επώνυμο</label>
          <input id="sa-lastName" className={inputClass} value={form.lastName} onChange={set("lastName")} />
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="sa-company">Εταιρεία (προαιρετικό)</label>
        <input id="sa-company" className={inputClass} value={form.company ?? ""} onChange={set("company")} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sa-address1">Οδός και αριθμός</label>
        <input id="sa-address1" className={inputClass} value={form.address1} onChange={set("address1")} />
      </div>
      <div>
        <label className={labelClass} htmlFor="sa-address2">Όροφος / κουδούνι (προαιρετικό)</label>
        <input id="sa-address2" className={inputClass} value={form.address2 ?? ""} onChange={set("address2")} />
      </div>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <div>
          <label className={labelClass} htmlFor="sa-postalCode">Τ.Κ.</label>
          <input id="sa-postalCode" className={inputClass} inputMode="numeric" value={form.postalCode} onChange={set("postalCode")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="sa-city">Πόλη</label>
          <input id="sa-city" className={inputClass} value={form.city} onChange={set("city")} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="sa-region">Περιοχή / Νομός (προαιρετικό)</label>
          <input id="sa-region" className={inputClass} value={form.region ?? ""} onChange={set("region")} />
        </div>
        <div>
          <label className={labelClass} htmlFor="sa-phone">Τηλέφωνο</label>
          <input id="sa-phone" className={inputClass} inputMode="tel" value={form.phone} onChange={set("phone")} />
        </div>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => setEditing(false)} disabled={isPending} className="text-xs text-luxe-gray-dark uppercase">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="h-8 border border-luxe-black bg-luxe-black px-3 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50">
          {isPending ? "Saving…" : "Save address"}
        </button>
      </div>
    </form>
  );
}

function toInput(address: Address): ShippingAddressInput {
  return {
    firstName: address.firstName,
    lastName: address.lastName,
    company: address.company ?? "",
    address1: address.address1,
    address2: address.address2 ?? "",
    city: address.city,
    region: address.region ?? "",
    postalCode: address.postalCode,
    phone: address.phone ?? "",
  };
}
