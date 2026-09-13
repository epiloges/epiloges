-- A note the shop keeps to itself on an order — "customer called, deliver after 5",
-- "pair set aside in the back". Distinct from customerNote, which the SHOPPER wrote at
-- checkout and which is shown back to them. Nothing on the order page could hold this
-- before, so it lived in people's heads and on paper.
--
-- Additive and nullable: apply first, deploy second.

ALTER TABLE "orders" ADD COLUMN "internalNote" TEXT;
