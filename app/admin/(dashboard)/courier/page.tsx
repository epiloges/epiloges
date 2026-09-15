import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PickupListPanel } from "@/components/admin/PickupListPanel";
import { VoucherPrintQueue, type VoucherQueueRow } from "@/components/admin/VoucherPrintQueue";
import { formatMoney, orderReference } from "@/lib/format";
import { getOrdersAwaitingPickup } from "@/services/orders";
import { getPrimaryPaymentForOrder } from "@/services/payments";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import { getCourierProvider, isAcsCourierConfigured, ACS_CARRIER_NAME, type PickupListSummary } from "@/lib/courier";
import { nextPickupDateInAthens } from "@/lib/courier/providers/acs";
import { issuePickupListAction } from "@/app/admin/(dashboard)/courier/actions";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The end-of-day half of shipping with ACS. Vouchers are created and printed from each
 * order; this is where the day is closed so the courier actually collects them.
 */
export default async function AdminCourierPage() {
  await requireCapabilityOrRedirect("orders:manage");
  // Reads the clock for "today", which Cache Components refuses to prerender — see the dashboard.
  await connection();

  if (!isAcsCourierConfigured()) {
    return (
      <div>
        <AdminPageHeader title="ACS Courier" description="Pickup lists for the day's vouchers." />
        <div className="border border-border bg-luxe-white p-6 text-sm text-luxe-gray-dark">
          ACS is not the active courier on this deployment (<code>COURIER_PROVIDER</code> is not <code>acs</code>).
          Tracking numbers are entered by hand on each order.
        </div>
      </div>
    );
  }

  // Sunday shows Monday: ACS refuses a Sunday pickup, and the vouchers created on a Sunday
  // are dated Monday too, so that is the list to close.
  const today = nextPickupDateInAthens();
  const provider = getCourierProvider();
  const [awaiting, listed] = await Promise.all([
    getOrdersAwaitingPickup(ACS_CARRIER_NAME),
    provider.listPickupLists ? provider.listPickupLists(today).then((lists) => ({ lists, error: null })).catch((error: unknown) => ({ lists: [] as PickupListSummary[], error: error instanceof Error ? error.message : "Couldn't reach ACS." })) : Promise.resolve({ lists: [] as PickupListSummary[], error: null }),
  ]);
  const existing = listed.lists;
  const existingError = listed.error;

  // The COD amount is on the row so the person packing sees which parcels collect cash.
  const queue: VoucherQueueRow[] = await Promise.all(
    awaiting.map(async (order) => {
      const payment = await getPrimaryPaymentForOrder(order.id);
      const cod = payment?.methodId === "cash-on-delivery" && payment.status !== "paid";
      return {
        orderId: order.id,
        reference: orderReference(order.id),
        trackingNumber: order.trackingNumber!,
        recipient: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
        city: order.shippingAddress.city,
        cod: cod ? formatMoney(order.totals.total) : null,
        printedAt: order.voucherPrintedAt ?? null,
        pieces: order.shipmentPieces,
      };
    })
  );

  return (
    <div>
      <AdminPageHeader
        title="ACS Courier"
        description="Create and print each order's voucher from the order page; close the day here so the courier collects them."
      />
      <div className="space-y-6">
        <VoucherPrintQueue rows={queue} />
        <PickupListPanel today={today} existing={existing} existingError={existingError} onIssue={issuePickupListAction} />
      </div>
    </div>
  );
}
