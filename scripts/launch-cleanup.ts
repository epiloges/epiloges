import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * The clean slate before the doors open. Everything in the orders table is a test the
 * owner placed himself; none of it is a sale.
 *
 *   npx tsx scripts/launch-cleanup.ts            # dry run — prints what would change
 *   npx tsx scripts/launch-cleanup.ts --apply    # write
 *
 * In order:
 *   1. Stock that the test orders took is put back — every line of an order that was never
 *      restocked (cancelled orders already were) is credited to its size row.
 *   2. Every order goes, and with it (by cascade) its payments, their transactions and
 *      returns; the bank's webhook rows and the admin activity entries that pointed at them
 *      are removed too, so nothing in the admin refers to an order that no longer exists.
 *   3. The two failed email_log rows from before the domain was verified go — they were the
 *      only red on the dashboard.
 *   4. Every product with no stock in any size is ARCHIVED, not deleted — the catalogue's
 *      own rule (see scripts/archive-out-of-stock.ts): archiving hides it from the shop and
 *      a restock is one flip in the admin; deleting destroys a product that may not be
 *      re-importable. `archivedAt` is stamped like the admin does it.
 */
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes("--apply");

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "").host;
  console.log(`\n  ${apply ? "APPLYING" : "Dry run"} against ${host}\n`);

  // 1. Stock credits
  const credits = await prisma.$queryRaw<{ productId: string; size: string; qty: number; name: string | null }[]>`
    SELECT c."productId", c.size, c.qty, p.name
    FROM (
      SELECT li->>'productId' AS "productId", li->>'size' AS size, SUM((li->>'quantity')::int)::int AS qty
      FROM orders o, jsonb_array_elements(o."lineItems") li
      WHERE o."restockedAt" IS NULL
      GROUP BY 1, 2
    ) c LEFT JOIN products p ON p.id = c."productId"`;
  console.log(`  1. Stock to credit back (${credits.length} size rows):`);
  for (const c of credits) console.log(`     +${c.qty}  ${c.name ?? c.productId} · ${c.size}${c.name ? "" : "  (product no longer exists — skipped)"}`);

  // 2. Orders
  const orders = await prisma.order.findMany({ select: { id: true, status: true, customerEmail: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const paymentIds = (await prisma.payment.findMany({ select: { id: true } })).map((p) => p.id);
  const webhookRows = await prisma.paymentWebhookEvent.count({ where: { paymentId: { in: paymentIds } } });
  const auditRows = await prisma.adminAuditLog.count({
    where: {
      OR: [
        { targetType: "order", targetId: { in: orders.map((o) => o.id) } },
        { targetType: "payment", targetId: { in: paymentIds } },
      ],
    },
  });
  console.log(`\n  2. Orders to delete: ${orders.length} (payments ${paymentIds.length}, webhook rows ${webhookRows}, activity entries ${auditRows})`);
  for (const o of orders) console.log(`     ${o.createdAt.toISOString().slice(0, 10)}  ${o.status.padEnd(9)}  ${o.customerEmail}`);

  // 3. Failed emails
  const failedMails = await prisma.emailLog.findMany({ where: { status: "failed" }, select: { id: true, template: true, error: true } });
  console.log(`\n  3. Failed email log rows to delete: ${failedMails.length}`);
  for (const m of failedMails) console.log(`     ${m.template}: ${m.error?.slice(0, 70)}`);

  // 4. Out-of-stock products
  const outOfStock = await prisma.product.findMany({
    where: { status: { not: "archived" }, sizes: { none: { quantity: { gt: 0 } } } },
    select: { id: true, name: true, sku: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n  4. Products with no stock in any size, to archive: ${outOfStock.length}`);
  for (const p of outOfStock) console.log(`     ${p.sku.padEnd(24)} ${p.name}`);

  if (!apply) {
    console.log("\n  Nothing written. Re-run with --apply to do it.\n");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const c of credits) {
      if (!c.name) continue;
      await tx.productSize.updateMany({
        where: { productId: c.productId, name: c.size },
        data: { quantity: { increment: c.qty }, inStock: true },
      });
    }
    await tx.paymentWebhookEvent.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await tx.adminAuditLog.deleteMany({
      where: {
        OR: [
          { targetType: "order", targetId: { in: orders.map((o) => o.id) } },
          { targetType: "payment", targetId: { in: paymentIds } },
        ],
      },
    });
    await tx.order.deleteMany({});
    await tx.emailLog.deleteMany({ where: { status: "failed" } });
    await tx.product.updateMany({
      where: { id: { in: outOfStock.map((p) => p.id) } },
      data: { status: "archived", archivedAt: new Date(), availableForSale: false },
    });
  });

  console.log("\n  Done.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
