"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { updateSizeStock } from "@/app/admin/(dashboard)/inventory/actions";

interface InventoryStockCellProps {
  sizeId: string;
  quantity: number;
  inStock: boolean;
}

/**
 * The editable stock cell on the Inventory page: a number that saves on blur or Enter, and
 * the sellable switch. Saves one size at a time and shows the server's answer, so what the
 * row displays is always what the database holds.
 */
export function InventoryStockCell({ sizeId, quantity: initialQuantity, inStock: initialInStock }: InventoryStockCellProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [draft, setDraft] = useState(String(initialQuantity));
  const [inStock, setInStock] = useState(initialInStock);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function commitQuantity() {
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(next)) {
      setDraft(String(quantity));
      return;
    }
    if (next === quantity) return;
    startTransition(async () => {
      const result = await updateSizeStock(sizeId, { quantity: next });
      if (result.error) {
        setError(result.error);
        setDraft(String(quantity));
        return;
      }
      setError(null);
      setQuantity(result.quantity ?? next);
      setDraft(String(result.quantity ?? next));
    });
  }

  function toggleSellable(next: boolean) {
    const previous = inStock;
    setInStock(next);
    startTransition(async () => {
      const result = await updateSizeStock(sizeId, { inStock: next });
      if (result.error) {
        setError(result.error);
        setInStock(previous);
        return;
      }
      setError(null);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={0}
          step={1}
          value={draft}
          disabled={isPending}
          aria-label="Stock"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitQuantity}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            if (event.key === "Escape") setDraft(String(quantity));
          }}
          className="h-8 w-20 border border-border bg-transparent px-2 text-sm tabular-nums outline-none focus:border-luxe-black disabled:opacity-50"
        />
        <label className="flex items-center gap-1.5 text-xs text-luxe-gray-dark">
          <Switch checked={inStock} disabled={isPending} onCheckedChange={toggleSellable} aria-label="Sellable" />
          {inStock ? "Sellable" : "Withdrawn"}
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
