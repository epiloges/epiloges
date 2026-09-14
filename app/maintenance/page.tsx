import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { COMPANY } from "@/constants/company";

/**
 * What a customer sees while the dashboard's maintenance switch is on. Only ever reached by
 * the rewrite in `proxy.ts`, which also sets the 503 — a direct visit while the shop is open
 * is sent home there.
 *
 * Deliberately bare: no header, no footer, no navigation. Every link those carry leads to a
 * page that would answer with this one again, and the header's cart and search would call
 * APIs for a shop that is closed. The contact details are the one way out, so they are here.
 *
 * `noindex` belongs to the page, not the proxy, for the same reason as `not-found.tsx`: the
 * status already tells a crawler to come back later, and the tag makes sure the "back soon"
 * copy itself is never what gets indexed under the shop's name.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Maintenance");
  return { title: `${t("title")} — ${COMPANY.brandName}`, robots: { index: false, follow: false } };
}

export default async function MaintenancePage() {
  const t = await getTranslations("Maintenance");

  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-heading text-2xl font-semibold tracking-[0.15em] uppercase">{COMPANY.brandName}</p>
      <Clock className="mt-16 size-12 text-luxe-gray-dark" strokeWidth={1} />
      <p className="text-eyebrow mt-6">{t("eyebrow")}</p>
      <h1 className="font-heading mt-3 text-3xl">{t("title")}</h1>
      <p className="mt-4 max-w-md text-sm text-luxe-gray-dark">{t("body")}</p>
      <p className="mt-10 text-xs tracking-[0.05em] text-luxe-gray-dark uppercase">{t("contact")}</p>
      <p className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:gap-6">
        <a href={`tel:${COMPANY.phoneE164}`} className="underline underline-offset-4">
          {COMPANY.phone}
        </a>
        <a href={`mailto:${COMPANY.email}`} className="underline underline-offset-4">
          {COMPANY.email}
        </a>
      </p>
    </main>
  );
}
