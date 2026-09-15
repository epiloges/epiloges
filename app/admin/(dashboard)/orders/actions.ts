"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/services/audit-log";
import { getOrderById, updateOrderShippingAddress, updateOrderStatus, updateOrderTracking, type OrderTrackingInput } from "@/services/orders";
import { addressSchema } from "@/lib/validation/checkout";
import { getPrimaryPaymentForOrder } from "@/services/payments";
import { CommerceError, type Order } from "@/lib/commerce/types";
import { canTransitionOrder, paymentBlocksTransition } from "@/lib/order-transitions";

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

export interface ShippingAddressInput {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  region?: string;
  postalCode: string;
  phone: string;
}

export interface ShippingAddressActionState {
  error?: string;
}

/**
 * The delivery address, corrected by the shop. Validated with the checkout's own address
 * schema, so the admin cannot save what the customer could not have typed. Refused while a
 * courier voucher exists: the label carries the old address, and a voucher that says one
 * thing while the order says another is how a parcel goes to the wrong door.
 */
export async function updateOrderShippingAddressAction(orderId: string, input: ShippingAddressInput): Promise<ShippingAddressActionState> {
  await requireCapability("orders:manage");
  const order = await getOrderById(orderId);
  if (!order) return { error: "Order not found." };
  if (order.trackingNumber) {
    return { error: `Voucher ${order.trackingNumber} already carries this address. Cancel the voucher, correct the address, then create it again.` };
  }

  const parsed = addressSchema.omit({ invoice: true }).safeParse({ ...input, countryCode: order.shippingAddress.countryCode });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the address." };
  const { countryCode: _countryCode, ...address } = parsed.data;

  const before = order.shippingAddress;
  await updateOrderShippingAddress(orderId, {
    ...address,
    company: address.company || undefined,
    address2: address.address2 || undefined,
    region: address.region || undefined,
  });

  const line = (a: { address1: string; postalCode: string; city: string }) => `${a.address1}, ${a.postalCode} ${a.city}`;
  await recordAdminAction({
    action: "order.address_updated",
    targetType: "order",
    targetId: orderId,
    summary: `Corrected the delivery address: "${line(before)}" → "${line(address)}"`,
    metadata: { before, after: address },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  return {};
}

export interface OrderNoteActionState {
  error?: string;
  success?: string;
}

/** Saves the shop's internal note on an order. Never emailed, never shown to the customer. */
export async function updateOrderInternalNoteAction(
  orderId: string,
  _previous: OrderNoteActionState,
  formData: FormData
): Promise<OrderNoteActionState> {
  await requireCapability("orders:manage");
  const note = String(formData.get("internalNote") ?? "").trim().slice(0, 2000);
  let before: { internalNote: string | null } | null;
  try {
    before = await prisma.order.findUnique({ where: { id: orderId }, select: { internalNote: true } });
    if (!before) return { error: "Order not found." };
    await prisma.order.update({ where: { id: orderId }, data: { internalNote: note || null } });
  } catch (error) {
    // A thrown error here would replace the whole page with the storefront's error screen.
    console.error("[orders] internal note save failed", error);
    return { error: "Couldn't save the note — try again." };
  }
  if ((before.internalNote ?? "") !== note) {
    await recordAdminAction({
      action: "order.note_updated",
      targetType: "order",
      targetId: orderId,
      summary: note ? `Updated the internal note: "${note.slice(0, 80)}${note.length > 80 ? "…" : ""}"` : "Cleared the internal note",
    });
  }
  revalidatePath(`/admin/orders/${orderId}`);
  return { success: note ? "Note saved." : "Note cleared." };
}
