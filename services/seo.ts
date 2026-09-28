import "server-only";
import { unstable_cache } from "next/cache";
import seoFallback from "@/data/seo.json";
import { getSiteContent, setSiteContent } from "@/lib/site-content";
import { getCanonicalSiteUrl } from "@/lib/site-url";
import type { SiteSeoDefaults } from "@/types";

/**
 * The stored defaults, with one field the deployment owns: `siteUrl` is taken from
 * `NEXT_PUBLIC_SITE_URL` whenever it is set. The URL lived in two places — this row (edited
 * on /admin/seo) and the env var (redirects, email links) — and on launch day the row still
 * said shopalexandris.vercel.app after the env had moved to the real domain, so every
 * canonical, the sitemap and the JSON-LD kept pointing at the old host. One value now; the
 * form shows the effective one and a save cannot put the two out of step again.
 */
export async function getSeoDefaults(): Promise<SiteSeoDefaults> {
  const stored = await getSiteContent<SiteSeoDefaults>("seo", seoFallback as SiteSeoDefaults);
  // The stored row is no longer consulted for the URL at all: when NEXT_PUBLIC_SITE_URL was
  // unset it still said shopalexandris.vercel.app, and that reached every canonical. See
  // lib/site-url.ts for the fallback.
  const siteUrl = getCanonicalSiteUrl();
  return { ...stored, siteUrl, organization: { ...stored.organization, logo: rehostLogo(stored.organization?.logo, siteUrl) } };
}

/**
 * The organisation logo is stored as an absolute URL, and the stored one was on the old host
 * too. A logo served by this app (a relative path, or any *.vercel.app deployment of it) is
 * re-anchored on the canonical address; a logo hosted elsewhere (a CDN) is left alone.
 */
function rehostLogo(logo: string | undefined, siteUrl: string): string {
  if (!logo) return `${siteUrl}/logo.svg`;
  try {
    const url = new URL(logo, siteUrl);
    if (logo.startsWith("/") || url.hostname.endsWith(".vercel.app")) return new URL(url.pathname, siteUrl).toString();
    return logo;
  } catch {
    return `${siteUrl}/logo.svg`;
  }
}

export async function saveSeoDefaults(seo: SiteSeoDefaults): Promise<void> {
  await setSiteContent<SiteSeoDefaults>("seo", seo);
}

/** Cache tag for the site's SEO defaults. Exported so the admin action can invalidate it. */
export const SEO_CACHE_TAG = "seo-defaults";

/**
 * The same read, cached (PERF-002 tier 1).
 *
 * Called from `app/layout.tsx` on every render of every page, to build the metadata. Since
 * nothing in this app is statically prerendered, that is a database round trip per page view
 * for a row the merchant edits occasionally.
 *
 * Invalidated by tag on save, so an edit shows immediately; the hour TTL is only a backstop
 * against a future write path that forgets.
 */
export const getSeoDefaultsCached = unstable_cache(getSeoDefaults, ["seo-defaults"], {
  tags: [SEO_CACHE_TAG],
  revalidate: 3600,
});
