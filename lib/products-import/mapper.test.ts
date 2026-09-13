import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mapCsvRowToProductForm } from "@/lib/products-import/mapper";
import { IMPORT_COLUMNS, buildImportTemplateCsv } from "@/lib/products-import/columns";
import { parseProductsCsv } from "@/lib/products-import/csv";

const row = (overrides: Record<string, string> = {}) => ({
  slug: "audit-import",
  name: "Audit",
  description: "d",
  price: "30",
  sku: "AUD-1",
  category: "gynaikeia-sneakers",
  sizes: "38:true:1",
  images: "https://x/y.jpg|front",
  ...overrides,
});

describe("mapCsvRowToProductForm — status", () => {
  it("defaults a blank status to draft, like the product form", () => {
    expect(mapCsvRowToProductForm(row(), new Map()).values.status).toBe("draft");
  });

  it("publishes only on an explicit active", () => {
    expect(mapCsvRowToProductForm(row({ status: "Active" }), new Map()).values.status).toBe("active");
  });

  it("treats a typo as a row error instead of publishing the row", () => {
    // "publishedd" used to fall through to "active".
    const mapped = mapCsvRowToProductForm(row({ status: "publishedd" }), new Map());
    expect(mapped.errors).toHaveLength(1);
    expect(mapped.errors[0]).toMatch(/draft, active or archived/);
  });
});

describe("import column reference", () => {
  it("lists every column the mapper reads, and nothing it ignores", () => {
    // The mapper reads `row.<name>`; the reference is hand-maintained. Diff them.
    const source = readFileSync(new URL("./mapper.ts", import.meta.url), "utf8");
    const read = new Set([...source.matchAll(/\brow\.([A-Za-z]+)\b/g)].map((m) => m[1]));
    const documented = new Set(IMPORT_COLUMNS.map((column) => column.name));
    expect([...read].filter((name) => !documented.has(name))).toEqual([]);
    expect([...documented].filter((name) => !read.has(name))).toEqual([]);
  });

  it("produces a template the parser reads back as one valid row", () => {
    const { rows, parseErrors } = parseProductsCsv(buildImportTemplateCsv());
    expect(parseErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    const mapped = mapCsvRowToProductForm(rows[0], new Map());
    expect(mapped.errors).toEqual([]);
    expect(mapped.values.slug).toBe("mayra-loafer-595");
  });
});
