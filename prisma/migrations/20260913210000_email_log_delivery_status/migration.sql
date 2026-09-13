-- The outbox used to record only successes: a send that Resend refused threw, the caller
-- logged it to the console and moved on, and nothing durable said the customer never got
-- their order confirmation. Every attempt is now a row — sent, failed (with the provider's
-- reason) or skipped — so the Emails page can show what did NOT go out and retry it.
--
-- Additive with defaults: existing rows are, by construction, successful sends.

ALTER TABLE "email_log" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE "email_log" ADD COLUMN "error" TEXT;
ALTER TABLE "email_log" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "email_log" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "email_log_status_idx" ON "email_log"("status");
