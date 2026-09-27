import "server-only";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/commerce/postgres/cart-totals";

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
 *
 * Aggregated in SQL. It used to load every order ever placed into memory on each visit to
 * the discounts page, which grows without bound as the shop does.
 */
export async function getCodeUsageReport(): Promise<CodeUsageReport> {
  const [rows, untrackedRows] = await Promise.all([
    prisma.$queryRaw<{ kind: "discount" | "giftCard"; code: string; orders: number; amount: string | null }[]>`
      SELECT 'discount' AS kind, upper(e->>'code') AS code, count(*)::int AS orders,
             sum((e->'amount'->>'amount')::numeric)::text AS amount
      FROM "orders" o, jsonb_array_elements(o."discounts") e
      WHERE jsonb_typeof(o."discounts") = 'array'
      GROUP BY 2
      UNION ALL
      SELECT 'giftCard' AS kind, upper(e->>'code') AS code, count(*)::int AS orders,
             sum((e->'amountApplied'->>'amount')::numeric)::text AS amount
      FROM "orders" o, jsonb_array_elements(o."giftCards") e
      WHERE jsonb_typeof(o."giftCards") = 'array'
      GROUP BY 2`,
    prisma.$queryRaw<{ untracked: number }[]>`
      SELECT count(*)::int AS untracked FROM "orders"
      WHERE "discounts" IS NULL
        AND (coalesce(("totals"->'discountTotal'->>'amount')::numeric, 0) > 0
          OR coalesce(("totals"->'giftCardTotal'->>'amount')::numeric, 0) > 0)`,
  ]);

  const discounts = new Map<string, CodeUsage>();
  const giftCards = new Map<string, CodeUsage>();
  for (const row of rows) {
    (row.kind === "discount" ? discounts : giftCards).set(row.code, { orders: row.orders, amount: round2(Number(row.amount ?? 0)) });
  }
  return { discounts, giftCards, untracked: untrackedRows[0]?.untracked ?? 0 };
}
