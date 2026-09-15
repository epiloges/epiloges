"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface VoucherQueueRow {
  orderId: string;
  reference: string;
  trackingNumber: string;
  recipient: string;
  city: string;
  /** Cash to collect, formatted, or null. */
  cod: string | null;
  /** ISO timestamp, or null while unprinted. */
  printedAt: string | null;
  /** Parcels on the voucher — labels this row prints. Absent means one. */
  pieces?: number;
}

interface VoucherPrintQueueProps {
  rows: VoucherQueueRow[];
}

const buttonClass =
  "h-10 bg-luxe-black px-4 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50 inline-flex items-center";
const outlineClass = "h-8 inline-flex items-center border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase";

/**
 * The day's vouchers, printed the way a laser printer wants them: pick the ones that
 * are ready, say which slot of the A4 sheet to start on, print once. ACS lays three
 * labels to a sheet, so three vouchers is one sheet and two leaves a slot — which is why
 * the start position exists: next time, begin on slot 3 of that same sheet.
 */
export function VoucherPrintQueue({ rows }: VoucherPrintQueueProps) {
  const router = useRouter();
  const unprinted = useMemo(() => rows.filter((row) => !row.printedAt), [rows]);
  const printed = useMemo(() => rows.filter((row) => row.printedAt), [rows]);

  // Everything unprinted is selected unless unticked. Tracking the exceptions rather than
  // the selection means a voucher that appears after a refresh is ticked by default and
  // one that got printed elsewhere simply drops out — no state to reconcile.
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const [start, setStart] = useState<1 | 2 | 3>(1);

  // The PDF opens in a new tab; when the admin comes back, show the vouchers as printed.
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [router]);

  const chosen = unprinted.filter((row) => !unticked.has(row.orderId));
  const tooMany = chosen.length > 10;
  // Labels, not vouchers: a two-parcel voucher is two labels and takes two slots.
  const labelCount = chosen.reduce((sum, row) => sum + (row.pieces ?? 1), 0);
  const sheets = labelCount === 0 ? 0 : Math.ceil((labelCount + (start - 1)) / 3);
  const href = (format: "laser" | "thermal") =>
    `/api/admin/courier/voucher?orders=${chosen.map((row) => encodeURIComponent(row.orderId)).join(",")}&format=${format}&start=${start}`;

  const toggle = (orderId: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="border border-border bg-luxe-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium tracking-[0.05em] uppercase">To print</h3>
            <p className="mt-1 max-w-2xl text-xs text-luxe-gray-dark">
              Vouchers created but not yet printed. Three fit on one A4 sheet; print when you have three, or
              whatever is left at the end of the day. If a sheet still has empty slots, set the start position
              so the next print begins there.
            </p>
          </div>
          {unprinted.length > 0 ? (
            <button
              type="button"
              onClick={() => setUnticked(chosen.length === unprinted.length ? new Set(unprinted.map((row) => row.orderId)) : new Set())}
              className="text-xs underline underline-offset-4"
            >
              {chosen.length === unprinted.length ? "Select none" : "Select all"}
            </button>
          ) : null}
        </div>

        {unprinted.length === 0 ? (
          <p className="text-sm text-luxe-gray-dark">Nothing waiting to be printed.</p>
        ) : (
          <>
            <ul className="divide-y divide-border border border-border">
              {unprinted.map((row) => (
                <li key={row.orderId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={!unticked.has(row.orderId)}
                    onChange={() => toggle(row.orderId)}
                    className="size-4 accent-luxe-black"
                    aria-label={`Print voucher for order ${row.reference}`}
                  />
                  <Link href={`/admin/orders/${row.orderId}`} className="font-mono text-xs hover:underline">
                    #{row.reference}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">
                    {row.recipient}
                    <span className="text-luxe-gray-dark"> · {row.city}</span>
                  </span>
                  {row.cod ? <span className="bg-amber-100 px-1.5 py-px text-xs text-amber-800">ΑΝΤ. {row.cod}</span> : null}
                  <span className="font-mono text-xs text-luxe-gray-dark">
                    {row.trackingNumber}
                    {row.pieces && row.pieces > 1 ? ` · ${row.pieces} labels` : ""}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-eyebrow">Start at slot</span>
                <select
                  value={start}
                  onChange={(e) => setStart(Number(e.target.value) as 1 | 2 | 3)}
                  className="h-10 border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black"
                >
                  <option value={1}>1 — fresh sheet</option>
                  <option value={2}>2 — one label already used</option>
                  <option value={3}>3 — two labels already used</option>
                </select>
              </label>
              {chosen.length === 0 || tooMany ? (
                <span className={`${buttonClass} cursor-not-allowed opacity-50`}>Print A4</span>
              ) : (
                <a href={href("laser")} target="_blank" rel="noopener" className={buttonClass}>
                  Print A4 — {labelCount} {labelCount === 1 ? "label" : "labels"}, {sheets} {sheets === 1 ? "sheet" : "sheets"}
                </a>
              )}
              {chosen.length === 0 || tooMany ? null : (
                <a href={href("thermal")} target="_blank" rel="noopener" className={outlineClass}>
                  Thermal instead
                </a>
              )}
              {tooMany ? <span className="text-xs text-destructive">ACS prints at most ten at once — untick a few.</span> : null}
            </div>
          </>
        )}
      </div>

      <div className="border border-border bg-luxe-white p-6">
        <h3 className="text-sm font-medium tracking-[0.05em] uppercase">Printed, waiting for pickup</h3>
        <p className="mt-1 mb-4 text-xs text-luxe-gray-dark">
          These go on the next pickup list. Reprint one if a label was damaged.
        </p>
        {printed.length === 0 ? (
          <p className="text-sm text-luxe-gray-dark">No printed vouchers waiting.</p>
        ) : (
          <ul className="divide-y divide-border border border-border">
            {printed.map((row) => (
              <li key={row.orderId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <Link href={`/admin/orders/${row.orderId}`} className="font-mono text-xs hover:underline">
                  #{row.reference}
                </Link>
                <span className="min-w-0 flex-1 truncate">
                  {row.recipient}
                  <span className="text-luxe-gray-dark"> · {row.city}</span>
                </span>
                <span className="font-mono text-xs text-luxe-gray-dark">{row.trackingNumber}</span>
                <a
                  href={`/api/admin/courier/voucher?order=${encodeURIComponent(row.orderId)}&format=laser`}
                  target="_blank"
                  rel="noopener"
                  className="text-xs underline underline-offset-4"
                >
                  Reprint
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

