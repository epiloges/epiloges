import { CheckoutProvider } from "@/components/providers/CheckoutProvider";
import { CheckoutHeader } from "@/components/checkout/CheckoutHeader";
import { getSiteSettings } from "@/services";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Checkout");
  // The tab said the homepage's title all through checkout — "Ολοκλήρωση παραγγελίας"
  // is what a shopper with six tabs open is looking for.
  return { title: t("pageTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();

  return (
    <CheckoutProvider>
      <CheckoutHeader siteName={settings.siteName} />
      <main id="main" className="flex-1 bg-luxe-white">{children}</main>
    </CheckoutProvider>
  );
}
