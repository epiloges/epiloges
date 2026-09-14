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
 * - `brandName` — **ALEXANDRIS**, the wordmark. Header, footer mark, email masthead, the
 *   maintenance page, the admin chrome: anywhere it is set like a logo. Never in a sentence.
 * - `storeName` — **Καταστήματα Αλεξανδρής** / **Alexandris Stores**, what the business is
 *   *called*: page titles, running copy, the © line, email subjects, structured data, the
 *   legal pages' "who we are". Use `storeName(locale)`.
 * - `legalName` — the ΓΕΜΗ registration, which the legal documents must name as the data
 *   controller and contracting party; a trading name is not a legal person.
 */
export const COMPANY = {
  /** As registered in ΓΕΜΗ. Greek convention is surname first. */
  legalName: "Alexandris Michail",
  brandName: "ALEXANDRIS",
  storeName: { el: "Καταστήματα Αλεξανδρής", en: "Alexandris Stores" } satisfies Record<Locale, string>,

  address: {
    street: "Arthur Evans 9",
    postalCode: "71201",
    city: "Heraklion",
    region: "Crete",
    countryCode: "GR",
    country: "Greece",
  },

  /** ΑΦΜ — the Greek VAT identification number. */
  vatNumber: "146214557",

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

  email: "alexandrisstores@gmail.com",
  /** Heraklion landline, displayed nationally and dialled internationally. */
  phone: "2814 001 031",
  phoneE164: "+302814001031",

  /**
   * Labels the shop manufactures or has made for itself. They have no supplier GTIN/MPN,
   * which the product feeds must declare explicitly (Google's `identifier_exists=no`)
   * rather than leave blank.
   */
  ownBrands: ["Alexandris Shoes", "ALEXANDRIS"],

  /**
   * The physical shop, for the ShoeStore structured data (lib/seo.ts) and for local
   * search: "παπούτσια Ηράκλειο" is answered by the store, not the website.
   *
   * OWNER: fill in the opening hours and the map coordinates. Empty means the markup says
   * nothing about them, which is honest but forfeits the hours shown under the result.
   * dayOfWeek values are schema.org's English day names; times are 24h "HH:MM".
   */
  store: {
    openingHours: [] as { days: string[]; opens: string; closes: string }[],
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
 * The identity line that has to be reachable from every page. Includes ΓΕΜΗ only once a
 * number exists, rather than printing an empty label.
 */
export function traderIdentityLine(): string {
  const parts = [
    COMPANY.legalName,
    formattedAddress(),
    `VAT (ΑΦΜ) ${COMPANY.vatNumber}`,
    COMPANY.gemiNumber ? `ΓΕΜΗ ${COMPANY.gemiNumber}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
