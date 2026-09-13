-- The two facts ACS's daily cycle turns on, kept per order: whether the voucher has been
-- printed (ACS refuses to close the day otherwise) and which pickup list it was closed into
-- (after which it is a real shipment). Lets the courier page batch-print three labels to an
-- A4 sheet and show what is still waiting, instead of one PDF per order.
--
-- Additive and nullable: apply first, deploy second.

ALTER TABLE "orders" ADD COLUMN "voucherPrintedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "pickupListNo" TEXT;
