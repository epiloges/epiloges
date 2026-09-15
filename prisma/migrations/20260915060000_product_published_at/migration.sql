-- When a product was PUT ON THE SHELF, as distinct from when its row was created. The two
-- were the same thing until a shoe from last winter came back into stock: it belongs in
-- "new arrivals" again, and its row's birthday cannot be moved without lying about the
-- record. This one can. Backfilled from createdAt so nothing changes order today.
ALTER TABLE "products" ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "products" SET "publishedAt" = "createdAt";
