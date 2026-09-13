import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getNavigation, getSiteSettings } from "@/services";
import { getCustomerSession } from "@/lib/customer-session";

// Reachable signed in or out — a verification link is tapped wherever the email is read,
// so proxy.ts exempts it from the /account session gate, like /account/reset-password.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Account");
  return { title: t("verifyEmailTitle"), robots: { index: false, follow: false } };
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ status }, navigation, settings, session, t] = await Promise.all([
    searchParams,
    getNavigation(),
    getSiteSettings(),
    getCustomerSession(),
    getTranslations("Account"),
  ]);
  const verified = status === "verified";

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <div className="container-luxe max-w-xl py-16 text-center md:py-24">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-luxe-gray-dark">{settings.siteName}</p>
          <h1 className="mt-4 font-heading text-3xl">{verified ? t("verifyEmailDone") : t("verifyEmailInvalid")}</h1>
          <p className="mt-4 text-sm leading-relaxed text-luxe-gray-dark">{verified ? t("verifyEmailDoneBody") : t("verifyEmailInvalidBody")}</p>
          <Link
            href={session ? "/account" : "/account/login"}
            className="mt-8 inline-flex h-12 items-center justify-center bg-luxe-black px-8 text-sm font-medium tracking-[0.08em] text-luxe-white uppercase transition-opacity hover:opacity-90"
          >
            {session ? t("verifyEmailToAccount") : t("verifyEmailToLogin")}
          </Link>
        </div>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
