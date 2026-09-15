import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { DEFAULT_PAGE_SIZE, resolvePage, toPaged, type Paged } from "@/lib/pagination";
import { toJsonInput, toOrder } from "@/lib/commerce/postgres/mappers";
import { getEmailProvider, shippingUpdateEmail } from "@/lib/email";
import { getSiteSettings } from "@/services/settings";
import { creditStockForLines, quantitiesCreditedByReturns, subtractCreditedQuantities } from "@/services/restock";
import { CommerceError, type Address, type Order } from "@/lib/commerce/types";
import { orderLink } from "@/services/order-notifications";
import { getPrimaryPaymentForOrder } from "@/services/payments";
import { paymentProviderRegistry } from "@/lib/payments/registry";
import { canTransitionOrder } from "@/lib/order-transitions";
import { getSiteUrl } from "@/lib/site-url";

export async function getOrderById(id: string): Promise<Order | null> {
  const row = await prisma.order.findUnique({ where: { id } });
  return row ? toOrder(row) : null;
}

export async function getOrdersForCustomer(customerId: string): Promise<Order[]> {
  const rows = await prisma.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } });
  return rows.map(toOrder);
}

/**
 * Every order, unpaged — kept for the two screens that genuinely aggregate over the whole
 * set (the dashboard's recent-orders strip and revenue figures, and Analytics). The
 * orders LIST no longer uses it; see `listOrdersForAdmin`. This is the next thing to
 * revisit when order volume grows, since both callers really want SQL aggregates rather
 * than every row in memory.
 */
export async function getAllOrdersForAdmin(): Promise<Order[]> {
  const rows = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(toOrder);
}

export interface AdminOrderQuery {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The admin orders list: filtered, searched and paged in SQL.
 *
 * It used to render every order ever placed, with no search and no status filter, so
 * finding one order meant Ctrl-F over the whole table. Fine at nine orders and unusable
 * at nine hundred — and the fix has to be server-side, because the point is not fetching
 * them all in the first place.
 *
 * Search covers the three things someone actually has to hand: the short order reference
 * a customer quotes (matched against the tail of the id, which is what
 * `orderReference()` renders), the email address, and the name on the shipping label.
 * The name lives inside a Json column, so it is matched with Prisma's `string_contains`
 * on the specific paths rather than by casting the whole document to text — that would
 * also match street names and gift messages, which is a surprising place for a search
 * for "Anna" to land.
 */
export async function listOrdersForAdmin(query: AdminOrderQuery = {}): Promise<Paged<Order>> {
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const search = query.search?.trim();

  const where: Prisma.OrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            // A customer quotes "#38QLUMG3"; the stored id is the full cuid.
            { id: { endsWith: search.replace(/^#/, "").toLowerCase() } },
            { customerEmail: { contains: search, mode: "insensitive" } },
            { shippingAddress: { path: ["firstName"], string_contains: search, mode: "insensitive" } },
            { shippingAddress: { path: ["lastName"], string_contains: search, mode: "insensitive" } },
            { trackingNumber: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const total = await prisma.order.count({ where });
  const { page, skip, take } = resolvePage(total, { page: query.page ?? 1, pageSize });
  const rows = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip, take });

  return toPaged(rows.map(toOrder), total, page, pageSize);
}

/** Status values the filter offers, in fulfilment order. */
export const ORDER_STATUS_FILTERS = ["confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;

/** The statuses that mean the goods are not going out, so their units belong back on the shelf. */
const STOCK_RETURNING_STATUSES = new Set(["cancelled", "refunded"]);

/**
 * Puts an order's units back into `ProductSize.quantity`.
 *
 * `completeCheckout` decrements stock inside the order transaction and, until now,
 * nothing ever incremented it back: cancelling or refunding an order changed its status
 * and nothing else. In a catalog where every size holds one unit, a single cancellation
 * removed that variant from sale permanently until someone edited the product by hand.
 *
 * Claimed with a null-guarded `updateMany` BEFORE any stock is written, so two concurrent
 * status changes (or a re-save of an already-cancelled order) cannot both credit the same
 * units — exactly the pattern `sendOrderConfirmationEmail` uses for its own once-only
 * guarantee. If the restock itself then fails, the claim is released so a later attempt
 * can retry rather than the order being permanently marked as settled.
 *
 * Only lines whose product denies overselling are restored — see `creditStockForLines`.
 *
 * Units a RETURN on this order has already credited are subtracted first. Without that, a
 * customer returning one item and the shop then refunding the whole order credits that item
 * twice, inventing stock that was never on the shelf. The two paths hold separate claims
 * (`Order.restockedAt` and `Return.restockedAt`) precisely because either can happen first.
 */
async function restockOrderIfNeeded(orderId: string, lineItems: Order["lineItems"]): Promise<void> {
  if (lineItems.length === 0) return;

  const claimed = await prisma.order.updateMany({
    where: { id: orderId, restockedAt: null },
    data: { restockedAt: new Date() },
  });
  if (claimed.count === 0) return;

  try {
    const alreadyCredited = await quantitiesCreditedByReturns(orderId);
    const lines = lineItems.map((item) => ({
      productId: item.productId,
      size: item.size,
      quantity: item.quantity,
    }));

    await creditStockForLines(subtractCreditedQuantities(lines, alreadyCredited));
  } catch (error) {
    await prisma.order.update({ where: { id: orderId }, data: { restockedAt: null } }).catch(() => {});
    // Surfaced rather than swallowed: unlike a failed email, stock that silently stayed
    // off the shelf is invisible until a customer cannot buy something.
    logger.error("Restock failed after order cancellation", error, { orderId });
  }
}

/**
 * The mirror image of `restockOrderIfNeeded`, for un-cancelling.
 *
 * Cancelling put the order's units back on the shelf; moving it back to "confirmed" means
 * they are going out after all, so they have to come off again — and they may have sold in
 * the meantime. The take is the same conditional decrement checkout uses
 * (services/checkout.ts): the availability check IS the write, inside one transaction, so
 * either every line is re-taken or none is. Only lines whose product denies overselling are
 * touched, matching what the restock credited.
 *
 * The `restockedAt` claim is cleared only if every line was re-taken, so an order that
 * could not be resurrected keeps its record of having been restocked.
 */
async function retakeStockForOrder(orderId: string, lineItems: Order["lineItems"]): Promise<void> {
  const current = await prisma.order.findUnique({ where: { id: orderId }, select: { restockedAt: true } });
  // Never restocked (an order cancelled before restocking existed, or one that failed to
  // restock) holds nothing to re-take.
  if (!current?.restockedAt) return;

  const positive = lineItems.filter((line) => line.quantity > 0);
  if (positive.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const productIds = [...new Set(positive.map((line) => line.productId))];
    const [products, sizes] = await Promise.all([
      tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, inventoryPolicy: true } }),
      tx.productSize.findMany({
        where: { OR: positive.map((line) => ({ productId: line.productId, name: line.size })) },
        select: { id: true, productId: true, name: true },
      }),
    ]);
    const policyById = new Map(products.map((product) => [product.id, product.inventoryPolicy]));
    const sizeIdByKey = new Map(sizes.map((size) => [`${size.productId}:${size.name}`, size.id]));

    // Aggregate per stock row first — two lines for the same size must be one decrement.
    const needed = new Map<string, { quantity: number; label: string }>();
    for (const line of positive) {
      if (policyById.get(line.productId) !== "deny") continue;
      const sizeId = sizeIdByKey.get(`${line.productId}:${line.size}`);
      if (!sizeId) continue;
      const existing = needed.get(sizeId);
      if (existing) existing.quantity += line.quantity;
      else needed.set(sizeId, { quantity: line.quantity, label: `${line.name} (${line.size})` });
    }

    for (const [sizeId, { quantity, label }] of needed) {
      const { count } = await tx.productSize.updateMany({
        where: { id: sizeId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (count === 0) {
        throw new CommerceError(
          "OUT_OF_STOCK",
          `${label} has sold since this order was cancelled — there is no stock left to fulfil it. Leave it cancelled, or restock the product first.`
        );
      }
    }

    await tx.order.update({ where: { id: orderId }, data: { restockedAt: null } });
  });
}

/**
 * Moves an order to `status`, refusing anything the fulfilment graph does not allow.
 *
 * Throws `CommerceError("INVALID_STATUS_TRANSITION")` for a disallowed step and
 * `CommerceError("OUT_OF_STOCK")` when un-cancelling an order whose units have since sold.
 * Both carry a message written for the admin, so callers can show it as-is.
 *
 * Whether the PAYMENT allows the step (a paid order cannot be refunded or cancelled until
 * the money has actually gone back) is decided by the caller — see
 * app/admin/(dashboard)/orders/actions.ts — because this module deliberately knows nothing
 * about payments.
 */
export async function updateOrderStatus(id: string, status: Order["status"]): Promise<Order> {
  const before = await prisma.order.findUnique({ where: { id } });
  if (!before) throw new CommerceError("CART_NOT_FOUND", "Order not found.");
  const previous = toOrder(before);

  if (!canTransitionOrder(previous.status, status)) {
    throw new CommerceError(
      "INVALID_STATUS_TRANSITION",
      `An order can't go from ${previous.status} to ${status}.`
    );
  }
  if (previous.status === status) return previous;

  // Stock first, before the status is written: if the units are gone the order must stay
  // cancelled, and the customer must not be told otherwise.
  if (previous.status === "cancelled" && status === "confirmed") {
    await retakeStockForOrder(previous.id, previous.lineItems);
  }

  const row = await prisma.order.update({
    where: { id },
    // deliveredAt schedules the post-delivery review-request follow-up (services/email-followups.ts).
    // No status-history table exists, so re-marking an already-delivered order as
    // "delivered" again overwrites it — an accepted edge case, matches this function's
    // existing best-effort philosophy elsewhere.
    data: { status, ...(status === "delivered" ? { deliveredAt: new Date() } : {}) },
  });
  const order = toOrder(row);

  // Before the email, so a mail outage cannot leave the units off the shelf.
  if (STOCK_RETURNING_STATUSES.has(status)) {
    await restockOrderIfNeeded(order.id, order.lineItems);
  }

  // "confirmed" is covered by the order-confirmation email sent at checkout —
  // every other status is a real update worth notifying the customer about.
  // Best-effort: a failed email must never fail the status update itself.
  if (status !== "confirmed") {
    try {
      const settings = await getSiteSettings();
      // For "refunded", say how much and where it went — the payment record knows.
      const payment = status === "refunded" ? await getPrimaryPaymentForOrder(order.id) : null;
      const message = shippingUpdateEmail({
        siteName: settings.siteName,
        orderId: order.id,
        status,
        lineItems: order.lineItems,
        trackingNumber: order.trackingNumber,
        carrier: order.carrier,
        // No courier-specific tracking page to link to (manual carrier entry) — fall back to
        // the shop's own /track page whenever a tracking number exists but nothing more
        // specific was entered, so the customer still has one tap to the parcel's state.
        trackingUrl:
          order.trackingNumber && !order.trackingUrl
            ? `${getSiteUrl().replace(/\/$/, "")}/track/${order.trackingNumber}`
            : order.trackingUrl,
        orderUrl: await orderLink(order.id),
        refundedAmount: payment && payment.refundedAmount.amount > 0 ? payment.refundedAmount : undefined,
        paymentMethodName: payment ? paymentProviderRegistry.getMethod(payment.methodId)?.defaultDisplayName : undefined,
      });
      await getEmailProvider().send({
        to: order.customerEmail,
        template: "shipping-update",
        idempotencyKey: `order-status:${order.id}:${status}:${Date.now()}`,
        ...message,
      });
    } catch (emailError) {
      logger.error("Order status email failed", emailError, { orderId: order.id, status });
    }
  }

  return order;
}

export interface OrderTrackingInput {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  /** Parcels the voucher covers; only the courier adapter sets it. */
  pieces?: number;
}

/**
 * A corrected delivery address. Only the fields a person can get wrong are replaced; the
 * invoice block (ΑΦΜ, ΔΟΥ) belongs to the tax document and is left exactly as ordered.
 */
export async function updateOrderShippingAddress(id: string, address: Omit<Address, "countryCode" | "invoice">): Promise<Order> {
  const current = await prisma.order.findUnique({ where: { id }, select: { shippingAddress: true } });
  if (!current) throw new Error("Order not found.");
  const previous = current.shippingAddress as unknown as Address;
  const next: Address = { ...previous, ...address };
  const row = await prisma.order.update({ where: { id }, data: { shippingAddress: toJsonInput(next) } });
  return toOrder(row);
}

export async function updateOrderTracking(id: string, input: OrderTrackingInput): Promise<Order> {
  const row = await prisma.order.update({
    where: { id },
    data: {
      carrier: input.carrier || null,
      trackingNumber: input.trackingNumber || null,
      trackingUrl: input.trackingUrl || null,
      // A different (or no) voucher has not been printed or listed — the old state
      // belonged to the old number.
      voucherPrintedAt: null,
      pickupListNo: null,
      shipmentPieces: input.pieces ?? null,
    },
  });
  return toOrder(row);
}

/**
 * Orders holding a courier voucher that has not yet been closed into a pickup list —
 * the day's work for the courier page, oldest first so the sheet prints in order.
 */
export async function getOrdersAwaitingPickup(carrier: string): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where: { carrier, trackingNumber: { not: null }, pickupListNo: null },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toOrder);
}

export async function markVouchersPrinted(orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return;
  await prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { voucherPrintedAt: new Date() } });
}

/** Stamps the pickup list onto every order whose voucher the courier reports as being on it. */
export async function markVouchersListed(trackingNumbers: string[], pickupListNo: string): Promise<number> {
  if (trackingNumbers.length === 0) return 0;
  const { count } = await prisma.order.updateMany({
    where: { trackingNumber: { in: trackingNumbers }, pickupListNo: null },
    data: { pickupListNo },
  });
  return count;
}

/**
 * The day is closed and the driver has the parcels: every order whose voucher went onto
 * the pickup list is shipped, in the shop's own words — "when he comes and picks them up,
 * I change the orders to shipped". Done here so the shipping email, with the tracking
 * link, goes out for each one without a second round of clicks. Only orders still before
 * "shipped" move; one cancelled meanwhile stays cancelled.
 */
export async function markListedOrdersShipped(pickupListNo: string): Promise<string[]> {
  const rows = await prisma.order.findMany({
    where: { pickupListNo, status: { in: ["confirmed", "processing"] } },
    select: { id: true },
  });
  const shipped: string[] = [];
  for (const row of rows) {
    try {
      await updateOrderStatus(row.id, "shipped");
      shipped.push(row.id);
    } catch (error) {
      logger.error("Could not mark a listed order shipped", error, { orderId: row.id, pickupListNo });
    }
  }
  return shipped;
}

/** Every order placed under an email address, newest first — the customer detail page history. */
export async function getOrdersForEmail(email: string): Promise<Order[]> {
  const rows = await prisma.order.findMany({
    where: { customerEmail: { equals: email, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toOrder);
}
