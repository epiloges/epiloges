import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getSeoDefaults } from "@/services/seo";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContactForm } from "@/components/shared/ContactForm";
import { getNavigation, getSiteSettings } from "@/services";
import { COMPANY } from "@/constants/company";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const [seo, t, locale] = await Promise.all([getSeoDefaults(), getTranslations("Pages"), getLocale()]);
  return buildMetadata({ seo, title: t("contactMetaTitle"), description: t("contactDescription"), path: "/contact", locale: locale as Locale });
}

export default async function ContactPage() {
  const t = await getTranslations("Pages");
  const tContact = await getTranslations("Contact");
  const [navigation, settings] = await Promise.all([getNavigation(), getSiteSettings()]);

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <div className="container-luxe max-w-3xl py-14 md:py-20">
          <h1 className="font-heading text-4xl md:text-5xl">{t("contactTitle")}</h1>
          <p className="mt-4 text-lg text-luxe-gray-dark">
            {tContact("intro")}
          </p>
          <p className="mt-2 text-sm text-luxe-gray-dark">
            {tContact("preferEmail")}{" "}
            <a href={`mailto:${settings.contactEmail}`} className="underline underline-offset-4">
              {settings.contactEmail}
            </a>
            .
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 border-y border-border py-8 sm:grid-cols-2">
            {COMPANY.stores.map((store) => (
              <div key={store.name}>
                <p className="text-xs font-medium tracking-[0.15em] uppercase text-luxe-black">{store.name}</p>
                <p className="mt-2 text-sm text-luxe-gray-dark">
                  {store.street}
                  <br />
                  {store.postalCode} {store.city}
                </p>
                <a href={`tel:${COMPANY.phoneE164}`} className="mt-2 inline-block text-sm underline underline-offset-4">
                  {COMPANY.phone}
                </a>
              </div>
            ))}
          </div>

          <div className="mt-10">
            <ContactForm />
          </div>
        </div>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
