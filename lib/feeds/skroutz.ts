import { feedDescription, money, xmlText, type FeedItem } from "@/lib/feeds/catalogue";

/**
 * Skroutz XML — the format BestPrice.gr accepts as well.
 *
 * One `<product>` per catalogue product, with the in-stock sizes listed in `<size>` the way
 * Skroutz's footwear spec asks ("38,39,40"), rather than one entry per size. Availability
 * uses their fixed vocabulary; anything else is rejected at import.
 *
 * Reference: https://developer.skroutz.gr/feedspec/
 */
const VAT_PERCENT = 24;

function availabilityLabel(item: FeedItem): string {
  switch (item.fulfilment) {
    case "in-stock":
      return "Άμεσα διαθέσιμο";
    case "preorder":
      return "Προπαραγγελία";
    case "backorder":
      return "Κατόπιν παραγγελίας";
    default:
      return "Μη διαθέσιμο";
  }
}

function productXml(item: FeedItem): string {
  const sizes = item.sizes.filter((size) => size.inStock).map((size) => size.name);
  const [image, ...rest] = item.images;
  return [
    "    <product>",
    `      <id>${xmlText(item.sku || item.id)}</id>`,
    `      <name>${xmlText(item.name)}</name>`,
    `      <link>${xmlText(item.url)}</link>`,
    `      <image>${xmlText(image ?? "")}</image>`,
    ...rest.slice(0, 4).map((src) => `      <additional_imageurl>${xmlText(src)}</additional_imageurl>`),
    `      <category>${xmlText(["Παπούτσια", ...item.categoryPath].join(" > "))}</category>`,
    `      <price_with_vat>${money(item.price)}</price_with_vat>`,
    `      <vat>${VAT_PERCENT}</vat>`,
    ...(item.brand ? [`      <manufacturer>${xmlText(item.brand)}</manufacturer>`] : []),
    `      <mpn>${xmlText(item.sku)}</mpn>`,
    ...(item.gtin ? [`      <ean>${xmlText(item.gtin)}</ean>`] : []),
    `      <instock>${item.inStock ? "Y" : "N"}</instock>`,
    `      <availability>${xmlText(availabilityLabel(item))}</availability>`,
    ...(sizes.length ? [`      <size>${xmlText(sizes.join(","))}</size>`] : []),
    ...(item.colors.length ? [`      <color>${xmlText(item.colors.join(", "))}</color>`] : []),
    `      <description>${xmlText(feedDescription(item.description))}</description>`,
    ...(item.weightGrams ? [`      <weight>${item.weightGrams}</weight>`] : []),
    "    </product>",
  ].join("\n");
}

export function skroutzFeedXml(items: FeedItem[], generatedAt: Date = new Date()): string {
  const stamp = generatedAt.toISOString().slice(0, 16).replace("T", " ");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<mywebstore>",
    `  <created_at>${stamp}</created_at>`,
    "  <products>",
    ...items.map(productXml),
    "  </products>",
    "</mywebstore>",
    "",
  ].join("\n");
}
