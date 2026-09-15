import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";

/**
 * The trader behind this shop — one source of truth for the identity details Greek and
 * EU law require a distance seller to publish.
 *
 * These were placeholders until now (a reserved `.example` address that could never
 * receive mail, and `COMPANY_DETAILS_PENDING` throughout the legal pages), which is why
 * they live in one exported constant rather than being retyped into the footer, the
 * contact page, the legal documents and the structured data separately. One wrong copy
 * is how the demo address survived as long as it did.
 *
 * Three names, three jobs — the owner's rule (2026-09-14):
 *
 * - `brandName` — **EPILOGES**, the wordmark. Header, footer mark, email masthead, the
 *   maintenance page, the admin chrome: anywhere it is set like a logo. Never in a sentence.
 * - `storeName` — **Επιλογές Fashion Boutique** / **Epiloges Fashion Boutique**, what the
 *   business is *called*: page titles, running copy, the © line, email subjects, structured
 *   data, the legal pages' "who we are". Use `storeName(locale)`.
 * - `legalName` — the ΓΕΜΗ registration, which the legal documents must name as the data
 *   controller and contracting party; a trading name is not a legal person.
 */
export const COMPANY = {
  /** As registered in ΓΕΜΗ / with the tax office. */
  legalName: "Epiloges Fashion Boutique" as string | null,
  brandName: "EPILOGES",
  /** The shop opened in Heraklion in 1984 — the "© 1984" the old site carried, now a fact the structured data states. */
  foundingYear: 1984,
  storeName: { el: "Επιλογές Fashion Boutique", en: "Epiloges Fashion Boutique" } satisfies Record<Locale, string>,

  /** The ΓΕΜΗ-registered address — the legal pages' data controller address. */
  address: {
    street: "Arthur Evans 9",
    postalCode: "71201",
    city: "Heraklion",
    region: "Crete",
    countryCode: "GR",
    country: "Greece",
  },

  /**
   * Both physical shops, for the contact page, the footer, and a Place entry per location
   * in the structured data — a shopper searching "γυναικεία ρούχα Μάλια" needs the Malia
   * address to turn up, not just Heraklion's. `address` above stays the single ΓΕΜΗ-registered
   * address for the legal pages; this is the storefront-facing pair.
   */
  stores: [
    {
      name: "Ηράκλειο",
      street: "Εβανς 9, Κέντρο Ηρακλείου",
      postalCode: "71201",
      city: "Ηράκλειο",
      region: "Κρήτη",
      countryCode: "GR",
      country: "Ελλάδα",
    },
    {
      name: "Μάλια",
      street: "Ελ. Βενιζέλου 157",
      postalCode: "70007",
      city: "Μάλια",
      region: "Κρήτη",
      countryCode: "GR",
      country: "Ελλάδα",
    },
  ] as { name: string; street: string; postalCode: string; city: string; region: string; countryCode: string; country: string }[],

  /**
   * ΑΦΜ — the Greek VAT identification number for Epiloges' own registration. Null until
   * that's assigned; `traderIdentityLine()` omits it rather than printing a blank.
   */
  vatNumber: null as string | null,

  /**
   * ΓΕΜΗ (General Commercial Registry) number, printed in the trader identity line when
   * one exists. Stays null while `gemiRegistration` is anything other than "registered".
   */
  gemiNumber: null as string | null,

  /**
   * Whether a ΓΕΜΗ number is expected at all — deliberately separate from `gemiNumber`,
   * because a null number means two very different things and only one of them is safe to
   * launch on.
   *
   * "unknown" is the dangerous state: nobody has answered, and shipping on it publishes a
   * commercial site that may be missing a legally required registration number. The launch
   * check fails on it so an unanswered question cannot slip out looking like an answered one.
   *
   * "not-registered" is the trader's own statement (recorded 2026-08-18): there is no number
   * to print, so `traderIdentityLine()` omits the label instead of showing an empty one, and
   * the launch check passes while still naming the decision. This is worth re-confirming with
   * an accountant — a Greek trader selling at distance is normally required to be registered,
   * and once registered the number must appear on the site. On the day it exists, set this to
   * "registered" and fill in `gemiNumber`; nothing else needs changing.
   */
  gemiRegistration: "not-registered" as "registered" | "not-registered" | "unknown",

  email: "epilogesfashion@gmail.com",
  /** Heraklion landline, displayed nationally and dialled internationally. */
  phone: "2897 033730",
  phoneE164: "+302897033730",

  /**
   * Labels the shop manufactures or has made for itself. They have no supplier GTIN/MPN,
   * which the product feeds must declare explicitly (Google's `identifier_exists=no`)
   * rather than leave blank.
   */
  ownBrands: ["Epiloges Fashion Boutique"],

  /**
   * The physical shop, for the ClothingStore structured data (lib/seo.ts) and for local
   * search: "γυναικεία ρούχα Ηράκλειο" is answered by the store, not the website.
   *
   * Hours as given by the owner on 2026-09-14 — the classic Greek split week: Tue/Thu/Fri
   * in two shifts, Mon/Wed/Sat straight through, Sunday closed. dayOfWeek values are
   * schema.org's English day names; times are 24h "HH:MM". Sunday is simply absent: an
   * absent day is "closed" in schema.org, so nothing needs to say so.
   *
   * OWNER: the map coordinates are still missing; Google Maps → right-click the shop pin →
   * copy the two numbers into `geo`.
   */
  store: {
    openingHours: [
      { days: ["Tuesday", "Thursday", "Friday"], opens: "09:00", closes: "14:00" },
      { days: ["Tuesday", "Thursday", "Friday"], opens: "17:00", closes: "21:00" },
      { days: ["Monday", "Wednesday", "Saturday"], opens: "09:00", closes: "16:00" },
    ] as { days: string[]; opens: string; closes: string }[],
    geo: undefined as { latitude: number; longitude: number } | undefined,
  },
} as const;

/** "Arthur Evans 9, 71201 Heraklion, Crete, Greece" — the one-line form for prose and footers. */
export function formattedAddress(): string {
  const { street, postalCode, city, region, country } = COMPANY.address;
  return `${street}, ${postalCode} ${city}, ${region}, ${country}`;
}

/** The business's name for running text, in the visitor's language. */
export function storeName(locale: Locale = DEFAULT_LOCALE): string {
  return COMPANY.storeName[locale] ?? COMPANY.storeName[DEFAULT_LOCALE];
}

/**
 * The identity line that has to be reachable from every page. Includes VAT/ΓΕΜΗ only once a
 * number exists, rather than printing an empty label — same reasoning as `gemiNumber`.
 */
export function traderIdentityLine(): string {
  const parts = [
    COMPANY.legalName,
    formattedAddress(),
    COMPANY.vatNumber ? `VAT (ΑΦΜ) ${COMPANY.vatNumber}` : null,
    COMPANY.gemiNumber ? `ΓΕΜΗ ${COMPANY.gemiNumber}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
