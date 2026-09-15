import "server-only";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { PRODUCTS_CACHE_TAG } from "@/services/products";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

/**
 * Brands are not a table — `Product.brand` is a free-text field the admin fills in — so a
 * brand page is derived: the distinct names on active products, each with a slug made the
 * same way product slugs are. "Mont Martre Paris" → /brands/mont-martre-paris.
 *
 * Why pages at all: "mont martre παπούτσια", "verde παπούτσια" are queries people type,
 * and a shop that stocks the label with no page for it hands that search to a marketplace.
 * The brand facet inside a category filters; it does not rank.
 */
export interface Brand {
  name: string;
  slug: string;
  productCount: number;
  /** First product image on the label, for the /brands index. */
  image?: { src: string; alt: string };
}

export const getAllBrands = cache(async function getAllBrands(): Promise<Brand[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PRODUCTS_CACHE_TAG);
  const rows = await prisma.$queryRaw<{ brand: string; count: bigint; images: unknown }[]>`
    SELECT p.brand,
           COUNT(*)::bigint AS count,
           (SELECT p2.images FROM products p2 WHERE p2.brand = p.brand AND p2.status = 'active' ORDER BY p2."publishedAt" DESC LIMIT 1) AS images
    FROM products p
    WHERE p.status = 'active' AND p.brand IS NOT NULL AND btrim(p.brand) <> ''
    GROUP BY p.brand
    ORDER BY count DESC, p.brand ASC`;
  const seen = new Set<string>();
  const brands: Brand[] = [];
  for (const row of rows) {
    const slug = slugify(row.brand);
    // Two spellings of one label ("U.S. Polo Assn." / "US Polo Assn") slugify alike; the
    // first (larger) wins the page rather than the second producing a duplicate URL.
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const first = Array.isArray(row.images) ? (row.images[0] as { src?: string; alt?: string } | undefined) : undefined;
    brands.push({
      name: row.brand,
      slug,
      productCount: Number(row.count),
      image: first?.src ? { src: first.src, alt: first.alt ?? row.brand } : undefined,
    });
  }
  return brands;
});

export async function getBrandBySlug(slug: string): Promise<Brand | undefined> {
  return (await getAllBrands()).find((brand) => brand.slug === slug);
}
