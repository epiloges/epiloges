import type { Category, Product } from "@/types";
import { ROUTES } from "@/constants/routes";

/**
 * The catalogue as a comparison engine or Merchant Center wants it: one flat record per
 * product with everything already resolved — absolute URLs, the Greek name, the category
 * path as text, the price the shopper pays, which sizes are actually in stock.
 *
 * Pure. Both feed writers (skroutz.ts, google-merchant.ts) read from this so they cannot
 * disagree about a price or an availability, and so the whole thing is unit-testable
 * without a database.
 */
export interface FeedItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  images: string[];
  /** "Γυναικεία > Πέδιλα" — outermost first, hidden gender parents included on purpose. */
  categoryPath: string[];
  gender: Product["gender"];
  brand?: string;
  sku: string;
  gtin?: string;
  /** VAT-inclusive, what the shopper pays. */
  price: number;
  /** VAT-inclusive list price when the item is on sale, else undefined. */
  listPrice?: number;
  currency: string;
  inStock: boolean;
  fulfilment: "in-stock" | "preorder" | "backorder" | "out-of-stock";
  sizes: { name: string; inStock: boolean; sku?: string; gtin?: string }[];
  colors: string[];
  materials: string[];
  weightGrams?: number;
}

export interface FeedContext {
  siteUrl: string;
  /** Every category, so a product's path can be walked up by parentId. */
  categories: Category[];
}

/** Greek path of a category and its ancestors, root first. Uses `nameEl` when present. */
export function categoryPath(categoryId: string, categories: Category[]): string[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const path: string[] = [];
  let current = byId.get(categoryId);
  for (let depth = 0; current && depth < 10; depth += 1) {
    path.unshift(current.nameEl ?? current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function toFeedItem(product: Product, context: FeedContext): FeedItem {
  const base = context.siteUrl.replace(/\/$/, "");
  const selling = product.salePrice ?? product.price;
  const list = product.salePrice ? product.price : product.compareAtPrice;
  const listPrice = list && list.amount > selling.amount ? list.amount : undefined;
  const sizes = product.sizes.map((size) => ({ name: size.name, inStock: size.inStock, sku: size.sku, gtin: size.barcode }));
  const anySize = sizes.length === 0 || sizes.some((size) => size.inStock);
  const inStock = product.availableForSale && anySize;

  return {
    id: product.id,
    slug: product.slug,
    name: product.nameEl ?? product.name,
    description: (product.descriptionEl ?? product.description).trim(),
    url: `${base}${ROUTES.product(product.slug)}`,
    images: product.images.map((image) => image.src),
    categoryPath: categoryPath(product.categoryId, context.categories),
    gender: product.gender,
    brand: product.brand?.trim() || undefined,
    sku: product.sku,
    gtin: product.barcode?.trim() || undefined,
    price: selling.amount,
    listPrice,
    currency: selling.currencyCode,
    inStock,
    fulfilment: product.isPreorder ? "preorder" : product.isBackorder ? "backorder" : inStock ? "in-stock" : "out-of-stock",
    sizes,
    colors: product.colors.map((color) => color.name),
    materials: product.materials,
    weightGrams: product.shippingWeightGrams,
  };
}

/** Published products only, and never one the admin marked noindex — a feed is a public listing too. */
export function toFeedItems(products: Product[], context: FeedContext): FeedItem[] {
  return products.filter((product) => product.status === "active" && !product.seo?.noIndex).map((product) => toFeedItem(product, context));
}

/** XML text: escaped, never CDATA, so a `]]>` inside a description cannot break the document. */
export function xmlText(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters are not legal in XML 1.0 at all.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

/** Plain-text description for feeds: no markup, collapsed whitespace, capped. */
export function feedDescription(text: string, max = 5000): string {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

export function money(amount: number): string {
  return amount.toFixed(2);
}
