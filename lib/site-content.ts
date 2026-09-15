import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { toJsonInput } from "@/lib/commerce/postgres/mappers";

/**
 * Shared read/write for the `SiteContent` key/Json store backing every singleton CMS
 * document (homepage, navigation, SEO defaults, site settings) — one real persistence
 * path instead of four near-identical services each hand-rolling the same upsert.
 * No runtime shape validation here (matches this app's existing rigor level for these
 * documents — the JSON-file versions this replaced were also untyped `as T` casts);
 * the admin editors are the only writers and are already TypeScript-typed client-side.
 */
export async function getSiteContent<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.siteContent.findUnique({ where: { key } });
  return row ? (row.data as T) : fallback;
}

/** The tag a cached read of `key` carries — `updateTag(siteContentTag(key))` after a save. */
export function siteContentTag(key: string): string {
  return `site-content:${key}`;
}

/**
 * The same read, cached. For the storefront: the homepage sections, the navigation and the
 * settings are read on every page view and change a few times a month, yet each view paid
 * a database round trip for each of them before it could start rendering. The admin's
 * save actions call `updateTag` with this key's tag, so a change is live on the next
 * request; the hour is only the ceiling. Not used by the proxy (middleware cannot use the
 * cache) nor by anything that writes what it reads (cron documents, tokens).
 */
export async function getSiteContentCached<T>(key: string, fallback: T): Promise<T> {
  "use cache";
  cacheLife("hours");
  cacheTag(siteContentTag(key));
  return getSiteContent(key, fallback);
}

export async function setSiteContent<T>(key: string, data: T): Promise<void> {
  await prisma.siteContent.upsert({
    where: { key },
    create: { key, data: toJsonInput(data) },
    update: { data: toJsonInput(data) },
  });
}
