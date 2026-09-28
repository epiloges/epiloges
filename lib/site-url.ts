import "server-only";

/**
 * The shop's public address when the deployment does not name one.
 *
 * NEXT_PUBLIC_SITE_URL was never set on the Vercel project, so every canonical, the sitemap,
 * robots.txt, the Open Graph tags and the order-email links fell back to a leftover
 * `shopalexandris.vercel.app` — a host that does not serve this shop at all. Google would
 * have been told, on every page, that the real copy lives somewhere that returns 404.
 *
 * When the shop's own domain is connected, set NEXT_PUBLIC_SITE_URL in Vercel to it; nothing
 * else needs to change. Deliberately not VERCEL_PROJECT_PRODUCTION_URL: that is the project's
 * *shortest* domain, `epiloges.vercel.app`, which only redirects here — and a canonical that
 * redirects is one search engines discard.
 */
export const DEFAULT_SITE_URL = "https://epilogesfashion.vercel.app";

function configuredSiteUrl(): string | null {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || null;
}

/**
 * The address search engines and shoppers should see: canonicals, sitemap, structured data,
 * share previews. Always production — a preview deployment must never canonicalise to itself.
 */
export function getCanonicalSiteUrl(): string {
  return configuredSiteUrl() ?? DEFAULT_SITE_URL;
}

/**
 * Absolute site URL for every link inside an email. Deliberately NOT derived from
 * `request.url`: a sign-up through a preview deployment or the bare *.vercel.app alias
 * would otherwise mail out links to that host, and a webhook or cron job has no request
 * at all. Production mails the canonical address; a preview mails its own URL so a test
 * sign-up there can be completed there; local development mails localhost.
 */
export function getSiteUrl(): string {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  if (process.env.VERCEL_ENV === "production") return DEFAULT_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === "production") return DEFAULT_SITE_URL;
  return "http://localhost:3000";
}
