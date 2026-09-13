import type { Order } from "@/lib/commerce/types";
import type { PaymentStatus } from "@/lib/payments/types";

type OrderStatus = Order["status"];

/**
 * Which order statuses may follow which.
 *
 * Until now any status could follow any other. The admin list rendered all six in a
 * `<select>`, and picking one wrote it — so an order could go Delivered → Confirmed →
 * Refunded → Shipped, each step emailing the customer and the cancelled/refunded steps
 * putting units back on the shelf that never came back. The graph below is what the
 * fulfilment flow actually is, plus the single-step "undo" edges a mis-click needs.
 *
 * `cancelled → confirmed` is an undo too, but it re-takes stock (see
 * services/orders.ts `retakeStockForOrder`) and is refused if the units have since sold.
 *
 * `refunded` is reachable from every stage, because a refund can happen at any stage — a
 * card order refunded before it ships is as real as one refunded after delivery. What
 * gates it is the PAYMENT (`paymentBlocksTransition`), not the fulfilment step. It is
 * terminal: money has moved, and moving it back is a new payment, not an edit.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  confirmed: ["processing", "shipped", "cancelled", "refunded"],
  processing: ["confirmed", "shipped", "cancelled", "refunded"],
  shipped: ["processing", "delivered", "cancelled", "refunded"],
  delivered: ["shipped", "refunded"],
  cancelled: ["confirmed", "refunded"],
  refunded: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ORDER_TRANSITIONS[from].includes(to);
}

/** Payment statuses under which the shop is holding the customer's money. */
const MONEY_HELD: readonly PaymentStatus[] = ["paid", "partially_refunded"];

/**
 * The reason an order may NOT move to `next` given the state of its primary payment, or
 * null when it may.
 *
 * Two rules, both about the same thing — an order's status must never claim something
 * about money that the payment record contradicts:
 *
 * - "Refunded" means the customer has their money back. If the payment is still `paid`
 *   the refund has not happened, and the status would email the customer to say it had.
 * - "Cancelled" on a paid order is the same lie one step earlier: the goods are not going
 *   out but the money is still here. Refund first, then cancel.
 *
 * A payment that was never collected (pending, awaiting, failed, expired, cancelled) does
 * not block either — there is nothing to give back.
 */
export function paymentBlocksTransition(
  next: OrderStatus,
  payment: { status: PaymentStatus; amountHeld: number; currencyCode: string } | null
): string | null {
  if (!payment) return null;
  if (next !== "refunded" && next !== "cancelled") return null;

  if (MONEY_HELD.includes(payment.status)) {
    const held = `${payment.amountHeld.toFixed(2)} ${payment.currencyCode}`;
    return next === "refunded"
      ? `The payment still holds ${held}. Refund it from the Payments page first — marking the order refunded would tell the customer money has been returned when it has not.`
      : `This order has been paid (${held}). Refund the payment first, then cancel the order.`;
  }

  // "Refunded" also needs there to have BEEN a refund. A Cash-on-Delivery order that was
  // never collected has nothing to give back — it is cancelled, and the email that says
  // "your money has been returned" would be describing a payment that never happened.
  if (next === "refunded" && payment.status !== "refunded") {
    return "Nothing was collected for this order, so there is nothing to refund — cancel it instead.";
  }
  return null;
}

type ReturnStatus = "requested" | "approved" | "rejected" | "received" | "refunded";

/**
 * The returns graph. Straight line with one branch (reject) and single-step undo edges;
 * `received` and `refunded` both put units back (services/returns.ts), so neither can be
 * walked back to a state that implies the goods are still with the customer.
 */
export const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["requested", "received", "rejected"],
  rejected: ["requested"],
  received: ["refunded"],
  refunded: [],
};

export function canTransitionReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return from === to || RETURN_TRANSITIONS[from].includes(to);
}

export const RETURN_STATUS_CONSEQUENCE: Record<ReturnStatus, string> = {
  requested: "No email is sent.",
  approved: "The customer is emailed that the return was approved and can be sent back.",
  rejected: "The customer is emailed that the return was declined.",
  received: "The customer is emailed that the parcel arrived, and the returned units go back on the shelf.",
  refunded: "The customer is emailed that their money has been returned. Refund the payment itself on the Payments page — this only records the return. This cannot be undone.",
};
