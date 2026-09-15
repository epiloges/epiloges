-- A shipment of several parcels has several labels; the order remembers how many so the
-- courier page can count labels rather than vouchers.
ALTER TABLE "orders" ADD COLUMN "shipmentPieces" INTEGER;
