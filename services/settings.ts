import "server-only";
import settingsFallback from "@/data/settings.json";
import { getSiteContent, getSiteContentCached, setSiteContent } from "@/lib/site-content";
import { getShippingSettings } from "@/services/shipping";
import type { SiteSettings } from "@/types";

/**
 * Announcement text can carry `{freeShippingThreshold}`, which is filled from the live
 * shipping settings. The bar used to say "over 100 €" while the threshold was 150 — two
 * places holding one number, edited separately. The placeholder keeps them one number;
 * an announcement using it is dropped when free shipping is switched off, since it would
 * then be advertising something the shop has stopped doing.
 */
const THRESHOLD_PLACEHOLDER = "{freeShippingThreshold}";

async function withLiveThreshold(settings: SiteSettings): Promise<SiteSettings> {
  if (!settings.announcementMessages.some((message) => message.includes(THRESHOLD_PLACEHOLDER))) return settings;
  const shipping = await getShippingSettings();
  const threshold = shipping.freeShippingThreshold;
  const formatted = threshold === null ? null : `${Number.isInteger(threshold) ? threshold : threshold.toFixed(2)} €`;
  return {
    ...settings,
    announcementMessages: settings.announcementMessages.flatMap((message) => {
      if (!message.includes(THRESHOLD_PLACEHOLDER)) return [message];
      return formatted === null ? [] : [message.split(THRESHOLD_PLACEHOLDER).join(formatted)];
    }),
  };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const stored = await getSiteContentCached<SiteSettings>("settings", settingsFallback as SiteSettings);
  return withLiveThreshold(stored);
}

/** The stored settings, placeholders intact — what the admin form edits. */
export async function getRawSiteSettings(): Promise<SiteSettings> {
  return getSiteContent<SiteSettings>("settings", settingsFallback as SiteSettings);
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  await setSiteContent<SiteSettings>("settings", settings);
}
