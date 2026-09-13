import "server-only";
import type { EmailMessage, EmailTransport } from "@/lib/email/types";

/**
 * Doesn't call any real email API. The pipeline still writes the full rendered message to
 * `EmailLog`, which the admin Emails page reads back — so an unconfigured environment shows
 * exactly what WOULD have gone out, and nothing pretends to have sent real mail.
 */
export function createDevTransport(): EmailTransport {
  return {
    name: "dev",
    from: process.env.EMAIL_FROM ?? "dev@localhost",
    async deliver(message: EmailMessage) {
      console.log(`[email:dev] ${message.template} -> ${message.to}: "${message.subject}"`);
      return { status: "sent" };
    },
  };
}
