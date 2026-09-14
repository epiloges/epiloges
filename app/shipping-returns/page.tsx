import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SimplePageContent } from "@/components/shared/SimplePageContent";
import { getShippingReturnsPage, getNavigation, getSiteSettings } from "@/services";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getSeoDefaults } from "@/services/seo";

export async function generateMetadata(): Promise<Metadata> {
  const [seo, t, locale] = await Promise.all([getSeoDefaults(), getTranslations("Pages"), getLocale()]);
  return buildMetadata({ seo, title: t("shippingReturnsTitle"), description: t("shippingReturnsDescription"), path: "/shipping-returns", locale: locale as Locale });
}

export default async function ShippingReturnsPage() {
  const [navigation, settings, page] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getShippingReturnsPage(),
  ]);

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <SimplePageContent page={page} />
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
