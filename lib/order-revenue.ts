import type { Order } from "@/lib/commerce/types";

/**
 * Whether an order belongs in a sales figure.
 *
 * Every revenue number in the admin — the dashboard's "Today's Revenue", Analytics'
 * "Total Revenue" and "Average Order Value", a customer's "Total Spent" — used to sum every
 * order ever placed, so a cancelled order and a refunded one counted exactly like a
 * delivered one. A shop that refunded half its orders would have reported the same revenue
 * as one that refunded none.
 *
 * "Counts" means the sale stands: not cancelled, not refunded. It does NOT mean the money
 * has arrived — a Cash-on-Delivery order counts from the moment it is placed, the way a
 * sales report does everywhere; the payments page is where collection is tracked.
 */
export function countsAsSale(order: { status: Order["status"] | string }): boolean {
  return order.status !== "cancelled" && order.status !== "refunded";
}
