import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { ProductListingSection } from "@/components/plp/ProductListingSection";
import { ListingSkeleton } from "@/components/plp/ListingSkeleton";
import { listingPageNumber, type ListingPageProps } from "@/components/plp/listing-query";
import { JsonLd } from "@/components/shared/JsonLd";
import { breadcrumbSchema, buildMetadata } from "@/lib/seo";
import { getNavigation, getSeoDefaults, getSiteSettings } from "@/services";
import { getAllBrands, getBrandBySlug } from "@/services/brands";
import { ROUTES } from "@/constants/routes";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface BrandPageProps extends ListingPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return (await getAllBrands()).map((brand) => ({ slug: brand.slug }));
}

export async function generateMetadata({ params, searchParams }: BrandPageProps): Promise<Metadata> {
  const [{ slug }, page, seo, locale, t] = await Promise.all([
    params,
    listingPageNumber(searchParams),
    getSeoDefaults(),
    getLocale(),
    getTranslations("Pages"),
  ]);
  const brand = await getBrandBySlug(slug);
  if (!brand) return {};
  return buildMetadata({
    seo,
    title: t("brandTitle", { brand: brand.name }),
    description: t("brandDescription", { brand: brand.name, count: brand.productCount }),
    path: ROUTES.brand(slug),
    image: brand.image?.src,
    locale: locale as Locale,
    page,
  });
}

/**
 * One label's shoes. "{brand} παπούτσια" is a query with the buyer already decided on the
 * make; before this page the shop had every one of those labels in stock and no URL to
 * rank for any of them.
 */
export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const [navigation, settings, seo, tNav, t, resolvedSearchParams] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getSeoDefaults(),
    getTranslations("Nav"),
    getTranslations("Pages"),
    searchParams,
  ]);
  const breadcrumbs = [
    { name: tNav("home"), href: ROUTES.home },
    { name: t("brandsTitle"), href: ROUTES.brands },
    { name: brand.name, href: ROUTES.brand(brand.slug) },
  ];

  return (
    <>
      <JsonLd data={breadcrumbSchema(breadcrumbs, seo.siteUrl)} />
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <Breadcrumbs items={breadcrumbs} />
        <div className="container-luxe py-10 md:py-14">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-luxe-gray-dark">{t("brandsTitle")}</p>
          <h1 className="font-heading mt-2 text-3xl md:text-5xl">{t("brandHeading", { brand: brand.name })}</h1>
          <p className="mt-3 max-w-xl text-luxe-gray-dark">{t("brandIntro", { brand: brand.name, siteName: settings.siteName })}</p>
        </div>
        <Suspense fallback={<ListingSkeleton />}>
          <ProductListingSection
            title={brand.name}
            baseFilters={{ brand: brand.name }}
            showHeader={false}
            searchParams={resolvedSearchParams}
          />
        </Suspense>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
