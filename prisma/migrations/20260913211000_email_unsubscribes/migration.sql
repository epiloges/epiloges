-- Addresses that asked not to receive marketing mail. Checked by the email pipeline before
-- any marketing template (abandoned cart, review request, back in stock, newsletter) goes
-- out; transactional mail (order confirmations, password resets) is unaffected. There was
-- no way to opt out at all before — no link in the mail and no place to record it.

CREATE TABLE "email_unsubscribes" (
  "email"     TEXT NOT NULL,
  "reason"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_unsubscribes_pkey" PRIMARY KEY ("email")
);
