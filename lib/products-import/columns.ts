/**
 * The CSV columns the import understands, in one place, so the admin page can show them
 * and the template can be generated from them. Before this the format existed only as a
 * comment in mapper.ts — an admin standing in front of "Choose file" had nothing to go on.
 *
 * Kept in sync with mapCsvRowToProductForm by hand; a column listed here that the mapper
 * ignores is a documentation bug, and the test in mapper.test.ts checks for exactly that.
 */
export interface ImportColumn {
  name: string;
  required?: boolean;
  description: string;
  example: string;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { name: "slug", description: "Optional — written from the name when blank. An existing slug UPDATES that product.", example: "mayra-loafer-595" },
  { name: "name", required: true, description: "Product name as shown to customers.", example: "Μαύρα σουέντ loafer" },
  { name: "description", description: "Optional — written from the name and sizes when blank.", example: "Σουέντ loafer με ανάγλυφο σχέδιο." },
  { name: "price", required: true, description: "Price in EUR incl. VAT. 89,90 and 89.90 both work.", example: "59" },
  { name: "salePrice", description: "Optional. Must be lower than price.", example: "39" },
  { name: "compareAtPrice", description: "Optional 'was' price. Must be at or above price.", example: "59" },
  { name: "costPrice", description: "Optional. Internal only.", example: "22.50" },
  { name: "sku", description: "Optional — made for you when blank. Unique per product.", example: "595-1" },
  { name: "barcode", description: "Optional EAN.", example: "5200000000001" },
  { name: "category", required: true, description: "Category slug (see Categories). An unknown slug creates a HIDDEN category — fix typos before importing.", example: "gynaikeia-loafers" },
  { name: "gender", description: "women, men, unisex or kids. Blank = unisex.", example: "women" },
  { name: "status", description: "draft (default when blank), active or archived. Only active rows reach the storefront.", example: "draft" },
  { name: "images", description: "url|alt pairs separated by ;; — or use imageFilenames.", example: "https://…/front.webp|Μπροστά;;https://…/side.webp|Πλάι" },
  { name: "imageFilenames", description: "Filenames of images uploaded alongside the CSV, separated by |.", example: "595-1-front.webp|595-1-side.webp" },
  { name: "sizes", required: true, description: "Sizes and pairs: 36:1, 37:2 — or just 36, 37, 38 (one pair each) — or a range like 36-41.", example: "36:true:1;;37:true:2;;38:false:0" },
  { name: "colors", description: "name#hex groups separated by ;;.", example: "Μαύρο#111111;;Καφέ#6B4A2B" },
  { name: "brand", description: "Optional.", example: "Mont Martre Paris" },
  { name: "vendor", description: "Optional supplier.", example: "" },
  { name: "tags", description: "Pipe-separated.", example: "loafer|suede" },
  { name: "materials", description: "Pipe-separated.", example: "Σουέντ|Δέρμα" },
  { name: "careInstructions", description: "Pipe-separated.", example: "" },
  { name: "collectionIds", description: "Pipe-separated collection ids (from Collections).", example: "" },
  { name: "season", description: "spring-summer, autumn-winter, resort or all-season.", example: "autumn-winter" },
  { name: "isNew", description: "true/false.", example: "true" },
  { name: "isSale", description: "true/false. Set automatically when salePrice is given.", example: "" },
  { name: "isPreorder", description: "true/false.", example: "" },
  { name: "isBackorder", description: "true/false.", example: "" },
  { name: "inventoryPolicy", description: "deny (default) or continue (allow overselling).", example: "deny" },
  { name: "availableForSale", description: "true (default) or false.", example: "" },
  { name: "shippingWeightGrams", description: "Optional whole number.", example: "900" },
  { name: "fulfillmentNote", description: "Optional note shown at checkout.", example: "" },
  { name: "currencyCode", description: "Defaults to EUR.", example: "" },
];

function csvCell(value: string): string {
  return /[",\n;|]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A header row plus one example row, so the file opens straight into a spreadsheet correctly. */
export function buildImportTemplateCsv(): string {
  const header = IMPORT_COLUMNS.map((column) => column.name).join(",");
  const example = IMPORT_COLUMNS.map((column) => csvCell(column.example)).join(",");
  return `${header}\n${example}\n`;
}
