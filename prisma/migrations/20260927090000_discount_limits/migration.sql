-- Discount limits: usage cap, minimum order, once per customer.
--
-- Until now every code was unlimited until it expired, so one that leaked could be used by
-- anyone, any number of times. All four columns are additive with safe defaults, so existing
-- codes keep behaving exactly as before until an admin sets a limit.

ALTER TABLE "discounts" ADD COLUMN "usageLimit" INTEGER;
ALTER TABLE "discounts" ADD COLUMN "timesUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discounts" ADD COLUMN "minimumSubtotal" DECIMAL(10,2);
ALTER TABLE "discounts" ADD COLUMN "oncePerCustomer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "cart_discounts" ADD COLUMN "minimumSubtotal" DECIMAL(10,2);

-- Seed the counter from the codes already snapshotted on orders, so a limit set tomorrow
-- counts the redemptions that already happened.
UPDATE "discounts" d
SET "timesUsed" = sub.uses
FROM (
  SELECT upper(e->>'code') AS code, count(*)::int AS uses
  FROM "orders" o, jsonb_array_elements(o."discounts") e
  WHERE o."discounts" IS NOT NULL AND jsonb_typeof(o."discounts") = 'array'
  GROUP BY 1
) sub
WHERE d."code" = sub.code;

-- Scrub one-time tokens from email bodies already in the log. New rows are redacted before
-- they are written (lib/email/pipeline.ts redactSecrets); the admin email log used to show
-- live password-reset links to every admin role.
UPDATE "email_log"
SET "html" = regexp_replace("html", '([?&](amp;)?token=)[^&"''[:space:]<>]+', '\1REDACTED', 'g'),
    "text" = regexp_replace("text", '([?&](amp;)?token=)[^&"''[:space:]<>]+', '\1REDACTED', 'g')
WHERE "html" LIKE '%token=%' OR "text" LIKE '%token=%';
