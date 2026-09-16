"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getEffectivePrice, getListPrice, isOnSale, isSizePurchasable } from "@/lib/product";
import { useCart } from "@/components/providers/CartProvider";
import type { Product } from "@/types";

interface QuickAddDialogProps {
  product: Product;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The mobile counterpart to `QuickViewDialog` — same centred-card shape, deliberately
 * leaner content.
 *
 * `QuickViewDialog` measures 1072px tall on a 375x812 phone because it carries the
 * description, a colour picker and generous padding on top of the size grid — more than a
 * centred card can show without scrolling past the fold. This one keeps the card (image,
 * name, price, sizes, add-to-bag) and drops everything that made the full dialog tall:
 * no description, no colour picker (colour on this catalogue is a separate product, not a
 * variant, so offering a picker here would imply the choice changes what gets added — it
 * would not), tighter padding. `max-h-[85vh]` + internal scroll is still there as a
 * safety net for a product with an unusually long size run, but it shouldn't normally
 * engage.
 */
export function QuickAddDialog({ product, open, onOpenChange }: QuickAddDialogProps) {
  const t = useTranslations("QuickAdd");
  const { addItem, isMutating } = useCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // A card can be re-opened after a successful add; leaving the previous size selected
  // would let a double-tap add a size the customer never looked at this time round.
  // Done on close rather than in an effect on `open` — an effect that setStates
  // synchronously just triggers a second render to undo the first.
  function handleOpenChange(next: boolean) {
    if (!next) setSelectedSize(null);
    onOpenChange(next);
  }

  const soldOut = !product.availableForSale;
  const price = getEffectivePrice(product);
  const [image] = product.images;
  const colorName = product.colors[0]?.name;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] w-full max-w-sm gap-0 overflow-y-auto p-0 sm:max-w-md">
        <DialogTitle className="sr-only">{product.name}</DialogTitle>

        <div className="flex gap-4 p-4">
          {/* Roughly half the card's width — as big as it can be while still leaving room
              for the size grid beside it rather than below it. */}
          <Link
            href={`/products/${product.slug}`}
            className="relative aspect-3/4 w-[48%] shrink-0 overflow-hidden rounded-lg border border-border bg-luxe-gray-light"
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 480px) 48vw, 208px"
              className="object-cover"
            />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="line-clamp-3 text-sm leading-snug">{product.name}</p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className={isOnSale(product) ? "text-destructive" : ""}>{formatMoney(price)}</span>
              {isOnSale(product) ? (
                <span className="text-luxe-gray-dark line-through">{formatMoney(getListPrice(product))}</span>
              ) : null}
            </div>
            {colorName ? (
              <p className="mt-2 text-[10px] tracking-[0.15em] text-luxe-gray-dark uppercase">
                {t("color")}: {colorName}
              </p>
            ) : null}

            <div className="mt-4">
              <p className="text-eyebrow mb-2">{t("size")}</p>
              <div className="flex flex-wrap gap-1.5">
                {product.sizes.map((size) => {
                  const purchasable = isSizePurchasable(product, size.name);
                  return (
                    <button
                      key={size.name}
                      type="button"
                      disabled={!purchasable}
                      aria-pressed={selectedSize === size.name}
                      aria-label={purchasable ? size.name : `${size.name} — ${t("sizeUnavailable")}`}
                      onClick={() => setSelectedSize(size.name)}
                      className={cn(
                        "flex h-11 min-w-11 items-center justify-center border px-2.5 text-sm transition-colors",
                        !purchasable && "cursor-not-allowed border-border text-luxe-gray-dark/40 line-through",
                        purchasable && selectedSize === size.name && "border-luxe-black bg-luxe-black text-luxe-white",
                        purchasable && selectedSize !== size.name && "border-border"
                      )}
                    >
                      {size.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-4">
          <button
            type="button"
            disabled={soldOut || !selectedSize || isMutating}
            onClick={async () => {
              if (!selectedSize) return;
              await addItem({
                productId: product.id,
                color: colorName ?? "",
                size: selectedSize,
                quantity: 1,
              });
              handleOpenChange(false);
            }}
            className="flex h-12 w-full items-center justify-center bg-luxe-black text-sm font-medium tracking-[0.08em] text-luxe-white uppercase transition-opacity disabled:opacity-40"
          >
            {soldOut ? t("soldOut") : selectedSize ? t("addToBag") : t("selectSize")}
          </button>
          <Link
            href={`/products/${product.slug}`}
            className="text-center text-xs tracking-[0.05em] text-luxe-gray-dark uppercase underline underline-offset-4"
          >
            {t("viewDetails")}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
