import "server-only";
import { getSiteContent, setSiteContent } from "@/lib/site-content";

/**
 * Maintenance mode: one switch on the admin dashboard that takes the storefront offline.
 *
 * While it is on, `proxy.ts` answers every storefront request with the "back soon" page and a
 * **503** — the status that tells crawlers "temporarily unavailable, come back later" rather
 * than dropping the pages from the index the way a 404 or a blank 200 would. The admin, the
 * APIs the bank and the couriers call back into, and static assets stay reachable; a signed-in
 * admin passes straight through, so the shop can be checked from the outside while customers
 * cannot get in.
 *
 * Stored in `site_content` like the other singleton settings, but read on a different budget:
 * the proxy runs on every pageview, so the flag is cached in-process for a few seconds instead
 * of being looked up each time. Flipping the switch therefore takes effect within that window
 * on every warm instance, not instantly — fine for a switch that is thrown a handful of times a
 * year.
 */
export interface MaintenanceMode {
  enabled: boolean;
  /** ISO timestamp of the last change, or null if the switch has never been touched. */
  changedAt: string | null;
  /** Name of the admin who last flipped it, for the dashboard notice. */
  changedBy: string | null;
}

const KEY = "maintenance";
const OFF: MaintenanceMode = { enabled: false, changedAt: null, changedBy: null };

export async function getMaintenanceMode(): Promise<MaintenanceMode> {
  return getSiteContent<MaintenanceMode>(KEY, OFF);
}

export async function setMaintenanceMode(enabled: boolean, changedBy: string): Promise<MaintenanceMode> {
  const next: MaintenanceMode = { enabled, changedAt: new Date().toISOString(), changedBy };
  await setSiteContent<MaintenanceMode>(KEY, next);
  cached = { value: enabled, expiresAt: Date.now() + CACHE_MS };
  return next;
}

const CACHE_MS = 10_000;
let cached: { value: boolean; expiresAt: number } | null = null;

/**
 * The proxy's read. Cached per instance for `CACHE_MS`; a failed lookup reports "off" rather
 * than taking the shop down on a database hiccup, and does not poison the cache, so the next
 * request tries again.
 */
export async function isMaintenanceModeOn(): Promise<boolean> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const { enabled } = await getMaintenanceMode();
    cached = { value: enabled, expiresAt: Date.now() + CACHE_MS };
    return enabled;
  } catch (error) {
    console.error("[maintenance] could not read the flag; treating the shop as open", error);
    return false;
  }
}
