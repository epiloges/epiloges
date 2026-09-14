import "server-only";
import { COMPANY, formattedAddress, storeName } from "@/constants/company";
import { ROUTES } from "@/constants/routes";
import { deliveryPolicy, RETURN_WINDOW_DAYS } from "@/lib/seo/commerce-policy";
import { BRAND_CONTENT } from "@/lib/seo/brand-content";
import { getAllBrands } from "@/services/brands";
import { getAllCategories } from "@/services/categories";
import { getAllCollections } from "@/services/collections";
import { getFaqPage, getShippingReturnsPage } from "@/services/content";
import { getSeoDefaults } from "@/services/seo";
import { getShippingSettings } from "@/services/shipping";

/**
 * The two llms.txt documents (llmstxt.org): `/llms.txt` is the map — who the shop is, the
 * terms, and where every section lives; `/llms-full.txt` is the same map with the content
 * inlined — category and brand guides, every FAQ, the shipping and returns pages — so an
 * assistant asked "does Alexandris sell cowboy boots in a 38" or "what is their return
 * window" can answer from one fetch instead of crawling.
 *
 * Everything here is read from the same rows and constants the pages render from, so the
 * file cannot describe a shop that differs from the site. Greek, like the shop; the one
 * English paragraph is for the assistant that was asked in English.
 */
const DAY_EL: Record<string, string> = {
  Monday: "Δευτέρα", Tuesday: "Τρίτη", Wednesday: "Τετάρτη", Thursday: "Πέμπτη", Friday: "Παρασκευή", Saturday: "Σάββατο", Sunday: "Κυριακή",
};

function openingHoursLines(): string[] {
  return COMPANY.store.openingHours.map((entry) => `${entry.days.map((day) => DAY_EL[day] ?? day).join(", ")}: ${entry.opens}–${entry.closes}`);
}

export async function buildLlmsText(full: boolean): Promise<string> {
  const [seo, shipping, categories, collections, brands, faqPage, shippingPage] = await Promise.all([
    getSeoDefaults(),
    getShippingSettings(),
    getAllCategories(),
    getAllCollections(),
    getAllBrands(),
    full ? getFaqPage() : null,
    full ? getShippingReturnsPage() : null,
  ]);
  const site = seo.siteUrl.replace(/\/$/, "");
  const delivery = deliveryPolicy(shipping);
  const visible = categories.filter((category) => category.isVisible);
  const hours = openingHoursLines();
  // The other labels — the own brand is named on its own in the sentence that follows.
  const otherBrands = brands.filter((brand) => !(COMPANY.ownBrands as readonly string[]).includes(brand.name)).map((brand) => brand.name);
  const euro = (amount: number) => `${amount.toFixed(2).replace(".", ",")} €`;

  const lines: string[] = [
    `# ${storeName()} (${storeName("en")})`,
    "",
    `> ${seo.defaultDescription}`,
    "",
    `Τα ${storeName()} (${COMPANY.legalName}, ΑΦΜ ${COMPANY.vatNumber}) είναι κατάστημα υποδημάτων στο Ηράκλειο Κρήτης από το ${COMPANY.foundingYear}, με ηλεκτρονικό κατάστημα για όλη την Ελλάδα. Γυναικεία και ανδρικά παπούτσια και τσάντες: η δική μας σειρά ${COMPANY.ownBrands[0]} (γνήσιο δέρμα, ανατομικός πάτος) και επιλεγμένοι οίκοι (${otherBrands.join(", ")}).`,
    "",
    `Alexandris Stores is an independent shoe shop in Heraklion, Crete, trading since ${COMPANY.foundingYear}, selling women's and men's shoes and bags online across Greece. Sizes 36–41 for women and 40–46 for men; courier delivery in 1–3 working days; free returns within ${RETURN_WINDOW_DAYS} days. The physical store is at ${formattedAddress()}.`,
    "",
    "## Το κατάστημα",
    "",
    `- Διεύθυνση: ${formattedAddress()}`,
    `- Τηλέφωνο: ${COMPANY.phone} (${COMPANY.phoneE164}) · Email: ${COMPANY.email}`,
    ...(hours.length > 0 ? [`- Ωράριο: ${hours.join(" · ")} · Κυριακή κλειστά`] : []),
    `- Παραλαβή παραγγελίας από το κατάστημα: δωρεάν`,
    "",
    "## Αποστολές, πληρωμές, επιστροφές",
    "",
    `- Αποστολή σε όλη την Ελλάδα με ACS Courier: ${euro(delivery.price)} (${delivery.transitDays.min}–${delivery.transitDays.max} εργάσιμες ημέρες)${delivery.freeAbove !== null ? `, δωρεάν για παραγγελίες από ${delivery.freeAbove} €` : ""}.`,
    `- Αποστολή σε χώρες της ΕΕ: διαθέσιμη, 5–8 εργάσιμες ημέρες.`,
    `- Πληρωμή: αντικαταβολή, τραπεζική κατάθεση, χρεωστική/πιστωτική κάρτα μέσω Τράπεζας Πειραιώς.`,
    `- Επιστροφές και αλλαγές νούμερου: δωρεάν, εντός ${RETURN_WINDOW_DAYS} ημερών από την παράδοση, για αφόρετα είδη στην αρχική συσκευασία.`,
    `- Νούμερα: γυναικεία 36–41, ανδρικά 40–46. Η διαθεσιμότητα ανά νούμερο φαίνεται σε κάθε προϊόν.`,
    "",
    "## Κατηγορίες",
    "",
  ];

  for (const category of visible) {
    const url = `${site}${ROUTES.category(category.slug)}`;
    const title = category.seo?.title ?? category.nameEl ?? category.name;
    if (!full) {
      lines.push(`- [${title}](${url})${category.seo?.description ? ` — ${category.seo.description}` : ""}`);
      continue;
    }
    lines.push(`### [${title}](${url})`, "");
    if (category.seo?.description) lines.push(category.seo.description, "");
    if (category.seo?.introContent) lines.push(category.seo.introContent, "");
    for (const faq of category.seo?.faqs ?? []) lines.push(`**${faq.question}** ${faq.answer}`, "");
  }

  lines.push("## Συλλογές", "");
  for (const collection of collections) {
    const url = `${site}${ROUTES.collection(collection.slug)}`;
    const title = collection.seo?.title ?? collection.titleEl ?? collection.title;
    if (!full) {
      lines.push(`- [${title}](${url})${collection.seo?.description ? ` — ${collection.seo.description}` : ""}`);
      continue;
    }
    lines.push(`### [${title}](${url})`, "");
    if (collection.seo?.introContent) lines.push(collection.seo.introContent, "");
    for (const faq of collection.seo?.faqs ?? []) lines.push(`**${faq.question}** ${faq.answer}`, "");
  }

  lines.push("## Μάρκες", "");
  for (const brand of brands) {
    const url = `${site}${ROUTES.brand(brand.slug)}`;
    const content = BRAND_CONTENT[brand.slug];
    if (!full) {
      lines.push(`- [${brand.name}](${url}) — ${content?.description ?? `${brand.productCount} σχέδια`}`);
      continue;
    }
    lines.push(`### [${brand.name}](${url})`, "");
    lines.push(content?.intro ?? `${brand.productCount} σχέδια.`, "");
    for (const faq of content?.faqs ?? []) lines.push(`**${faq.question}** ${faq.answer}`, "");
  }

  if (full && shippingPage) {
    lines.push("## Αποστολές & επιστροφές (πλήρες κείμενο)", "");
    if (shippingPage.intro) lines.push(shippingPage.intro, "");
    for (const section of shippingPage.sections) lines.push(`### ${section.heading}`, "", section.body, "");
  }
  if (full && faqPage) {
    lines.push("## Συχνές ερωτήσεις (πλήρες κείμενο)", "");
    for (const group of faqPage.categories) {
      lines.push(`### ${group.title}`, "");
      for (const item of group.questions) lines.push(`**${item.question}** ${item.answer}`, "");
    }
  }

  lines.push(
    "## Σελίδες",
    "",
    `- [Γυναικεία παπούτσια](${site}${ROUTES.women})`,
    `- [Ανδρικά παπούτσια](${site}${ROUTES.men})`,
    `- [Νέες αφίξεις](${site}${ROUTES.newIn})`,
    `- [Προσφορές](${site}${ROUTES.sale})`,
    `- [Journal — οδηγοί και συμβουλές](${site}${ROUTES.journal})`,
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
    ...(full ? [] : [`- [llms-full.txt — the same map with every guide and FAQ inlined](${site}/llms-full.txt)`]),
    ""
  );

  return lines.join("\n");
}
