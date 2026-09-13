import type { Order } from "@/lib/commerce/types";

/** Shared across the customer-facing orders page and the admin orders page — previously each hand-rolled its own partial (2-status vs 5-status) mapping. */
export const ORDER_STATUS_LABEL: Record<Order["status"], string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/**
 * What picking each status DOES, in the words the confirmation dialog uses. Every status
 * except "confirmed" emails the customer immediately, and two of them move stock — a
 * dropdown that fires all of that on a single mis-click, without saying so, is how a
 * customer receives "your order was refunded" for an order that is on its way.
 */
export const ORDER_STATUS_CONSEQUENCE: Record<Order["status"], string> = {
  confirmed: "No email is sent. If the order was cancelled, its units are taken off the shelf again.",
  processing: "The customer is emailed that the order is being prepared.",
  shipped: "The customer is emailed that the order has shipped, with the tracking number if one is set.",
  delivered: "The customer is emailed that the order was delivered, and a review request follows later.",
  cancelled: "The customer is emailed that the order was cancelled, and its units go back on the shelf.",
  refunded: "The customer is emailed that their money has been returned, and the units go back on the shelf. This cannot be undone.",
};

export const ORDER_STATUS_OPTIONS: Order["status"][] = [
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];
