import { describe, expect, it } from "vitest";
import type { Category, Product } from "@/types";
import { categoryPath, feedDescription, toFeedItem, toFeedItems, xmlText } from "./catalogue";
import { skroutzFeedXml } from "./skroutz";
import { googleMerchantFeedXml } from "./google-merchant";

const categories: Category[] = [
  { id: "c-women", slug: "gynaikeia", name: "Women", nameEl: "Γυναικεία", position: 0, isFeatured: false, isVisible: false },
  { id: "c-sandals", slug: "sandals", name: "Sandals", nameEl: "Πέδιλα", parentId: "c-women", position: 1, isFeatured: false, isVisible: true },
];

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    slug: "pedilo-dermatino-mavro-1001",
    name: "Leather sandal",
    nameEl: "Δερμάτινο πέδιλο μαύρο",
    description: "Line one\nLine two <b>bold</b>",
    price: { amount: 59, currencyCode: "EUR" },
    images: [{ src: "https://blob.example/a.jpg", alt: "a" }, { src: "https://blob.example/b.jpg", alt: "b" }],
    colors: [{ name: "Μαύρο", hex: "#111111" }],
    sizes: [
      { name: "37", inStock: true, quantity: 2 },
      { name: "38", inStock: false, quantity: 0 },
      { name: "39", inStock: true, quantity: 1, barcode: "5200000000039" },
    ],
    category: "sandals",
    categoryId: "c-sandals",
    collectionIds: [],
    tags: [],
    gender: "women",
    materials: ["Δέρμα"],
    careInstructions: [],
    sku: "SND-1001",
    inventoryPolicy: "deny",
    availableForSale: true,
    status: "active",
    brand: "Alexandris Shoes",
    ...overrides,
  } as Product;
}

describe("feed catalogue", () => {
  it("walks the category path root-first, through hidden gender parents, in Greek", () => {
    expect(categoryPath("c-sandals", categories)).toEqual(["Γυναικεία", "Πέδιλα"]);
  });

  it("prices the item at what the shopper pays and keeps the list price for a sale", () => {
    const item = toFeedItem(product({ salePrice: { amount: 39, currencyCode: "EUR" } }), { siteUrl: "https://shop.example/", categories });
    expect(item.price).toBe(39);
    expect(item.listPrice).toBe(59);
    expect(item.url).toBe("https://shop.example/products/pedilo-dermatino-mavro-1001");
    expect(item.name).toBe("Δερμάτινο πέδιλο μαύρο");
  });

  it("is out of stock when every size is, even if the product flag says purchasable", () => {
    const item = toFeedItem(product({ sizes: [{ name: "37", inStock: false, quantity: 0 }] }), { siteUrl: "https://shop.example", categories });
    expect(item.inStock).toBe(false);
    expect(item.fulfilment).toBe("out-of-stock");
  });

  it("leaves out drafts and products the admin marked noindex", () => {
    const items = toFeedItems([product(), product({ id: "p2", status: "draft" }), product({ id: "p3", seo: { noIndex: true } })], { siteUrl: "https://shop.example", categories });
    expect(items.map((item) => item.id)).toEqual(["p1"]);
  });

  it("escapes XML and strips markup from descriptions", () => {
    expect(xmlText('a & b < c > "d"')).toBe("a &amp; b &lt; c &gt; &quot;d&quot;");
    expect(feedDescription("Line one\nLine two <b>bold</b>")).toBe("Line one\nLine two bold");
  });
});

describe("Skroutz feed", () => {
  it("lists only the in-stock sizes and uses Skroutz's availability vocabulary", () => {
    const xml = skroutzFeedXml([toFeedItem(product(), { siteUrl: "https://shop.example", categories })], new Date("2026-09-14T10:00:00Z"));
    expect(xml).toContain("<created_at>2026-09-14 10:00</created_at>");
    expect(xml).toContain("<size>37,39</size>");
    expect(xml).toContain("<availability>Άμεσα διαθέσιμο</availability>");
    expect(xml).toContain("<category>Παπούτσια &gt; Γυναικεία &gt; Πέδιλα</category>");
    expect(xml).toContain("<price_with_vat>59.00</price_with_vat>");
    expect(xml).toContain("<manufacturer>Alexandris Shoes</manufacturer>");
    expect(xml).toContain("<instock>Y</instock>");
  });
});

describe("Google Merchant feed", () => {
  const options = { siteName: "ALEXANDRIS", siteUrl: "https://shop.example", ownBrands: ["Alexandris Shoes"], shipping: { country: "GR", price: 3.5, freeAbove: 150, currency: "EUR" } };

  it("emits one item per size under one item_group_id, with per-size availability", () => {
    const xml = googleMerchantFeedXml([toFeedItem(product(), { siteUrl: "https://shop.example", categories })], options);
    expect(xml.match(/<item>/g)).toHaveLength(3);
    expect(xml).toContain("<g:id>SND-1001-37</g:id>");
    expect(xml.match(/<g:item_group_id>SND-1001<\/g:item_group_id>/g)).toHaveLength(3);
    expect(xml).toContain("<g:size>38</g:size>\n      <g:size_system>EU</g:size_system>");
    // 38 is the only size out of stock
    const items = xml.split("<item>").slice(1);
    expect(items[1]).toContain("<g:availability>out_of_stock</g:availability>");
    expect(items[0]).toContain("<g:availability>in_stock</g:availability>");
  });

  it("declares identifier_exists=no for the own label and a GTIN where a size has one", () => {
    const xml = googleMerchantFeedXml([toFeedItem(product(), { siteUrl: "https://shop.example", categories })], options);
    const items = xml.split("<item>").slice(1);
    expect(items[0]).toContain("<g:identifier_exists>no</g:identifier_exists>");
    expect(items[2]).toContain("<g:gtin>5200000000039</g:gtin>");
    expect(items[2]).not.toContain("identifier_exists");
  });

  it("uses brand + MPN for a supplier brand without a GTIN, and prices shipping from the threshold", () => {
    const xml = googleMerchantFeedXml([toFeedItem(product({ brand: "Verde", price: { amount: 160, currencyCode: "EUR" } }), { siteUrl: "https://shop.example", categories })], options);
    expect(xml).toContain("<g:brand>Verde</g:brand>");
    expect(xml).toContain("<g:mpn>SND-1001</g:mpn>");
    expect(xml).not.toContain("identifier_exists");
    expect(xml).toContain("<g:price>0.00 EUR</g:price>");
  });

  it("shows list price as price and the selling price as sale_price on a markdown", () => {
    const xml = googleMerchantFeedXml([toFeedItem(product({ salePrice: { amount: 39, currencyCode: "EUR" } }), { siteUrl: "https://shop.example", categories })], options);
    expect(xml).toContain("<g:price>59.00 EUR</g:price>");
    expect(xml).toContain("<g:sale_price>39.00 EUR</g:sale_price>");
  });
});
