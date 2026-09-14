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
    title: t("newInTitle"),
    description: t("newInDescription"),
    locale: locale as Locale,
    path: "/new-in",
  });
}

export default async function NewInPage({ searchParams }: ListingPageProps) {
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
          {/* isNew here means "flagged new, or added in the last six weeks" (services/search.ts).
              With no filter this page was the entire catalogue — 223 of 223 products — which
              made "new arrivals" mean nothing. */}
          <ProductListingSection
            title={t("newInTitle")}
            description={t("newInDescription")}
            baseFilters={{ isNew: true }}
            defaultSort="newest"
            searchParams={resolvedSearchParams}
          />
        </Suspense>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
