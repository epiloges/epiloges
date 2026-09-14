import "server-only";
import { unstable_cache } from "next/cache";
import seoFallback from "@/data/seo.json";
import { getSiteContent, setSiteContent } from "@/lib/site-content";
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
  const deployed = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return deployed ? { ...stored, siteUrl: deployed } : stored;
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
