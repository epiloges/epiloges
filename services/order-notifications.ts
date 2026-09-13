import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toOrder } from "@/lib/commerce/postgres/mappers";
import {
  adminNotificationEmail,
  getEmailProvider,
  orderConfirmationEmail,
  paymentFailedEmail,
  paymentReceivedEmail,
  refundIssuedEmail,
} from "@/lib/email";
import { signOrderLinkToken } from "@/lib/order-access";
import { getSiteUrl } from "@/lib/site-url";
import { paymentProviderRegistry } from "@/lib/payments/registry";
import { getSiteSettings } from "@/services/settings";
import { formatMoney, orderReference } from "@/lib/format";
import type { Order } from "@/lib/commerce/types";
import type { PaymentRecord } from "@/lib/payments/types";

/**
 * Every email an order sends its customer (and the shop) as it moves through payment,
 * in one place that knows nothing about how the order was created or how the payment
 * moved — so both services/checkout.ts and services/payments.ts can call it without
 * importing each other.
 */

/** An absolute link to the order that works from any device — see lib/order-access.ts. */
export async function orderLink(orderId: string): Promise<string> {
  const token = await signOrderLinkToken(orderId);
  return `${getSiteUrl().replace(/\/$/, "")}/checkout/confirmation?order=${orderId}&t=${encodeURIComponent(token)}`;
}

function methodName(payment: PaymentRecord | null): string | undefined {
  if (!payment) return undefined;
  return paymentProviderRegistry.getMethod(payment.methodId)?.defaultDisplayName ?? payment.methodId;
}

/**
 * Sends the order-confirmation email at most once per order, whichever code path
 * gets there first (checkout, the return-path verification, or a webhook). The
 * timestamp is set BEFORE sending and only from a null state, so two concurrent
 * senders can't both pass the check.
 */
export async function sendOrderConfirmationEmail(
  order: Order,
  paymentInstructions: { label: string; value: string }[] | null,
  payment?: PaymentRecord | null
): Promise<void> {
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, confirmationEmailSentAt: null },
    data: { confirmationEmailSentAt: new Date() },
  });
  if (claimed.count === 0) return;

  // Best-effort and awaited, not fire-and-forget: an un-awaited promise here could
  // be killed mid-flight the moment this function returns and the route handler's
  // response is sent (real risk on serverless runtimes). Wrapped in try/catch so a
  // failed send never fails an order that has already been committed.
  try {
    const settings = await getSiteSettings();
    const message = orderConfirmationEmail({
      siteName: settings.siteName,
      orderId: order.id,
      lineItems: order.lineItems,
      totals: order.totals,
      shippingAddress: order.shippingAddress,
      shippingRate: order.shippingRate,
      giftWrap: order.giftWrap,
      giftMessage: order.giftMessage,
      paymentInstructions,
      paymentMethodName: methodName(payment ?? null),
      orderUrl: await orderLink(order.id),
    });
    await getEmailProvider().send({
      to: order.customerEmail,
      template: "order-confirmation",
      idempotencyKey: `order-confirmation:${order.id}`,
      ...message,
    });
  } catch (emailError) {
    // Release the claim so a later attempt (a webhook, an admin resend) can retry
    // rather than the order being permanently marked as notified.
    await prisma.order.update({ where: { id: order.id }, data: { confirmationEmailSentAt: null } }).catch(() => {});
    // Deliberately NOT the customer's email address. The order id identifies the order
    // completely, and this record now leaves the process for a third-party error tracker —
    // shipping customer PII there would undo PRIV-001 on a different axis. instrumentation.ts
    // scrubs email-shaped strings as a backstop; not sending them is the actual fix.
    logger.error("Order confirmation email failed — claim released for retry", emailError, { orderId: order.id });
  }
}

/**
 * The shop's own copy of a new order. Sent once, when the order is genuinely a sale — at
 * placement for manual methods (COD, bank transfer), and when the payment settles for a
 * redirect method (a card attempt that never completes is not a sale). To the contact
 * address unless ADMIN_NOTIFY_EMAIL names another.
 */
export async function notifyAdminOfNewOrder(order: Order, payment: PaymentRecord | null): Promise<void> {
  try {
    const settings = await getSiteSettings();
    const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.CONTACT_EMAIL || settings.contactEmail;
    if (!to) return;
    const units = order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
    const address = order.shippingAddress;
    const message = adminNotificationEmail({
      siteName: settings.siteName,
      title: `Νέα παραγγελία #${orderReference(order.id)} — ${formatMoney(order.totals.total)}`,
      summary: `${units} τεμ. για ${address.firstName} ${address.lastName}, ${address.city}. ${methodName(payment) ?? "Χωρίς τρόπο πληρωμής"}${payment ? ` (${payment.status})` : ""}.`,
      rows: [
        { label: "Πελάτης", value: `${address.firstName} ${address.lastName}\n${order.customerEmail}${address.phone ? `\n${address.phone}` : ""}` },
        { label: "Παράδοση", value: `${order.shippingRate.label}\n${address.address1}, ${address.postalCode} ${address.city}` },
        { label: "Προϊόντα", value: order.lineItems.map((item) => `${item.name} · ${item.size} · ×${item.quantity}`).join("\n") },
        ...(order.customerNote ? [{ label: "Σημείωση", value: order.customerNote }] : []),
        ...(order.giftWrap ? [{ label: "Δώρο", value: order.giftMessage ? `Ναι — "${order.giftMessage}"` : "Ναι" }] : []),
      ],
      adminUrl: `${getSiteUrl().replace(/\/$/, "")}/admin/orders/${order.id}`,
    });
    await getEmailProvider().send({ to, template: "admin-notification", idempotencyKey: `admin-new-order:${order.id}`, ...message });
  } catch (error) {
    logger.error("Admin new-order notification failed", error, { orderId: order.id });
  }
}

/**
 * Called by services/payments.ts on every payment status change. Decides which email, if
 * any, that change means for the customer:
 *
 *   paid      → the order confirmation, if it has not gone out yet (redirect methods
 *               withhold it at checkout); otherwise "we received your payment" for a
 *               manual method that was confirmed by hand — a bank transfer landing is news,
 *               cash at the door is not.
 *   failed /
 *   expired   → "your payment did not complete", with a link to try again.
 *   cancelled → the same, but only when the customer is still waiting on a redirect —
 *               an admin cancelling a payment attempt is an internal act.
 *   refunded  → "we refunded X", with the amount. A FULL refund is announced by the
 *               order-level status change instead, so this covers partial ones.
 */
export async function notifyCustomerOfPaymentChange(
  payment: PaymentRecord,
  previousStatus: PaymentRecord["status"],
  context: { actorType?: string; refundAmount?: number } = {}
): Promise<void> {
  if (payment.status === previousStatus) return;
  const row = await prisma.order.findUnique({ where: { id: payment.orderId } });
  if (!row) return;
  const order = toOrder(row);
  const definition = paymentProviderRegistry.getMethod(payment.methodId);
  const name = definition?.defaultDisplayName ?? payment.methodId;

  try {
    const settings = await getSiteSettings();
    const provider = getEmailProvider();

    if (payment.status === "paid") {
      if (!row.confirmationEmailSentAt) {
        // A redirect method settling: this IS the confirmation the customer is waiting for.
        await sendOrderConfirmationEmail(order, null, payment);
        await notifyAdminOfNewOrder(order, payment);
        return;
      }
      // Bank transfer landed (confirmed by the admin). Cash on delivery is confirmed at
      // the door and needs no letter about it.
      if (definition?.requiresManualConfirmation && payment.methodId !== "cash-on-delivery") {
        const message = paymentReceivedEmail({
          siteName: settings.siteName,
          orderId: order.id,
          amount: payment.amount,
          paymentMethodName: name,
          orderUrl: await orderLink(order.id),
        });
        await provider.send({ to: order.customerEmail, template: "payment-received", idempotencyKey: `payment-received:${payment.id}`, ...message });
      }
      return;
    }

    if (payment.status === "failed" || payment.status === "expired" || (payment.status === "cancelled" && context.actorType !== "admin")) {
      // Only for money that was actually being attempted online — a COD or transfer
      // "attempt" cancelled by the shop is not a customer-facing event.
      if (!definition || definition.requiresManualConfirmation) return;
      const message = paymentFailedEmail({
        siteName: settings.siteName,
        orderId: order.id,
        amount: payment.amount,
        paymentMethodName: name,
        outcome: payment.status,
        retryUrl: await orderLink(order.id),
      });
      await provider.send({ to: order.customerEmail, template: "payment-failed", idempotencyKey: `payment-failed:${payment.id}:${payment.status}`, ...message });
      return;
    }

    if (payment.status === "partially_refunded" && context.refundAmount) {
      const message = refundIssuedEmail({
        siteName: settings.siteName,
        orderId: order.id,
        amount: { amount: context.refundAmount, currencyCode: payment.amount.currencyCode },
        paymentMethodName: name,
        partial: true,
        orderUrl: await orderLink(order.id),
      });
      await provider.send({ to: order.customerEmail, template: "refund-issued", ...message });
    }
  } catch (error) {
    logger.error("Payment status email failed", error, { orderId: order.id, paymentId: payment.id, status: payment.status });
  }
}
