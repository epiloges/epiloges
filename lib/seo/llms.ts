import "server-only";
import { COMPANY, storeName } from "@/constants/company";
import { ROUTES } from "@/constants/routes";
import { deliveryPolicy, RETURN_WINDOW_DAYS } from "@/lib/seo/commerce-policy";
import { BRAND_CONTENT } from "@/lib/seo/brand-content";
import { getAllBrands } from "@/services/brands";
import { getAllCategories } from "@/services/categories";
import { getAllCollections } from "@/services/collections";
import { getAllProducts } from "@/services/products";
import { getFaqPage, getShippingReturnsPage } from "@/services/content";
import { getSeoDefaults } from "@/services/seo";
import { getShippingSettings } from "@/services/shipping";
import { getAcceptedPaymentMethods } from "@/services/payments";

/**
 * The two llms.txt documents (llmstxt.org): `/llms.txt` is the map — who the shop is, the
 * terms, and where every section lives; `/llms-full.txt` is the same map with the content
 * inlined — category and brand guides, every FAQ, the shipping and returns pages — so an
 * assistant asked "does Epiloges have this dress in a 38" or "what is their return
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
  const [seo, shipping, categories, collections, brands, faqPage, shippingPage, paymentMethods] = await Promise.all([
    getSeoDefaults(),
    getShippingSettings(),
    getAllCategories(),
    getAllCollections(),
    getAllBrands(),
    full ? getFaqPage() : null,
    full ? getShippingReturnsPage() : null,
    getAcceptedPaymentMethods(),
  ]);
  // Collections are listed only once they hold a published product; the five seeded ones
  // were English demo edits of products that are now archived.
  const liveCollectionIds = new Set((await getAllProducts()).flatMap((product) => product.collectionIds));
  const site = seo.siteUrl.replace(/\/$/, "");
  const delivery = deliveryPolicy(shipping);
  const visible = categories.filter((category) => category.isVisible);
  const hours = openingHoursLines();
  // The other labels — the own brand is named on its own in the sentence that follows.
  const otherBrands = brands.filter((brand) => !(COMPANY.ownBrands as readonly string[]).includes(brand.name)).map((brand) => brand.name);
  const euro = (amount: number) => `${amount.toFixed(2).replace(".", ",")} €`;
  // Only what the shop really does today: the live payment settings, the ΑΦΜ once it exists,
  // and brand names only when products carry them. This file once called the shop a shoe
  // store with card payments through Piraeus — copy inherited from another shop.
  const vat = COMPANY.vatNumber ? `, ΑΦΜ ${COMPANY.vatNumber}` : "";
  const brandSentence = otherBrands.length > 0 ? ` Μάρκες: ${otherBrands.join(", ")}.` : "";
  const stores = COMPANY.stores.map((store) => `${store.street}, ${store.postalCode} ${store.city}`);
  const payments = paymentMethods.map((method) => method.name.toLowerCase());

  const lines: string[] = [
    `# ${storeName()} (${storeName("en")})`,
    "",
    `> ${seo.defaultDescription}`,
    "",
    `Το ${storeName()} (${COMPANY.legalName}${vat}) είναι κατάστημα με γυναικεία ρούχα, παπούτσια και αξεσουάρ στο Ηράκλειο Κρήτης από το ${COMPANY.foundingYear}, με δεύτερο κατάστημα στα Μάλια και ηλεκτρονικό κατάστημα για όλη την Ελλάδα.${brandSentence}`,
    "",
    `Epiloges Fashion Boutique is an independent fashion boutique in Heraklion, Crete, trading since ${COMPANY.foundingYear}, with a second store in Malia. It sells women's clothing, shoes and accessories, online across Greece; courier delivery in 1–3 working days; free returns within ${RETURN_WINDOW_DAYS} days.`,
    "",
    "## Το κατάστημα",
    "",
    ...stores.map((store, index) => `- Κατάστημα ${index + 1}: ${store}`),
    `- Τηλέφωνο: ${COMPANY.phone} (${COMPANY.phoneE164}) · Email: ${COMPANY.email}`,
    ...(hours.length > 0 ? [`- Ωράριο: ${hours.join(" · ")} · Κυριακή κλειστά`] : []),
    `- Παραλαβή παραγγελίας από το κατάστημα: δωρεάν`,
    "",
    "## Αποστολές, πληρωμές, επιστροφές",
    "",
    `- Αποστολή σε όλη την Ελλάδα με ACS Courier: ${euro(delivery.price)} (${delivery.transitDays.min}–${delivery.transitDays.max} εργάσιμες ημέρες)${delivery.freeAbove !== null ? `, δωρεάν για παραγγελίες από ${delivery.freeAbove} €` : ""}.`,
    `- Αποστολή σε χώρες της ΕΕ: διαθέσιμη, 5–8 εργάσιμες ημέρες.`,
    ...(payments.length > 0 ? [`- Πληρωμή: ${payments.join(", ")}.`] : []),
    `- Επιστροφές και αλλαγές μεγέθους: δωρεάν, εντός ${RETURN_WINDOW_DAYS} ημερών από την παράδοση, για αφόρετα είδη στην αρχική συσκευασία.`,
    `- Η διαθεσιμότητα ανά μέγεθος φαίνεται σε κάθε προϊόν.`,
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
  for (const collection of collections.filter((c) => liveCollectionIds.has(c.id))) {
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
    `- [Γυναικεία](${site}${ROUTES.women})`,
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
    ...(full ? [] : [`- [llms-full.txt — the same map with every guide and FAQ inlined](${site}/llms-full.txt)`]),
    ""
  );

  return lines.join("\n");
}
