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
import { storeName } from "@/constants/company";
import { breadcrumbSchema, buildMetadata, faqSchema } from "@/lib/seo";
import { brandContentFor } from "@/lib/seo/brand-content";
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
  // Hand-written title and description where the label has them (lib/seo/brand-content.ts);
  // the generic strings only for a label nobody has written up yet.
  const content = brandContentFor(slug);
  return buildMetadata({
    seo,
    title: content?.title ?? t("brandTitle", { brand: brand.name }),
    description: content?.description ?? t("brandDescription", { brand: brand.name, count: brand.productCount }),
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
  const content = brandContentFor(slug);

  const [navigation, settings, seo, tNav, t, resolvedSearchParams, locale] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getSeoDefaults(),
    getTranslations("Nav"),
    getTranslations("Pages"),
    searchParams,
    getLocale(),
  ]);
  const breadcrumbs = [
    { name: tNav("home"), href: ROUTES.home },
    { name: t("brandsTitle"), href: ROUTES.brands },
    { name: brand.name, href: ROUTES.brand(brand.slug) },
  ];

  return (
    <>
      <JsonLd data={breadcrumbSchema(breadcrumbs, seo.siteUrl)} />
      {/* Emitted only when the same questions are rendered below — same rule as the category page. */}
      {content && content.faqs.length > 0 ? <JsonLd data={faqSchema(content.faqs)} /> : null}
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <Breadcrumbs items={breadcrumbs} />
        <div className="container-luxe py-10 md:py-14">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-luxe-gray-dark">{t("brandsTitle")}</p>
          <h1 className="font-heading mt-2 text-3xl md:text-5xl">{t("brandHeading", { brand: brand.name })}</h1>
          {/* The label's own write-up where one exists; the generic one-liner otherwise. */}
          {content ? (
            <div className="mt-4 max-w-2xl text-sm leading-relaxed text-luxe-gray-dark whitespace-pre-line">{content.intro}</div>
          ) : (
            <p className="mt-3 max-w-xl text-luxe-gray-dark">{t("brandIntro", { brand: brand.name, siteName: storeName(locale as Locale) })}</p>
          )}
        </div>
        <Suspense fallback={<ListingSkeleton />}>
          <ProductListingSection
            title={brand.name}
            baseFilters={{ brand: brand.name }}
            showHeader={false}
            searchParams={resolvedSearchParams}
          />
        </Suspense>

        {/* Below the grid, products first. The SAME array feeds faqSchema above. */}
        {content && content.faqs.length > 0 ? (
          <section className="container-luxe pt-12 pb-4">
            <h2 className="font-heading text-2xl">{tNav("faqHeading")}</h2>
            <dl className="mt-6 max-w-2xl space-y-6">
              {content.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="text-sm font-medium">{faq.question}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-luxe-gray-dark whitespace-pre-line">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
