-- Which discount and gift-card codes an order was placed with.
--
-- The amounts were always kept (Order.totals.discountTotal / giftCardTotal) but the codes
-- lived only on the cart, whose discount rows are deleted the moment the order is created.
-- The admin order page could therefore say "-8,90 €" and not which promotion earned it.
--
-- Additive and nullable, same as customerNote: apply first, deploy second. Orders from
-- before this migration stay NULL and are read as "no codes recorded", not as "no codes".

ALTER TABLE "orders" ADD COLUMN "discounts" JSONB;
ALTER TABLE "orders" ADD COLUMN "giftCards" JSONB;
