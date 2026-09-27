import type { RawCsvRow } from "@/lib/products-import/csv";
import { slugify } from "@/lib/slug";

/**
 * CSV v1 delimiter conventions — one row per product, flat columns with delimited
 * sub-fields for the repeating structures:
 *
 *   images            "https://…/a.jpg|Front view;;https://…/b.jpg|Back view"  (url|alt, ;;-separated)
 *   imageFilenames    "front.jpg|back.jpg"  (alternative to `images` — matched by filename
 *                      against files uploaded alongside the CSV, case-insensitive)
 *   colors            "Black#111111;;Ivory#F5F0EA"  (name#hex, ;;-separated)
 *   sizes             "S:true:12:SKU-S;;M:false:0"  (name:inStock:quantity:sku, sku optional, ;;-separated)
 *   tags/materials/careInstructions/collectionIds   "a|b|c"  (pipe-separated flat lists)
 *
 * Deliberately excluded from v1 (edit via the single-product form after import):
 * videos, per-color image overrides, SEO override, relatedProductIds.
 */
const LIST_SEP = "|";
const GROUP_SEP = ";;";

function splitList(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(LIST_SEP).map((s) => s.trim()).filter(Boolean);
}

function splitGroups(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(GROUP_SEP).map((s) => s.trim()).filter(Boolean);
}

/** "true", "yes", "1", "x", "ναι" — whatever a person typed into a yes/no column in Excel. */
function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["true", "yes", "y", "1", "x", "ναι", "ν", "✓"].includes(value.trim().toLowerCase());
}

/**
 * A number as Greek Excel writes it: "89,90" as well as "89.90", with an optional € and
 * thousands separators ("1.250,00"). `Number("89,90")` is NaN, so every comma-decimal price
 * used to fail the row as "price is required".
 */
export function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  let text = value.replace(/[€\s\u00a0]/g, "");
  if (text === "") return undefined;
  if (text.includes(",") && text.includes(".")) {
    // Whichever separator comes last is the decimal one.
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Sizes in any of the shapes a person writes them, one quantity per size:
 *
 *   "36:true:1;;37:true:2"   the original name:sellable:quantity[:sku] groups
 *   "36:1;;37:2" / "36=1, 37=2" / "36x1 | 37x2"   size and quantity
 *   "36, 37, 38" / "36-41"    sizes (or a range) with one pair each
 *
 * "36:2" used to be read as name "36", sellable "2", quantity missing — so it imported with
 * no stock at all and nothing said so.
 */
export function parseSizes(value: string | undefined): { name: string; inStock: boolean; quantity: number; sku?: string }[] {
  if (!value?.trim()) return [];
  const groups = value.includes(GROUP_SEP) ? splitGroups(value) : value.split(/[,|;\n]/).map((g) => g.trim()).filter(Boolean);
  const sizes: { name: string; inStock: boolean; quantity: number; sku?: string }[] = [];
  for (const group of groups) {
    const range = group.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (range && Number(range[2]) > Number(range[1]) && Number(range[2]) - Number(range[1]) <= 20) {
      for (let size = Number(range[1]); size <= Number(range[2]); size++) sizes.push({ name: String(size), inStock: true, quantity: 1 });
      continue;
    }
    // "x" only between digits ("36x2"), so a size named "XL" survives.
    const parts = group.split(/\s*[:=×]\s*|(?<=\d)\s*x\s*(?=\d)/i).map((p) => p.trim());
    const [name, second, third, sku] = parts;
    if (!name) continue;
    if (parts.length >= 3 || (second !== undefined && /^(true|false)$/i.test(second))) {
      // The original four-part form.
      sizes.push({ name, inStock: (second ?? "true").toLowerCase() !== "false", quantity: parseNumber(third) ?? 0, sku: sku || undefined });
    } else {
      const quantity = second === undefined ? 1 : (parseNumber(second) ?? 0);
      sizes.push({ name, inStock: true, quantity });
    }
  }
  return sizes;
}

/** "active", "live", "published", "ενεργό" → active; "πρόχειρο" → draft; and so on. */
function statusAlias(value: string): string {
  const aliases: Record<string, string> = {
    live: "active", published: "active", publish: "active", "ενεργό": "active", "ενεργο": "active", "δημοσιευμένο": "active",
    "πρόχειρο": "draft", "προχειρο": "draft", "αρχειοθετημένο": "archived",
  };
  return aliases[value] ?? value;
}

/** "Γυναικεία", "ανδρικά", "παιδικά" as well as the English values. */
function genderAlias(value: string | undefined): string {
  const v = value?.trim().toLowerCase() ?? "";
  if (!v) return "unisex";
  if (/^(women|woman|female|γυναικ)/.test(v)) return "women";
  if (/^(men|man|male|ανδρ)/.test(v)) return "men";
  if (/^(kids|kid|child|παιδ)/.test(v)) return "kids";
  return v;
}

/**
 * Blank means draft — the same default as the single-product form, for the same reason:
 * nothing should reach the storefront because a column was left empty. Publishing is the
 * explicit `status=active`. Anything else ("publishedd") is a row error rather than a
 * silent fallback, because the previous fallback was "active": a typo in this column used
 * to be exactly the thing that put a row live.
 */
function normalizeStatus(value: string | undefined): { status: "draft" | "active" | "archived"; error?: string } {
  const normalized = value ? statusAlias(value.trim().toLowerCase()) : undefined;
  if (!normalized) return { status: "draft" };
  if (normalized === "draft" || normalized === "active" || normalized === "archived") return { status: normalized };
  return { status: "draft", error: `status: "${value}" isn't one of draft, active or archived.` };
}

export interface MappedRow {
  /** A plain object shaped like ProductFormValues — not yet validated. Feed to productFormSchema.safeParse. */
  values: Record<string, unknown>;
  /** Mapping-time problems (e.g. an image filename with no matching upload) — distinct from schema validation errors. */
  errors: string[];
}

/** `resolvedImageUrls` maps a lowercased uploaded filename to its Vercel Blob URL. */
export function mapCsvRowToProductForm(row: RawCsvRow, resolvedImageUrls: Map<string, string>): MappedRow {
  const errors: string[] = [];

  let images: { src: string; alt: string }[] = [];
  if (row.images?.trim()) {
    images = splitGroups(row.images).map((entry) => {
      const [src, alt] = entry.split(LIST_SEP);
      const trimmedSrc = (src ?? "").trim();
      return { src: trimmedSrc, alt: (alt ?? "").trim() || row.name?.trim() || trimmedSrc };
    });
  } else if (row.imageFilenames?.trim()) {
    for (const filename of splitList(row.imageFilenames)) {
      const url = resolvedImageUrls.get(filename.toLowerCase());
      if (!url) {
        errors.push(`Image file "${filename}" was listed but not found among the uploaded files.`);
        continue;
      }
      images.push({ src: url, alt: row.name?.trim() || filename });
    }
  }

  const colors = splitGroups(row.colors).map((entry) => {
    const [name, hex] = entry.split("#");
    return { name: (name ?? "").trim(), hex: hex ? `#${hex.trim()}` : "" };
  });

  const sizes = parseSizes(row.sizes);

  const status = normalizeStatus(row.status);
  if (status.error) errors.push(status.error);

  const values: Record<string, unknown> = {
    // Optional now, like on the product form: written from the name when blank.
    slug: row.slug?.trim() || slugify(row.name ?? ""),
    name: row.name?.trim() ?? "",
    description: row.description?.trim() ?? "",
    price: parseNumber(row.price),
    compareAtPrice: parseNumber(row.compareAtPrice),
    salePrice: parseNumber(row.salePrice),
    costPrice: parseNumber(row.costPrice),
    currencyCode: row.currencyCode?.trim() || "EUR",
    images,
    colors,
    sizes,
    category: row.category?.trim() ?? "",
    collectionIds: splitList(row.collectionIds),
    tags: splitList(row.tags),
    gender: genderAlias(row.gender),
    season: row.season?.trim() || undefined,
    materials: splitList(row.materials),
    careInstructions: splitList(row.careInstructions),
    relatedProductIds: [],
    isNew: parseBool(row.isNew, false),
    isSale: parseBool(row.isSale, false),
    isPreorder: parseBool(row.isPreorder, false),
    isBackorder: parseBool(row.isBackorder, false),
    fulfillmentNote: row.fulfillmentNote?.trim() || undefined,
    sku: row.sku?.trim() ?? "",
    barcode: row.barcode?.trim() || undefined,
    inventoryPolicy: row.inventoryPolicy?.trim() || "deny",
    shippingWeightGrams: parseNumber(row.shippingWeightGrams),
    availableForSale: parseBool(row.availableForSale, true),
    brand: row.brand?.trim() || undefined,
    vendor: row.vendor?.trim() || undefined,
    status: status.status,
  };

  return { values, errors };
}
