import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCourierProvider, ACS_CARRIER_NAME } from "@/lib/courier";
import { updateOrderStatus } from "@/services/orders";
import { recordAdminAction } from "@/services/audit-log";

/**
 * ACS does not call the shop when a parcel moves — there is no webhook in the Web
 * Services — so the shop asks. Once a day (vercel.json), every order whose ACS voucher is
 * on a pickup list and which is not yet delivered is looked up:
 *
 *   processing, and ACS now knows the parcel   → shipped   (the customer gets the
 *                                                 shipping email with the tracking number)
 *   shipped, and ACS says it was delivered      → delivered (deliveredAt is stamped, and
 *                                                 five days later the review request
 *                                                 goes out — services/email-followups.ts)
 *
 * The first scanned voucher's raw rows are written to the activity log, because no
 * scanned voucher has been seen yet and the field names in lib/courier/providers/acs.ts
 * are read by pattern; the log is where the pattern gets confirmed or corrected.
 */
export async function runAcsDeliverySync(): Promise<{ checked: number; shipped: number; delivered: number; unknown: number; errors: number }> {
  const provider = getCourierProvider();
  const summary = { checked: 0, shipped: 0, delivered: 0, unknown: 0, errors: 0 };
  if (!provider.trackShipment) return summary;

  const orders = await prisma.order.findMany({
    where: {
      carrier: ACS_CARRIER_NAME,
      trackingNumber: { not: null },
      pickupListNo: { not: null },
      status: { in: ["processing", "shipped"] },
      deliveredAt: null,
    },
    select: { id: true, status: true, trackingNumber: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let rawLogged = false;
  for (const order of orders) {
    summary.checked += 1;
    try {
      const tracking = await provider.trackShipment(order.trackingNumber!);
      if (!tracking.known) {
        summary.unknown += 1;
        continue;
      }
      if (!rawLogged && tracking.raw.length > 0) {
        rawLogged = true;
        await recordAdminAction({
          action: "order.tracking_updated",
          targetType: "order",
          targetId: order.id,
          summary: `ACS tracking rows for ${order.trackingNumber} (first scanned voucher seen by the sync)`,
          metadata: { rows: tracking.raw.slice(0, 20) },
        });
      }
      if (order.status === "processing") {
        await updateOrderStatus(order.id, "shipped");
        summary.shipped += 1;
        await recordAdminAction({
          action: "order.status_changed",
          targetType: "order",
          targetId: order.id,
          summary: `ACS has the parcel (${order.trackingNumber}) — set to shipped by the courier sync`,
          metadata: { trackingNumber: order.trackingNumber, latest: tracking.events.at(-1) ?? null },
        });
      }
      if (tracking.delivered) {
        await updateOrderStatus(order.id, "delivered");
        summary.delivered += 1;
        await recordAdminAction({
          action: "order.status_changed",
          targetType: "order",
          targetId: order.id,
          summary: `ACS reports ${order.trackingNumber} delivered${tracking.deliveredAt ? ` (${tracking.deliveredAt})` : ""} — set to delivered by the courier sync`,
          metadata: { trackingNumber: order.trackingNumber, deliveredAt: tracking.deliveredAt ?? null },
        });
      }
    } catch (error) {
      summary.errors += 1;
      logger.error("ACS delivery sync failed for an order", error, { orderId: order.id });
    }
  }
  return summary;
}
