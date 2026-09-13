"use client";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { isSizePurchasable } from "@/lib/product";
import type { Product } from "@/types";

interface VariantSelectorProps {
  product: Product;
  selectedColor: string;
  selectedSize: string | null;
  onSelectColor: (color: string) => void;
  onSelectSize: (size: string) => void;
  onOpenSizeGuide?: () => void;
  /** Called instead of onSelectSize when a size is out of stock — omit to keep the size simply inert. */
  onRequestNotify?: (size: string) => void;
}

/** At or below this many units a size is flagged as running out. */
const LOW_STOCK_UNITS = 2;

export function VariantSelector({
  product,
  selectedColor,
  selectedSize,
  onSelectColor,
  onSelectSize,
  onOpenSizeGuide,
  onRequestNotify,
}: VariantSelectorProps) {
  const t = useTranslations("Pdp");
  return (
    <div className="space-y-6">
      {/* Omitted entirely for a product with no colour variants, which previously still
          rendered the label as a dangling "COLOR —" above an empty row of swatches. */}
      {product.colors.length > 0 ? (
        <div>
          <p className="text-eyebrow mb-2">{t("color")} — {selectedColor}</p>
          <div className="flex items-center gap-2">
            {product.colors.map((color) => (
              <button
                key={color.name}
                type="button"
                aria-label={color.name}
                aria-pressed={selectedColor === color.name}
                onClick={() => onSelectColor(color.name)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border-2 transition-colors",
                  selectedColor === color.name ? "border-luxe-black" : "border-transparent"
                )}
              >
                <span className="block size-6 rounded-full border border-border" style={{ backgroundColor: color.hex }} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-eyebrow">{t("size")}</p>
          {onOpenSizeGuide ? (
            <button
              type="button"
              onClick={onOpenSizeGuide}
              className="text-xs text-luxe-gray-dark underline underline-offset-4 hover:text-luxe-black"
            >
              {t("sizeGuide")}
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((size) => {
            const purchasable = isSizePurchasable(product, size.name);
            const lowStock = size.quantity > 0 && size.quantity <= LOW_STOCK_UNITS;
            return (
              <button
                key={size.name}
                type="button"
                aria-disabled={!purchasable}
                aria-pressed={selectedSize === size.name}
                aria-label={!purchasable && onRequestNotify ? `Notify me when size ${size.name} is back in stock` : undefined}
                onClick={() => (purchasable ? onSelectSize(size.name) : onRequestNotify?.(size.name))}
                className={cn(
                  "relative flex h-11 min-w-11 items-center justify-center border px-3 text-sm transition-colors",
                  !purchasable && !onRequestNotify && "cursor-not-allowed border-border text-luxe-gray-dark/40 line-through",
                  !purchasable && onRequestNotify && "cursor-pointer border-border text-luxe-gray-dark/40 line-through hover:border-luxe-black",
                  purchasable && selectedSize === size.name && "border-luxe-black bg-luxe-black text-luxe-white",
                  purchasable && selectedSize !== size.name && "border-border hover:border-luxe-black"
                )}
              >
                {size.name}
                {purchasable && lowStock && selectedSize !== size.name ? (
                  <span className="absolute -top-1.5 -right-1.5 size-2 rounded-full bg-amber-500" title={t("lowStock")} />
                ) : null}
              </button>
            );
          })}
        </div>
        {/* The dot alone read as "sold out" — red, on every size of a shop that stocks one or
            two pairs per size. Amber, rarer, and spelled out once underneath. */}
        {product.sizes.some((size) => isSizePurchasable(product, size.name) && size.quantity > 0 && size.quantity <= LOW_STOCK_UNITS) ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-luxe-gray-dark">
            <span className="inline-block size-2 rounded-full bg-amber-500" aria-hidden />
            {t("lowStock")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
