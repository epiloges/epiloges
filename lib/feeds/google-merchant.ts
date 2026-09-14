import { feedDescription, money, xmlText, type FeedItem } from "@/lib/feeds/catalogue";

/**
 * Google Merchant Center product feed (RSS 2.0 with the `g:` namespace).
 *
 * One `<item>` PER SIZE, grouped by `item_group_id` — that is how Google models shoes, and
 * it is what lets a listing say "size 42 in stock" rather than the whole product being
 * one indistinct offer. A product with no sizes recorded becomes a single item.
 *
 * Identifiers: a GTIN when the catalogue has one; otherwise brand + MPN, and for the shop's
 * own label (which has no GTINs to give) `identifier_exists = no`, which is the honest
 * declaration Google asks for rather than a made-up code.
 *
 * Reference: https://support.google.com/merchants/answer/7052112
 */
const GOOGLE_SHOES_CATEGORY = "187"; // Apparel & Accessories > Shoes

const GENDER: Record<FeedItem["gender"], string> = { women: "female", men: "male", unisex: "unisex", kids: "unisex" };

export interface MerchantFeedOptions {
  siteName: string;
  siteUrl: string;
  /** Own-label brands, which have no manufacturer GTIN/MPN to declare. */
  ownBrands: string[];
  shipping: { country: string; price: number; freeAbove: number | null; currency: string };
}

function availability(item: FeedItem, sizeInStock: boolean): string {
  if (item.fulfilment === "preorder") return "preorder";
  if (item.fulfilment === "backorder") return "backorder";
  return item.inStock && sizeInStock ? "in_stock" : "out_of_stock";
}

function itemXml(item: FeedItem, size: FeedItem["sizes"][number] | null, options: MerchantFeedOptions): string {
  const id = size ? `${item.sku}-${size.name}` : item.sku;
  const gtin = size?.gtin ?? item.gtin;
  const ownLabel = item.brand !== undefined && options.ownBrands.some((brand) => brand.toLowerCase() === item.brand!.toLowerCase());
  const [image, ...rest] = item.images;
  const salePrice = item.listPrice !== undefined;
  return [
    "    <item>",
    `      <g:id>${xmlText(id)}</g:id>`,
    `      <g:item_group_id>${xmlText(item.sku)}</g:item_group_id>`,
    `      <g:title>${xmlText(size ? `${item.name} — Νο ${size.name}` : item.name)}</g:title>`,
    `      <g:description>${xmlText(feedDescription(item.description))}</g:description>`,
    `      <g:link>${xmlText(item.url)}</g:link>`,
    `      <g:image_link>${xmlText(image ?? "")}</g:image_link>`,
    ...rest.slice(0, 10).map((src) => `      <g:additional_image_link>${xmlText(src)}</g:additional_image_link>`),
    `      <g:availability>${availability(item, size ? size.inStock : true)}</g:availability>`,
    `      <g:price>${money(salePrice ? item.listPrice! : item.price)} ${xmlText(item.currency)}</g:price>`,
    ...(salePrice ? [`      <g:sale_price>${money(item.price)} ${xmlText(item.currency)}</g:sale_price>`] : []),
    ...(item.brand ? [`      <g:brand>${xmlText(item.brand)}</g:brand>`] : []),
    ...(gtin ? [`      <g:gtin>${xmlText(gtin)}</g:gtin>`] : []),
    ...(!gtin && !ownLabel ? [`      <g:mpn>${xmlText(size?.sku ?? item.sku)}</g:mpn>`] : []),
    ...(!gtin && ownLabel ? ["      <g:identifier_exists>no</g:identifier_exists>"] : []),
    "      <g:condition>new</g:condition>",
    `      <g:gender>${GENDER[item.gender]}</g:gender>`,
    `      <g:age_group>${item.gender === "kids" ? "kids" : "adult"}</g:age_group>`,
    ...(item.colors.length ? [`      <g:color>${xmlText(item.colors.slice(0, 3).join("/"))}</g:color>`] : []),
    ...(size ? [`      <g:size>${xmlText(size.name)}</g:size>`, "      <g:size_system>EU</g:size_system>"] : []),
    ...(item.materials.length ? [`      <g:material>${xmlText(item.materials.slice(0, 1).join(""))}</g:material>`] : []),
    `      <g:google_product_category>${GOOGLE_SHOES_CATEGORY}</g:google_product_category>`,
    ...(item.categoryPath.length ? [`      <g:product_type>${xmlText(item.categoryPath.join(" > "))}</g:product_type>`] : []),
    "      <g:shipping>",
    `        <g:country>${xmlText(options.shipping.country)}</g:country>`,
    `        <g:price>${money(options.shipping.freeAbove !== null && item.price >= options.shipping.freeAbove ? 0 : options.shipping.price)} ${xmlText(options.shipping.currency)}</g:price>`,
    "      </g:shipping>",
    ...(item.weightGrams ? [`      <g:shipping_weight>${item.weightGrams} g</g:shipping_weight>`] : []),
    "    </item>",
  ].join("\n");
}

export function googleMerchantFeedXml(items: FeedItem[], options: MerchantFeedOptions): string {
  const entries = items.flatMap((item) => (item.sizes.length ? item.sizes.map((size) => itemXml(item, size, options)) : [itemXml(item, null, options)]));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${xmlText(options.siteName)}</title>`,
    `    <link>${xmlText(options.siteUrl)}</link>`,
    `    <description>${xmlText(`${options.siteName} — product feed`)}</description>`,
    ...entries,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
