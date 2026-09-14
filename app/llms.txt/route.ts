import { connection } from "next/server";
import { COMPANY, formattedAddress, storeName } from "@/constants/company";
import { RETURN_WINDOW_DAYS } from "@/lib/seo/commerce-policy";
import { ROUTES } from "@/constants/routes";
import { getAllCategories } from "@/services/categories";
import { getAllBrands } from "@/services/brands";
import { getSeoDefaults } from "@/services/seo";
import { getShippingSettings } from "@/services/shipping";
import { deliveryPolicy } from "@/lib/seo/commerce-policy";

/**
 * /llms.txt — a plain-language map of the shop for language-model crawlers (the
 * llmstxt.org convention). Cheap, and the one place an assistant can read "who is this,
 * what do they sell, what are the terms, where is the catalogue" without inferring it
 * from HTML. Built from the same settings and constants the pages use, so it cannot
 * drift from them. Greek, like the shop.
 */
export async function GET() {
  await connection();
  const [seo, shipping, categories, brands] = await Promise.all([
    getSeoDefaults(),
    getShippingSettings(),
    getAllCategories(),
    getAllBrands(),
  ]);
  const site = seo.siteUrl.replace(/\/$/, "");
  const delivery = deliveryPolicy(shipping);
  const visible = categories.filter((category) => category.isVisible);

  const lines = [
    `# ${storeName()}`,
    "",
    `> ${seo.defaultDescription}`,
    "",
    `Τα ${storeName()} (${COMPANY.legalName}) είναι κατάστημα υποδημάτων στο Ηράκλειο Κρήτης με ηλεκτρονικό κατάστημα για όλη την Ελλάδα. Γυναικεία και ανδρικά παπούτσια: τα δικά μας σχέδια (${COMPANY.ownBrands[0]}) και επιλεγμένες μάρκες.`,
    "",
    `- Διεύθυνση καταστήματος: ${formattedAddress()}`,
    `- Τηλέφωνο: ${COMPANY.phone} · Email: ${COMPANY.email}`,
    `- Αποστολή σε όλη την Ελλάδα: ${delivery.price.toFixed(2)} € (${delivery.transitDays.min}–${delivery.transitDays.max} εργάσιμες)${delivery.freeAbove !== null ? `, δωρεάν για παραγγελίες από ${delivery.freeAbove} €` : ""}.`,
    `- Επιστροφές: δωρεάν, εντός ${RETURN_WINDOW_DAYS} ημερών.`,
    "",
    "## Κατηγορίες",
    "",
    ...visible.map((category) => `- [${category.nameEl ?? category.name}](${site}${ROUTES.category(category.slug)})`),
    "",
    "## Μάρκες",
    "",
    ...brands.map((brand) => `- [${brand.name}](${site}${ROUTES.brand(brand.slug)}) — ${brand.productCount} σχέδια`),
    "",
    "## Σελίδες",
    "",
    `- [Γυναικεία](${site}${ROUTES.women})`,
    `- [Ανδρικά](${site}${ROUTES.men})`,
    `- [Νέες αφίξεις](${site}${ROUTES.newIn})`,
    `- [Προσφορές](${site}${ROUTES.sale})`,
    `- [Οδηγός μεγεθών](${site}${ROUTES.sizeGuide})`,
    `- [Αποστολές & επιστροφές](${site}${ROUTES.shippingReturns})`,
    `- [Συχνές ερωτήσεις](${site}${ROUTES.faq})`,
    `- [Επικοινωνία](${site}${ROUTES.contact})`,
    "",
    "## Δεδομένα προϊόντων",
    "",
    `- [Sitemap](${site}/sitemap.xml)`,
    `- [Google Merchant feed](${site}/feeds/google-merchant.xml)`,
    `- [Skroutz feed](${site}/feeds/skroutz.xml)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
