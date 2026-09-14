import type { Metadata } from "next";
import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductListingSection } from "@/components/plp/ProductListingSection";
import { ListingSkeleton } from "@/components/plp/ListingSkeleton";
import { listingPageNumber, type ListingPageProps } from "@/components/plp/listing-query";
import { getNavigation, getSiteSettings, getSeoDefaults } from "@/services";
import { buildMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({ searchParams }: ListingPageProps): Promise<Metadata> {
  const [seo, t, locale, page] = await Promise.all([getSeoDefaults(), getTranslations("Pages"), getLocale(), listingPageNumber(searchParams)]);
  return buildMetadata({
    seo,
    page,
    title: t("womenMetaTitle"),
    description: t("womenDescription"),
    path: "/women",
    // Threaded through so og:locale matches the language the title is actually in.
    locale: locale as Locale,
  });
}

export default async function WomenPage({ searchParams }: ListingPageProps) {
  const [navigation, settings, t, resolvedSearchParams] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getTranslations("Pages"),
    searchParams,
  ]);

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <Suspense fallback={<ListingSkeleton withHeader />}>
          <ProductListingSection
            title={t("womenTitle")}
            description={t("womenIntro")}
            baseFilters={{ gender: "women" }}
            searchParams={resolvedSearchParams}
          />
        </Suspense>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
