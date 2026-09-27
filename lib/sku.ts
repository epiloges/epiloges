/**
 * Per-size SKUs, derived from the product's SKU.
 *
 * A shoe is bought and sold by the pair, not by the style, so the unit that actually moves
 * through the stockroom is "9262 in a 36" — and that is the thing a barcode, a stock count
 * or a supplier note needs a code for. Typing eight of them by hand for every product, each
 * one differing from the last by two characters, is how `9262-37` ends up on the 38.
 *
 * Only 5 of the 1050 sizes in this catalogue carry a SKU today, and those five disagree
 * with their own product's code, so there was no existing convention to preserve. This one
 * is the shop's own: the product SKU, a hyphen, the size.
 */

/** `9262` + `36` → `9262-36`. Null when either half is missing — nothing to derive from. */
export function deriveSizeSku(productSku: string | undefined, sizeName: string | undefined): string | null {
  const sku = productSku?.trim();
  const size = sizeName?.trim();
  if (!sku || !size) return null;
  return `${sku}-${size}`;
}

/**
 * Whether a size's SKU is one this shop derived, and may therefore be rewritten when the
 * product SKU or the size changes — as opposed to a supplier's own code, which must be left
 * exactly as it was typed.
 *
 * Two ways to be ours, because either half can be the one that just changed:
 *
 * - It ends with the size. The product SKU was edited (`9262-36` while the product is now
 *   `9270`), so the prefix no longer matches but the suffix still identifies the row.
 * - It starts with the product SKU. The SIZE was edited, mid-typing — a row renamed from
 *   `3` to `36` still holds `9262-3`, which matches no size but is plainly still ours.
 *
 * A supplier code is only mistaken for ours if it happens to end in `-{size}`. That is rare,
 * and the field is visible and editable when it happens.
 */
export function isDerivedSizeSku(
  currentSku: string | undefined,
  productSku: string | undefined,
  sizeName: string | undefined
): boolean {
  const current = currentSku?.trim();
  if (!current) return true; // Empty is free to fill.

  const size = sizeName?.trim();
  if (size && current.endsWith(`-${size}`)) return true;

  const sku = productSku?.trim();
  return Boolean(sku && current.startsWith(`${sku}-`));
}

/**
 * A product SKU for when the form is saved without one: the first letters of the slug plus a
 * random suffix — `dermatino-mpotaki` → `DER-7K2QM`. Short enough to read off a label, and
 * random enough that two products created the same minute don't collide (the column is
 * unique, and a collision is reported as a readable error rather than lost).
 */
export function generateSku(slug: string): string {
  const prefix = (slug.replace(/[^a-z0-9]/gi, "").slice(0, 3) || "EP").toUpperCase();
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(5)), (byte) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[byte % 32]).join("");
  return `${prefix}-${suffix}`;
}
