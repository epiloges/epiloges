"use server";

import { revalidatePath } from "next/cache";
import { capabilityDenied, getAdminSession } from "@/lib/admin-session";
import { cancelPayment, confirmManualPayment, refundPayment, verifyPaymentWithProvider } from "@/services/payments";
import { recordAdminAction } from "@/services/audit-log";
import { PaymentError } from "@/lib/payments/types";
import { getOrderById, updateOrderStatus } from "@/services/orders";
import { canTransitionOrder } from "@/lib/order-transitions";

/**
 * Payment mutations, each gated on the narrowest capability that fits what it does.
 *
 * The split is not bureaucratic: `payments:manage` says "the shop has this money",
 * which is an accounting statement; `payments:refund` moves money back out, usually
 * through a live provider API, and can't be undone. An editor who can dispatch
 * orders should not be able to do either.
 */
export interface PaymentActionState {
  error?: string;
  success?: string;
}

function revalidatePayment(paymentId: string) {
  revalidatePath(`/admin/payments/${paymentId}`);
  revalidatePath("/admin/payments");
  // Order pages surface the payment status too, so they'd otherwise show a stale one.
  revalidatePath("/admin/orders", "layout");
}

/** Turns a PaymentError into its shopper-safe message; anything else into a generic one, with the detail logged. */
function toActionError(error: unknown, fallback: string): string {
  if (error instanceof PaymentError) return error.message;
  console.error("[payments] admin action failed", error);
  return fallback;
}

export async function confirmManualPaymentAction(paymentId: string, note?: string): Promise<PaymentActionState> {
  const denied = await capabilityDenied("payments:manage");
  if (denied) return { error: denied };
  const session = await getAdminSession();

  try {
    await confirmManualPayment(paymentId, session?.sub ?? "unknown", note);
  } catch (error) {
    return { error: toActionError(error, "Could not confirm this payment.") };
  }
  /**
   * Audited as carefully as a refund. Bank transfer is the only method live today, so this
   * IS how orders get paid here — one person asserting money arrived, with nothing else in
   * the system able to contradict them. That makes it the highest-trust action in the admin.
   */
  await recordAdminAction({
    action: "payment.confirmed_manually",
    targetType: "payment",
    targetId: paymentId,
    summary: "Marked as received",
    metadata: { note: note ?? null },
  });
  revalidatePayment(paymentId);
  return { success: "Payment marked as received." };
}

export async function cancelPaymentAction(paymentId: string, reason?: string): Promise<PaymentActionState> {
  const denied = await capabilityDenied("payments:manage");
  if (denied) return { error: denied };
  const session = await getAdminSession();

  try {
    await cancelPayment(paymentId, session?.sub ?? "unknown", reason);
  } catch (error) {
    return { error: toActionError(error, "Could not cancel this payment.") };
  }
  await recordAdminAction({
    action: "payment.cancelled",
    targetType: "payment",
    targetId: paymentId,
    summary: "Cancelled the payment attempt",
    metadata: { reason: reason ?? null },
  });
  revalidatePayment(paymentId);
  return { success: "Payment cancelled." };
}

export async function refundPaymentAction(
  paymentId: string,
  amount: number,
  reason?: string
): Promise<PaymentActionState> {
  const denied = await capabilityDenied("payments:refund");
  if (denied) return { error: denied };
  const session = await getAdminSession();

  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a refund amount greater than zero." };

  let record;
  try {
    record = await refundPayment(paymentId, amount, session?.sub ?? "unknown", reason);
  } catch (error) {
    return { error: toActionError(error, "Could not process this refund.") };
  }
  // Recorded only AFTER the provider confirmed. An audit line for a refund that never
  // happened is worse than no line at all, because it is believed.
  await recordAdminAction({
    action: "payment.refunded",
    targetType: "payment",
    targetId: paymentId,
    summary: `Refunded ${amount}`,
    metadata: { amount, reason: reason ?? null },
  });

  /**
   * A FULL refund carries the order with it. Until now the two records were independent:
   * money went back, and the order stayed "delivered" with its units still off the shelf,
   * unless someone remembered to change it by hand in a second place. The order-side
   * transition is what restocks and tells the customer, so it is triggered here rather
   * than duplicated — and only for a full refund, because a partial one (one item of
   * three) is a return, not the end of the order.
   */
  let orderNote = "";
  if (record.status === "refunded") {
    const order = await getOrderById(record.orderId);
    if (order && order.status !== "refunded" && canTransitionOrder(order.status, "refunded")) {
      try {
        await updateOrderStatus(order.id, "refunded");
        await recordAdminAction({
          action: "order.status_changed",
          targetType: "order",
          targetId: order.id,
          summary: "Set order status to refunded (payment fully refunded)",
          metadata: { status: "refunded", previousStatus: order.status, paymentId },
        });
        orderNote = " The order is now marked refunded and its stock is back on the shelf.";
      } catch (error) {
        orderNote = ` The order could not be marked refunded: ${toActionError(error, "unknown error")}`;
      }
    }
  }

  revalidatePayment(paymentId);
  return { success: `Refund recorded.${orderNote}` };
}

/**
 * Re-asks the provider what the truth is. Available to anyone who can view payments
 * — it's a read that writes only what the provider itself reports, so it can't be
 * used to assert a status the provider doesn't agree with.
 */
export async function refreshPaymentStatusAction(paymentId: string): Promise<PaymentActionState> {
  const denied = await capabilityDenied("payments:view");
  if (denied) return { error: denied };

  try {
    await verifyPaymentWithProvider(paymentId);
  } catch (error) {
    return { error: toActionError(error, "Could not refresh this payment.") };
  }
  revalidatePayment(paymentId);
  return { success: "Status refreshed from the provider." };
}
