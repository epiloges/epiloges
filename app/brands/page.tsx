import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Breadcrumbs } from "@/components/product/Breadcrumbs";
import { JsonLd } from "@/components/shared/JsonLd";
import { breadcrumbSchema, buildMetadata } from "@/lib/seo";
import { getNavigation, getSeoDefaults, getSiteSettings } from "@/services";
import { getAllBrands } from "@/services/brands";
import { ROUTES } from "@/constants/routes";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const [seo, locale, t] = await Promise.all([getSeoDefaults(), getLocale(), getTranslations("Pages")]);
  return buildMetadata({
    seo,
    title: t("brandsMetaTitle"),
    description: t("brandsDescription"),
    path: ROUTES.brands,
    locale: locale as Locale,
  });
}

export default async function BrandsPage() {
  const [navigation, settings, seo, brands, tNav, t] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getSeoDefaults(),
    getAllBrands(),
    getTranslations("Nav"),
    getTranslations("Pages"),
  ]);
  const breadcrumbs = [
    { name: tNav("home"), href: ROUTES.home },
    { name: t("brandsTitle"), href: ROUTES.brands },
  ];

  return (
    <>
      <JsonLd data={breadcrumbSchema(breadcrumbs, seo.siteUrl)} />
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <Breadcrumbs items={breadcrumbs} />
        <div className="container-luxe py-10 md:py-14">
          <h1 className="font-heading text-3xl md:text-5xl">{t("brandsTitle")}</h1>
          <p className="mt-3 max-w-xl text-luxe-gray-dark">{t("brandsDescription")}</p>
          <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {brands.map((brand) => (
              <li key={brand.slug}>
                <Link href={ROUTES.brand(brand.slug)} className="group block">
                  <div className="relative aspect-3/4 overflow-hidden bg-luxe-gray-light">
                    {brand.image ? (
                      <Image
                        src={brand.image.src}
                        alt={brand.name}
                        fill
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-sm font-medium">{brand.name}</h2>
                  <p className="mt-0.5 text-xs text-luxe-gray-dark">{t("brandProductCount", { count: brand.productCount })}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
