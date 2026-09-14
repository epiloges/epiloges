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
 * A closed shop can still be shown to chosen people: the "back soon" page takes a four-digit
 * PIN, and the right one sets a cookie the proxy honours. The cookie holds an HMAC of the PIN,
 * not the PIN itself, so it cannot be forged without the session secret — and changing the PIN
 * silently logs every tester out, which is the whole reason it is a hash of the PIN and not a
 * random token.
 *
 * Stored in `site_content` like the other singleton settings, but read on a different budget:
 * the proxy runs on every pageview, so the record is cached in-process for a few seconds
 * instead of being looked up each time. Flipping the switch therefore takes effect within that
 * window on every warm instance, not instantly — fine for a switch that is thrown a handful of
 * times a year.
 */
export interface MaintenanceMode {
  enabled: boolean;
  /** Four digits; what a tester types on the "back soon" page to get in. */
  pin: string;
  /** ISO timestamp of the last change, or null if the switch has never been touched. */
  changedAt: string | null;
  /** Name of the admin who last flipped it, for the dashboard notice. */
  changedBy: string | null;
}

const KEY = "maintenance";
const DEFAULT_PIN = "1984";
const OFF: MaintenanceMode = { enabled: false, pin: DEFAULT_PIN, changedAt: null, changedBy: null };

export const MAINTENANCE_PASS_COOKIE = "maintenance_pass";
export const MAINTENANCE_PASS_MAX_AGE = 14 * 24 * 60 * 60;

export async function getMaintenanceMode(): Promise<MaintenanceMode> {
  const stored = await getSiteContent<Partial<MaintenanceMode>>(KEY, OFF);
  // Records written before the PIN existed have no `pin`; the default keeps them usable.
  return { ...OFF, ...stored, pin: stored.pin || DEFAULT_PIN };
}

export async function setMaintenanceMode(enabled: boolean, changedBy: string): Promise<MaintenanceMode> {
  const current = await getMaintenanceMode();
  const next: MaintenanceMode = { ...current, enabled, changedAt: new Date().toISOString(), changedBy };
  await setSiteContent<MaintenanceMode>(KEY, next);
  cached = { value: next, expiresAt: Date.now() + CACHE_MS };
  return next;
}

export async function setMaintenancePin(pin: string): Promise<MaintenanceMode> {
  const current = await getMaintenanceMode();
  const next: MaintenanceMode = { ...current, pin };
  await setSiteContent<MaintenanceMode>(KEY, next);
  cached = { value: next, expiresAt: Date.now() + CACHE_MS };
  return next;
}

const CACHE_MS = 10_000;
let cached: { value: MaintenanceMode; expiresAt: number } | null = null;

/**
 * The proxy's read. Cached per instance for `CACHE_MS`; a failed lookup reports "off" rather
 * than taking the shop down on a database hiccup, and does not poison the cache, so the next
 * request tries again.
 */
async function readCached(): Promise<MaintenanceMode> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const value = await getMaintenanceMode();
    cached = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch (error) {
    console.error("[maintenance] could not read the flag; treating the shop as open", error);
    return OFF;
  }
}

export async function isMaintenanceModeOn(): Promise<boolean> {
  return (await readCached()).enabled;
}

/** The cookie value a given PIN earns: HMAC-SHA256 under the admin session secret, hex. */
export async function maintenancePassToken(pin: string): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`maintenance-pass:${pin}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Whether a `maintenance_pass` cookie was earned with the PIN that is current right now. */
export async function hasValidMaintenancePass(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const { pin } = await readCached();
  const expected = await maintenancePassToken(pin);
  if (expected.length !== cookieValue.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ cookieValue.charCodeAt(i);
  return diff === 0;
}
