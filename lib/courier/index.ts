import "server-only";
import { createManualCourierProvider } from "@/lib/courier/providers/manual";
import type { CourierProvider } from "@/lib/courier/types";

export * from "@/lib/courier/types";

/**
 * No live courier integration configured for this deployment — the admin enters a
 * tracking number and carrier name by hand (see the manual provider). A future
 * client-specific integration (their own courier, their own account) registers
 * here the same way the previous ACS integration did: implement `CourierProvider`,
 * switch on `COURIER_PROVIDER`.
 */
export function getCourierProvider(): CourierProvider {
  return createManualCourierProvider();
}

/** No carrier-specific tracking page is wired up — every order is manual-carrier. */
export function buildTrackingUrl(_carrier: string): string | undefined {
  return undefined;
}

/** Placeholder carrier name a manually-entered tracking number is compared against. */
export const MANUAL_CARRIER_NAME = "Courier";

export function isAcsCourierConfigured(): boolean {
  return false;
}
