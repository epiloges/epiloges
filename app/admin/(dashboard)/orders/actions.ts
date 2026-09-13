"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { getOrderById, updateOrderStatus, updateOrderTracking, type OrderTrackingInput } from "@/services/orders";
import { getCourierProvider, ACS_CARRIER_NAME } from "@/lib/courier";
import { getPrimaryPaymentForOrder } from "@/services/payments";
import { getSiteSettings } from "@/services/settings";
import { CommerceError, type Order } from "@/lib/commerce/types";
import { canTransitionOrder, paymentBlocksTransition } from "@/lib/order-transitions";

/** A courier voucher only makes sense for an order that is actually going out. */
const SHIPPABLE_ORDER_STATUSES = new Set<Order["status"]>(["confirmed", "processing", "shipped"]);

export interface OrderStatusActionState {
  error?: string;
}

/**
 * Changes an order's status, or explains why it can't.
 *
 * Returns `{ error }` rather than throwing: this is called from a `<select>` in the orders
 * list, and an unhandled rejection there used to leave the dropdown showing the status the
 * admin picked while the database kept the old one. Two things are checked before anything
 * is written — the fulfilment graph (lib/order-transitions.ts, enforced again inside
 * `updateOrderStatus`) and the money: an order whose payment is still `paid` cannot be
 * called refunded or cancelled, because either status emails the customer a claim about
 * their money that the payment record contradicts.
 */
export async function updateOrderStatusAction(orderId: string, status: Order["status"]): Promise<OrderStatusActionState> {
  await requireCapability("orders:manage");

  const order = await getOrderById(orderId);
  if (!order) return { error: "Order not found." };
  if (!canTransitionOrder(order.status, status)) {
    return { error: `An order can't go from ${order.status} to ${status}.` };
  }

  const payment = await getPrimaryPaymentForOrder(orderId);
  const blocked = paymentBlocksTransition(
    status,
    payment
      ? {
          status: payment.status,
          amountHeld: payment.amount.amount - payment.refundedAmount.amount,
          currencyCode: payment.amount.currencyCode,
        }
      : null
  );
  if (blocked) return { error: blocked };

  try {
    await updateOrderStatus(orderId, status);
  } catch (error) {
    if (error instanceof CommerceError) return { error: error.message };
    throw error;
  }
  /**
   * OBS-003. `order.status_changed` was declared in the audit vocabulary from the start and
   * never written by anything — the verb existed, the record did not. Altering an order
   * after a customer has paid for it is exactly the case the trail is for: it is the
   * difference between "we marked it delivered" and "the customer says it never arrived".
   */
  await recordAdminAction({
    action: "order.status_changed",
    targetType: "order",
    targetId: orderId,
    summary: `Set order status to ${status}`,
    metadata: { status, previousStatus: order.status },
  });
  revalidatePath("/", "layout");
  return {};
}

export async function updateOrderTrackingAction(orderId: string, input: OrderTrackingInput): Promise<void> {
  await requireCapability("orders:manage");
  await updateOrderTracking(orderId, input);
  await recordAdminAction({
    action: "order.tracking_updated",
    targetType: "order",
    targetId: orderId,
    summary: input.trackingNumber
      ? `Set tracking to ${input.trackingNumber}`
      : "Cleared the tracking number",
    metadata: { ...input },
  });
  revalidatePath("/", "layout");
}

export interface CreateShipmentActionState {
  error?: string;
}

/**
 * Calls the real ACS API when COURIER_PROVIDER=acs (see lib/courier) — an actual
 * live shipment/voucher, not a no-op. Only reachable from the admin order detail
 * page's button, which is itself only rendered when ACS is configured.
 */
export async function createAcsShipmentAction(orderId: string): Promise<CreateShipmentActionState> {
  await requireCapability("orders:manage");
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: "Order not found." };

    if (!SHIPPABLE_ORDER_STATUSES.has(order.status)) {
      return {
        error: `This order is ${order.status} — a voucher would ship goods the customer is not getting. Move it back to confirmed first if that is wrong.`,
      };
    }
    if (order.trackingNumber) {
      return { error: `This order already has tracking number ${order.trackingNumber}. Cancel that voucher first if it is wrong.` };
    }

    const totalQuantity = order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
    const [payment, settings] = await Promise.all([getPrimaryPaymentForOrder(order.id), getSiteSettings()]);
    /**
     * Αντικαταβολή rides on the voucher: the courier collects the order total at the door.
     * Only while the money is still outstanding — a COD order the customer has already
     * paid some other way must not be collected twice.
     */
    const collectOnDelivery = payment?.methodId === "cash-on-delivery" && payment.status !== "paid";

    const provider = getCourierProvider();
    const result = await provider.createShipment({
      orderId: order.id,
      recipientName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
      address: order.shippingAddress,
      // Order snapshots don't carry per-line-item weight — a reasonable flat
      // estimate per unit until real per-product shipping weight is threaded
      // through the cart/order snapshot.
      weightGrams: Math.max(500, totalQuantity * 500),
      // One parcel per order. ACS reads Item_Quantity as the number of PARCELS and issues
      // a voucher per parcel; a three-pair order still ships in one box.
      itemQuantity: 1,
      codAmount: collectOnDelivery ? order.totals.total.amount : undefined,
      deliveryNotes: order.customerNote,
      senderName: settings.siteName,
    });

    await updateOrderTracking(orderId, result);
    // This one really did dispatch a courier voucher against the shop's ACS account, so it
    // costs money whether or not the parcel is ever sent.
    await recordAdminAction({
      action: "order.shipment_created",
      targetType: "order",
      targetId: orderId,
      summary: `Created an ACS shipment${result.trackingNumber ? ` (${result.trackingNumber})` : ""}${collectOnDelivery ? ` collecting ${order.totals.total.amount.toFixed(2)} on delivery` : ""}`,
      metadata: { ...result, codAmount: collectOnDelivery ? order.totals.total.amount : null },
    });
    revalidatePath("/", "layout");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't create the shipment." };
  }
}

/**
 * Cancels the ACS voucher and clears the order's tracking. Only possible until the voucher
 * has been closed into a pickup list — after that ACS treats it as a real shipment and the
 * shop has to ask its ACS branch.
 */
export async function cancelAcsShipmentAction(orderId: string): Promise<CreateShipmentActionState> {
  await requireCapability("orders:manage");
  try {
    const order = await getOrderById(orderId);
    if (!order) return { error: "Order not found." };
    if (!order.trackingNumber || order.carrier !== ACS_CARRIER_NAME) {
      return { error: "This order has no ACS voucher to cancel." };
    }
    const provider = getCourierProvider();
    if (!provider.deleteShipment) return { error: "The active courier provider cannot cancel vouchers." };

    await provider.deleteShipment(order.trackingNumber);
    await updateOrderTracking(orderId, {});
    await recordAdminAction({
      action: "order.shipment_cancelled",
      targetType: "order",
      targetId: orderId,
      summary: `Cancelled ACS voucher ${order.trackingNumber}`,
      metadata: { cancelledVoucher: order.trackingNumber },
    });
    revalidatePath("/", "layout");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't cancel the voucher." };
  }
}
