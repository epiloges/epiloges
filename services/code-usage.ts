import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/commerce/postgres/cart-totals";
import { appliedDiscountSchema, appliedGiftCardSchema } from "@/lib/validation/commerce";

export interface CodeUsage {
  /** Orders the code was applied to. */
  orders: number;
  /** Money the code took off those orders, in total. */
  amount: number;
}

export interface CodeUsageReport {
  discounts: Map<string, CodeUsage>;
  giftCards: Map<string, CodeUsage>;
  /** Orders placed before codes were snapshotted — they carry a discount amount but no code. */
  untracked: number;
}

/**
 * How often each discount and gift-card code has been redeemed, read from the codes
 * snapshotted on orders. Orders from before that snapshot existed have a NULL column and
 * are reported as `untracked` rather than silently counted as zero — the admin table says
 * "0 uses" next to a code that was in fact used, and the caveat is what makes that honest.
 *
 * Cancelled and refunded orders still count: the code WAS used, and a "1 use per customer"
 * decision should see it.
 */
export async function getCodeUsageReport(): Promise<CodeUsageReport> {
  const rows = await prisma.order.findMany({ select: { discounts: true, giftCards: true, totals: true } });

  const discounts = new Map<string, CodeUsage>();
  const giftCards = new Map<string, CodeUsage>();
  let untracked = 0;

  const bump = (map: Map<string, CodeUsage>, code: string, amount: number) => {
    const key = code.toUpperCase();
    const current = map.get(key) ?? { orders: 0, amount: 0 };
    map.set(key, { orders: current.orders + 1, amount: round2(current.amount + amount) });
  };

  for (const row of rows) {
    if (row.discounts === null) {
      const totals = row.totals as { discountTotal?: { amount?: number }; giftCardTotal?: { amount?: number } };
      if ((totals.discountTotal?.amount ?? 0) > 0 || (totals.giftCardTotal?.amount ?? 0) > 0) untracked += 1;
      continue;
    }
    for (const d of z.array(appliedDiscountSchema).parse(row.discounts)) bump(discounts, d.code, d.amount.amount);
    for (const g of z.array(appliedGiftCardSchema).parse(row.giftCards ?? [])) bump(giftCards, g.code, g.amountApplied.amount);
  }

  return { discounts, giftCards, untracked };
}
