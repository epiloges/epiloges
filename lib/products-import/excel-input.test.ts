import { describe, expect, it } from "vitest";
import { parseNumber, parseSizes, mapCsvRowToProductForm } from "./mapper";
import { decodeCsvBytes, parseProductsCsv } from "./csv";

/** What a Greek shop's Excel actually produces, rather than what the template example shows. */
describe("import accepts Excel-shaped input", () => {
  it("reads comma-decimal and euro-sign prices", () => {
    expect(parseNumber("89,90")).toBe(89.9);
    expect(parseNumber("89.90")).toBe(89.9);
    expect(parseNumber("€ 1.250,00")).toBe(1250);
    expect(parseNumber("1,250.00")).toBe(1250);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("abc")).toBeUndefined();
  });

  it("reads size:quantity, plain lists and ranges — and keeps the original form", () => {
    expect(parseSizes("36:1;;37:2")).toEqual([
      { name: "36", inStock: true, quantity: 1 },
      { name: "37", inStock: true, quantity: 2 },
    ]);
    expect(parseSizes("36=1, 37=3").map((s) => s.quantity)).toEqual([1, 3]);
    expect(parseSizes("36x2 | 38x1").map((s) => `${s.name}:${s.quantity}`)).toEqual(["36:2", "38:1"]);
    expect(parseSizes("36, 37, 38").map((s) => s.quantity)).toEqual([1, 1, 1]);
    expect(parseSizes("36-39").map((s) => s.name)).toEqual(["36", "37", "38", "39"]);
    expect(parseSizes("36:true:1;;38:false:0:SKU-38")).toEqual([
      { name: "36", inStock: true, quantity: 1, sku: undefined },
      { name: "38", inStock: false, quantity: 0, sku: "SKU-38" },
    ]);
    // A clothing size with an x in it must not be split.
    expect(parseSizes("XL:2")).toEqual([{ name: "XL", inStock: true, quantity: 2 }]);
  });

  it("decodes a file Excel saved as Windows-1253, not just UTF-8", () => {
    const greek = new Uint8Array([0xc4, 0xe5, 0xf1, 0xec, 0xdc, 0xf4, 0xe9, 0xed, 0xef]); // "Δερμάτινο" in cp1253
    expect(decodeCsvBytes(greek)).toBe("Δερμάτινο");
    expect(decodeCsvBytes(new TextEncoder().encode("Δερμάτινο"))).toBe("Δερμάτινο");
  });

  it("parses a semicolon-separated sheet and fills the slug from the Greek name", () => {
    const { rows } = parseProductsCsv("name;price;category;sizes;status;gender\nΔερμάτινο Μποτάκι;89,90;boots;36:1, 37:2;ενεργό;Γυναικεία\n");
    const { values, errors } = mapCsvRowToProductForm(rows[0], new Map());
    expect(errors).toEqual([]);
    expect(values).toMatchObject({ name: "Δερμάτινο Μποτάκι", slug: "dermatino-mpotaki", price: 89.9, status: "active", gender: "women" });
    expect((values.sizes as { quantity: number }[]).map((s) => s.quantity)).toEqual([1, 2]);
  });
});
