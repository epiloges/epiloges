import "server-only";
import { logger } from "@/lib/logger";
import { expirePayment, listOverdueBankTransfers } from "@/services/payments";
import { getOrderById, updateOrderStatus } from "@/services/orders";
import { BANK_TRANSFER_EXPIRY_DAYS } from "@/lib/payments/providers/bank-transfer";

/**
 * Cancels orders whose bank transfer never arrived, and puts their units back on the shelf.
 *
 * Stock is taken when the order is placed, before anyone has paid. This shop carries about one
 * pair per size, so an abandoned transfer used to hold that size off sale until someone
 * noticed and cancelled it by hand — and nothing surfaced that it was waiting.
 *
 * The payment is expired first, then the order cancelled through the ordinary status path, so
 * the restock and the customer's cancellation email behave exactly as an admin cancel would.
 * An order someone has already moved to shipped is left alone: that is a person's decision.
 */
export async function expireUnpaidBankTransfers(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - BANK_TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const overdue = await listOverdueBankTransfers(cutoff);

  let cancelled = 0;
  for (const payment of overdue) {
    try {
      const order = await getOrderById(payment.orderId);
      if (!order || (order.status !== "confirmed" && order.status !== "processing")) continue;
      await expirePayment(payment.id, `No transfer received within ${BANK_TRANSFER_EXPIRY_DAYS} days — order cancelled automatically.`);
      await updateOrderStatus(order.id, "cancelled");
      cancelled += 1;
    } catch (error) {
      // One bad row must not stop the rest; it will be retried on the next daily pass.
      logger.error("Could not expire an unpaid bank transfer", error, { paymentId: payment.id, orderId: payment.orderId });
    }
  }
  return cancelled;
}
