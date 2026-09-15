import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { PackageCheck, PackageSearch, Truck } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getNavigation, getSiteSettings } from "@/services";
import { getCourierProvider } from "@/lib/courier";
import type { TrackingStatus } from "@/lib/courier/types";
import { COMPANY } from "@/constants/company";

export const instant = false;

export const metadata: Metadata = {
  title: "Παρακολούθηση αποστολής",
  robots: { index: false, follow: false },
};

/**
 * Asked of ACS at most once every few minutes per voucher, whatever the page's traffic — a
 * customer refreshing on delivery day must not become a request storm at the courier.
 */
async function trackCached(trackingNumber: string): Promise<TrackingStatus | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`tracking:${trackingNumber}`);
  const provider = getCourierProvider();
  if (!provider.trackShipment) return null;
  try {
    return await provider.trackShipment(trackingNumber);
  } catch {
    return null;
  }
}

/**
 * The link in the shipping email — no live courier integration is configured for this
 * deployment (manual carrier entry, see lib/courier), so there's no external tracking
 * page to defer to. The customer lands here instead: the tracking number, and whatever
 * status a future provider's `trackShipment` reports (none yet, so always "pending").
 * Nothing about the order — who, what, how much — is on it; a tracking number is
 * printed on a box.
 */
export default async function TrackPage({ params }: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber } = await params;
  if (!/^\d{8,14}$/.test(trackingNumber)) notFound();

  const [navigation, settings, tracking] = await Promise.all([getNavigation(), getSiteSettings(), trackCached(trackingNumber)]);

  const state = !tracking || !tracking.known ? "pending" : tracking.delivered ? "delivered" : "moving";
  const Icon = state === "delivered" ? PackageCheck : state === "moving" ? Truck : PackageSearch;
  const headline =
    state === "delivered" ? "Το δέμα σας παραδόθηκε" : state === "moving" ? "Το δέμα σας είναι καθ' οδόν" : "Το δέμα σας ετοιμάζεται";
  const body =
    state === "delivered"
      ? "Ο διανομέας επιβεβαίωσε την παράδοση. Ελπίζουμε να τα χαρείτε."
      : state === "moving"
        ? "Ο διανομέας παρέλαβε το δέμα από το κατάστημά μας. Παράδοση συνήθως σε 1–3 εργάσιμες ημέρες."
        : "Η αποστολή έχει καταχωρηθεί και θα παραληφθεί από το κατάστημά μας στην επόμενη συλλογή. Μόλις υπάρξει ενημέρωση, η πορεία της θα εμφανίζεται εδώ.";

  return (
    <>
      <Header navigation={navigation} siteName={settings.siteName} announcementMessages={settings.announcementMessages} />
      <main id="main" className="flex-1 pt-header">
        <div className="container-luxe max-w-2xl py-14 md:py-20">
          <p className="text-eyebrow">Αριθμός αποστολής</p>
          <p className="mt-2 font-mono text-2xl tracking-[0.15em]">{trackingNumber}</p>

          <div className="mt-10 flex items-start gap-4 border border-border p-6">
            <Icon className="mt-0.5 size-6 shrink-0" strokeWidth={1.5} aria-hidden />
            <div>
              <h1 className="font-heading text-2xl">{headline}</h1>
              <p className="mt-2 text-sm text-luxe-gray-dark">{body}</p>
            </div>
          </div>

          {tracking && tracking.events.length > 0 ? (
            <ol className="mt-8 divide-y divide-border border border-border">
              {tracking.events.map((event, index) => (
                <li key={index} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3 text-sm">
                  <span>{event.status || "—"}</span>
                  <span className="text-xs text-luxe-gray-dark">
                    {[event.location, event.at].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}

          <p className="mt-10 text-xs text-luxe-gray-dark">
            Για οτιδήποτε σχετικά με την αποστολή σας, καλέστε μας στο{" "}
            <a href={`tel:${COMPANY.phoneE164}`} className="underline underline-offset-4">
              {COMPANY.phone}
            </a>
            .
          </p>
        </div>
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
