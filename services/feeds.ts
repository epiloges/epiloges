import "server-only";
import { COMPANY } from "@/constants/company";
import { toFeedItems, type FeedItem } from "@/lib/feeds/catalogue";
import { googleMerchantFeedXml } from "@/lib/feeds/google-merchant";
import { skroutzFeedXml } from "@/lib/feeds/skroutz";
import { getAllCategories } from "@/services/categories";
import { getAllProducts } from "@/services/products";
import { getSeoDefaults } from "@/services/seo";
import { getSiteSettings } from "@/services/settings";
import { getShippingSettings } from "@/services/shipping";

/**
 * The product feeds the Greek market runs on. Skroutz (and BestPrice, same format) is where
 * a large share of "παπούτσια" purchase intent starts; Merchant Center is what puts the
 * catalogue in Google's Shopping tab, in AI Mode's product answers, and behind any future
 * Performance Max campaign. Neither existed before — the shop was invisible to both.
 *
 * Served by app/feeds/*.xml/route.ts, cached at the CDN for an hour.
 */
export async function loadFeedItems(): Promise<FeedItem[]> {
  const [products, categories, seo] = await Promise.all([getAllProducts(), getAllCategories(), getSeoDefaults()]);
  return toFeedItems(products, { siteUrl: seo.siteUrl, categories });
}

export async function buildSkroutzFeed(): Promise<string> {
  return skroutzFeedXml(await loadFeedItems());
}

export async function buildGoogleMerchantFeed(): Promise<string> {
  const [items, seo, settings, shipping] = await Promise.all([loadFeedItems(), getSeoDefaults(), getSiteSettings(), getShippingSettings()]);
  // The cheapest domestic rate a shopper can pick is what Google shows as "delivery".
  const enabled = shipping.rates.filter((rate) => rate.enabled);
  const cheapest = enabled.length ? Math.min(...enabled.map((rate) => rate.amount)) : 0;
  return googleMerchantFeedXml(items, {
    siteName: settings.siteName,
    siteUrl: seo.siteUrl,
    ownBrands: [...COMPANY.ownBrands],
    shipping: { country: COMPANY.address.countryCode, price: cheapest, freeAbove: shipping.freeShippingThreshold, currency: "EUR" },
  });
}
