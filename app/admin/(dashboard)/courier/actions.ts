"use server";

import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { getCourierProvider, type PickupListResult } from "@/lib/courier";
import { markListedOrdersShipped, markVouchersListed } from "@/services/orders";
import { revalidatePath } from "next/cache";

export interface IssuePickupListState {
  result?: PickupListResult;
  error?: string;
}

/**
 * Closes the day with ACS. Every printed voucher dated `date` becomes a real shipment,
 * the courier gets a list to sign, and nothing on it can be cancelled from here any more.
 */
export async function issuePickupListAction(date: string): Promise<IssuePickupListState> {
  await requireCapability("orders:manage");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date first." };
  try {
    const provider = getCourierProvider();
    if (!provider.issuePickupList) return { error: "Pickup lists need COURIER_PROVIDER=acs." };
    const result = await provider.issuePickupList(date);
    if (result.pickupListNo) {
      // Ask ACS which vouchers the list actually closed rather than assuming — a voucher
      // printed from the ACS portal directly would be on it too, and one dated differently
      // would not.
      if (provider.listPickupListVouchers) {
        const closed = await provider.listPickupListVouchers(result.pickupListNo, date);
        await markVouchersListed(closed, result.pickupListNo);
      }
      // The driver has them: shipped, and the customers are told, with the tracking link.
      const shipped = await markListedOrdersShipped(result.pickupListNo);
      revalidatePath("/admin/courier");
      revalidatePath("/admin/orders", "layout");
      await recordAdminAction({
        action: "courier.pickup_list_issued",
        targetType: "pickupList",
        targetId: result.pickupListNo,
        summary: `Issued ACS pickup list ${result.pickupListNo} for ${date}${shipped.length ? ` — ${shipped.length} order${shipped.length === 1 ? "" : "s"} marked shipped` : ""}`,
        metadata: { date, pickupListNo: result.pickupListNo, shippedOrderIds: shipped },
      });
    }
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't issue the pickup list." };
  }
}
