import { describe, expect, it } from "vitest";
import { normalizeSeoOverride, productFormSchema } from "@/lib/validation/product";

/**
 * Guards the empty-string-is-not-absent bug: react-hook-form materialises
 * `seo.title`/`seo.description` as "" when the optional SEO block is left untouched,
 * and every read site used `?? product.name`, which does not fall back on "". A
 * product saved through the admin form therefore rendered `<title> | Alexandris
 * Stores</title>` with no meta description, silently, one product per edit.
 */
describe("normalizeSeoOverride", () => {
  it("collapses an all-blank override to undefined, which is what the ?? fallbacks expect", () => {
    expect(normalizeSeoOverride({ title: "", description: "" })).toBeUndefined();
  });

  it("collapses whitespace-only fields too", () => {
    expect(normalizeSeoOverride({ title: "   ", description: "\n\t" })).toBeUndefined();
  });

  it("drops only the blank fields when some are genuinely set", () => {
    expect(normalizeSeoOverride({ title: "Real title", description: "" })).toEqual({
      title: "Real title",
    });
  });

  it("trims values it keeps", () => {
    expect(normalizeSeoOverride({ title: "  Padded  " })).toEqual({ title: "Padded" });
  });

  it("keeps a fully populated override intact", () => {
    const seo = { title: "T", description: "D", ogImage: "https://example.com/a.jpg" };
    expect(normalizeSeoOverride(seo)).toEqual(seo);
  });

  it("passes null and undefined straight through", () => {
    expect(normalizeSeoOverride(null)).toBeUndefined();
    expect(normalizeSeoOverride(undefined)).toBeUndefined();
  });

  it("does not treat an empty object as a stored override", () => {
    expect(normalizeSeoOverride({})).toBeUndefined();
  });
});

/**
 * The rules the admin audit found missing: every one of these was accepted by the form and
 * written to the database, and two of them changed what a customer paid.
 */
describe("productFormSchema", () => {
  const valid = {
    slug: "audit-test",
    name: "Audit test",
    description: "A description",
    price: 50,
    currencyCode: "EUR",
    images: [{ src: "https://blob.example/a.jpg", alt: "Front" }],
    colors: [],
    sizes: [{ name: "38", inStock: true, quantity: 1 }],
    category: "gynaikeia-sneakers",
    collectionIds: [],
    tags: [],
    gender: "women",
    materials: [],
    careInstructions: [],
    relatedProductIds: [],
    isNew: false,
    isSale: false,
    isPreorder: false,
    isBackorder: false,
    sku: "AUDIT-1",
    inventoryPolicy: "deny",
    availableForSale: true,
    status: "draft",
  } as const;

  const firstMessage = (input: unknown) => {
    const result = productFormSchema.safeParse(input);
    return result.success ? null : result.error.issues[0]?.message;
  };

  it("accepts a well-formed product", () => {
    expect(productFormSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a sale price at or above the price — the storefront would charge it", () => {
    expect(firstMessage({ ...valid, salePrice: 80 })).toMatch(/lower than the price/);
    expect(firstMessage({ ...valid, salePrice: 50 })).toMatch(/lower than the price/);
    expect(productFormSchema.safeParse({ ...valid, salePrice: 35 }).success).toBe(true);
  });

  it("refuses a compare-at price below the price", () => {
    expect(firstMessage({ ...valid, compareAtPrice: 30 })).toMatch(/compare-at/i);
  });

  it("trims names and SKUs, and refuses whitespace-only ones", () => {
    const parsed = productFormSchema.safeParse({ ...valid, name: "  Audit test  ", sku: " audit-1 " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Audit test");
      expect(parsed.data.sku).toBe("audit-1");
    }
    expect(firstMessage({ ...valid, name: "   " })).toBe("Name is required");
  });

  it("refuses two sizes with the same name", () => {
    expect(
      firstMessage({ ...valid, sizes: [{ name: "38", inStock: true, quantity: 1 }, { name: "38 ", inStock: true, quantity: 2 }] })
    ).toMatch(/listed twice/);
  });

  it("refuses an image that is not a URL or a site path", () => {
    expect(firstMessage({ ...valid, images: [{ src: "not-a-url", alt: "x" }] })).toMatch(/https:\/\/ or \//);
    expect(productFormSchema.safeParse({ ...valid, images: [{ src: "/images/a.jpg", alt: "x" }] }).success).toBe(true);
  });

  it("refuses more than two decimals, which Postgres would have rounded silently", () => {
    expect(firstMessage({ ...valid, price: 50.999 })).toMatch(/two decimal/);
    expect(productFormSchema.safeParse({ ...valid, price: 50.99 }).success).toBe(true);
  });

  it("phrases a missing or negative stock for a person", () => {
    expect(firstMessage({ ...valid, sizes: [{ name: "38", inStock: true, quantity: -3 }] })).toBe("Stock can't be negative");
  });
});
