"use client";

import { useState, useTransition } from "react";
import type { IssuePickupListState } from "@/app/admin/(dashboard)/courier/actions";
import type { PickupListSummary } from "@/lib/courier/types";

interface PickupListPanelProps {
  /** YYYY-MM-DD, Athens — the next day ACS will collect, so Monday when opened on a Sunday. */
  today: string;
  existing: PickupListSummary[];
  existingError: string | null;
  onIssue: (date: string) => Promise<IssuePickupListState>;
}

const inputClass = "h-10 border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black";
const buttonClass =
  "h-10 bg-luxe-black px-4 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50";

function pdfHref(pickupListNo: string, date: string) {
  return `/api/admin/courier/pickup-list?no=${encodeURIComponent(pickupListNo)}&date=${date}`;
}

export function PickupListPanel({ today, existing, existingError, onIssue }: PickupListPanelProps) {
  const [date, setDate] = useState(today);
  const [state, setState] = useState<IssuePickupListState | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div className="border border-border bg-luxe-white p-6">
        <h3 className="mb-1 text-sm font-medium tracking-[0.05em] uppercase">Close the day</h3>
        <p className="mb-4 max-w-2xl text-xs text-luxe-gray-dark">
          Issues the ACS pickup list: every voucher printed for this date becomes a shipment the courier will
          collect, and the list is what the driver signs. Do it once everything for the day is packed and
          printed — vouchers on a list can no longer be cancelled from here.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-eyebrow">Pickup date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <button
            type="button"
            disabled={isPending || !date}
            onClick={() =>
              startTransition(async () => {
                setState(await onIssue(date));
              })
            }
            className={buttonClass}
          >
            {isPending ? "Issuing…" : "Issue pickup list"}
          </button>
        </div>

        {state?.error ? <p className="mt-4 text-sm text-destructive">{state.error}</p> : null}

        {state?.result?.pickupListNo ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-green-200 bg-green-50 p-3 text-sm">
            <span>
              Pickup list <span className="font-mono">{state.result.pickupListNo}</span> issued for {date}.
            </span>
            <a
              href={pdfHref(state.result.pickupListNo, date)}
              target="_blank"
              rel="noopener"
              className="h-8 inline-flex items-center border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase"
            >
              Print list (PDF)
            </a>
          </div>
        ) : null}

        {state?.result && !state.result.pickupListNo ? (
          <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm">
            <p>
              ACS will not close the day yet: {state.result.unprintedVouchers.length}{" "}
              {state.result.unprintedVouchers.length === 1 ? "voucher has" : "vouchers have"} not been printed.
              Print each one from its order (or cancel it), then try again.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2 font-mono text-xs">
              {state.result.unprintedVouchers.map((voucher) => (
                <li key={voucher} className="bg-luxe-white px-2 py-1">
                  {voucher}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border border-border bg-luxe-white p-6">
        <h3 className="mb-1 text-sm font-medium tracking-[0.05em] uppercase">Lists for {today}</h3>
        <p className="mb-4 text-xs text-luxe-gray-dark">Already issued for this pickup date. Reprint one if the driver needs another copy.</p>
        {existingError ? (
          <p className="text-sm text-destructive">{existingError}</p>
        ) : existing.length === 0 ? (
          <p className="text-sm text-luxe-gray-dark">No pickup list has been issued for this date yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {existing.map((list) => (
              <li key={list.pickupListNo} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-mono">{list.pickupListNo}</span>
                  <span className="ml-2 text-xs text-luxe-gray-dark">
                    {list.voucherCount} {list.voucherCount === 1 ? "voucher" : "vouchers"} · {list.issuedAt.replace("T", " ").slice(0, 16)}
                  </span>
                </span>
                <a
                  href={pdfHref(list.pickupListNo, today)}
                  target="_blank"
                  rel="noopener"
                  className="h-8 inline-flex items-center border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase"
                >
                  Print list (PDF)
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
