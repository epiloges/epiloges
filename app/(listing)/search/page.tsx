import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductListingSection } from "@/components/plp/ProductListingSection";
import { ListingSkeleton } from "@/components/plp/ListingSkeleton";
import type { ListingPageProps } from "@/components/plp/listing-query";
import { getNavigation, getSiteSettings, getSeoDefaults } from "@/services";
import { buildMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

function readQuery(params: Record<string, string | string[] | undefined>): string {
  const raw = params.q;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").trim().slice(0, 100);
}

export async function generateMetadata({ searchParams }: ListingPageProps): Promise<Metadata> {
  const [seo, t, locale, params] = await Promise.all([getSeoDefaults(), getTranslations("Pages"), getLocale(), searchParams]);
  const q = readQuery(params);
  return {
    ...buildMetadata({
      seo,
      title: q ? t("searchTitleFor", { query: q }) : t("searchTitle"),
      description: t("searchDescription"),
      locale: locale as Locale,
      path: "/search",
    }),
    // A results page for one person's query is not a page for the index.
    robots: { index: false, follow: true },
  };
}

/**
 * Full search results. The header overlay shows the first six matches as you type; this is
 * where Enter, "see all" and a shared link land, with the same filters and paging as every
 * other listing.
 */
export default async function SearchPage({ searchParams }: ListingPageProps) {
  const [navigation, settings, t, resolvedSearchParams] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getTranslations("Pages"),
    searchParams,
  ]);
  const q = readQuery(resolvedSearchParams);

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <Suspense fallback={<ListingSkeleton withHeader />}>
          <ProductListingSection
            title={q ? t("searchTitleFor", { query: q }) : t("searchTitle")}
            description={q ? undefined : t("searchEmptyPrompt")}
            baseFilters={{}}
            defaultSort="newest"
            searchQuery={q}
            searchParams={resolvedSearchParams}
          />
        </Suspense>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
