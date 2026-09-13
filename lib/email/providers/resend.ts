import "server-only";
import { Resend } from "resend";
import { isUndeliverableAddress } from "@/lib/email/deliverability";
import { logger } from "@/lib/logger";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Real sending via Resend. This is only the wire: logging to `EmailLog`, retries and the
 * marketing suppression list live in lib/email/pipeline.ts, which wraps every transport
 * the same way so the admin Emails page is the audit trail regardless of provider.
 *
 * A send failure THROWS, with the provider's own reason in the message. The pipeline
 * retries what looks transient and records the final failure as a row; callers keep
 * their try/catch so an outage degrades to "no email sent" rather than failing the order.
 */
export function createResendTransport(input: { apiKey: string; from: string; replyTo?: string }): EmailTransport {
  const resend = new Resend(input.apiKey);
  return {
    name: "resend",
    from: input.from,
    async deliver(message: EmailMessage) {
      /**
       * Reserved addresses are dropped here, at the only place that can actually put a
       * message on the wire, rather than in each job that might produce one. There is more
       * than one path to a test address — the e2e suite's checkout, a seeded customer, a
       * typo — and a guard per path is a guard that gets forgotten on the next path.
       *
       * Skipped rather than thrown, which is the deliberate half: `runAbandonedCartRecovery`
       * would count a throw as failed and not set `abandonedCartEmailSentAt`, so the same
       * cart would be retried every day forever. Skipping lets the caller mark it handled.
       */
      if (isUndeliverableAddress(message.to)) {
        logger.warn("Skipped email to a reserved, undeliverable address", { to: message.to, template: message.template });
        return { status: "skipped", reason: "reserved address" };
      }

      const { data, error } = await resend.emails.send(
        {
          from: input.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          // Replies go to a person, not to the sending address — before this, a customer
          // hitting Reply on their confirmation wrote to an unmonitored mailbox.
          replyTo: message.replyTo ?? input.replyTo,
          headers: message.headers,
          tags: [{ name: "template", value: message.template }],
        },
        message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
      );
      if (error) {
        const failure = new Error(`Resend: ${error.message}`) as Error & { code?: string };
        failure.code = error.name;
        throw failure;
      }
      return { status: "sent", providerMessageId: data?.id };
    },
  };
}
