import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isMarketingTemplate, type EmailMessage, type EmailProvider, type EmailTransport, type SendOutcome } from "@/lib/email/types";
import { isUnsubscribed, unsubscribeUrl } from "@/lib/email/unsubscribe";

/**
 * What every email goes through, whichever transport is underneath:
 *
 *   1. marketing templates are dropped for addresses that opted out, and get an
 *      unsubscribe link + List-Unsubscribe header;
 *   2. a transient provider failure is retried with backoff;
 *   3. the outcome — sent, skipped, or finally failed with the provider's reason — is
 *      written to `EmailLog`, which the admin Emails page reads.
 *
 * (3) is the point. Before this, only successes were logged: a rejected send threw, the
 * caller wrote a console line, and the fact that a customer never received their order
 * confirmation existed nowhere anyone would look.
 */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 2000];
const UNSUBSCRIBE_MARKER = "<!-- unsubscribe -->";

/** Errors worth another attempt: rate limits, provider 5xx, network. A rejected sender or recipient is not. */
function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = (error as { code?: string } | null)?.code?.toLowerCase() ?? "";
  if (["rate_limit_exceeded", "internal_server_error", "application_error"].includes(code)) return true;
  return /rate limit|too many|timeout|timed out|econnreset|enotfound|fetch failed|network|503|502|500/.test(message);
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function logOutcome(
  message: EmailMessage,
  outcome: { status: "sent" | "failed" | "skipped"; error?: string; providerMessageId?: string; attempts: number }
): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        template: message.template,
        status: outcome.status,
        error: outcome.error ?? null,
        providerMessageId: outcome.providerMessageId ?? null,
        attempts: outcome.attempts,
      },
    });
  } catch (error) {
    // The log must never be the reason a send is reported as failed.
    logger.error("Could not write the email log row", error, { template: message.template });
  }
}

export function createEmailPipeline(transport: EmailTransport): EmailProvider {
  return {
    async send(input: EmailMessage): Promise<SendOutcome> {
      let message = input;

      if (isMarketingTemplate(message.template)) {
        if (await isUnsubscribed(message.to)) {
          await logOutcome(message, { status: "skipped", error: "Recipient has unsubscribed from marketing email", attempts: 0 });
          return { status: "skipped", reason: "unsubscribed" };
        }
        const url = await unsubscribeUrl(message.to);
        message = {
          ...message,
          html: withUnsubscribeFooter(message.html, url),
          text: `${message.text}\n\nΓια να μη λαμβάνετε τέτοια μηνύματα: ${url}`,
          headers: {
            ...message.headers,
            "List-Unsubscribe": `<${url}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
      } else {
        message = { ...message, html: message.html.replace(UNSUBSCRIBE_MARKER, "") };
      }

      let lastError: unknown;
      let attemptsMade = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        attemptsMade = attempt;
        try {
          const outcome = await transport.deliver(message);
          if (outcome.status === "skipped") {
            await logOutcome(message, { status: "skipped", error: outcome.reason, attempts: attempt });
            return outcome;
          }
          await logOutcome(message, { status: "sent", providerMessageId: outcome.providerMessageId, attempts: attempt });
          return outcome;
        } catch (error) {
          lastError = error;
          if (attempt < MAX_ATTEMPTS && isTransient(error)) {
            await wait(BACKOFF_MS[attempt - 1] ?? 2000);
            continue;
          }
          break;
        }
      }

      const reason = lastError instanceof Error ? lastError.message : String(lastError);
      await logOutcome(message, { status: "failed", error: reason, attempts: attemptsMade });
      logger.error("Email send failed", lastError, { template: message.template, to: message.to });
      throw lastError instanceof Error ? lastError : new Error(reason);
    },
  };
}

/** Inserts the opt-out line above the closing footer of a rendered template; appends it if the marker is absent. */
function withUnsubscribeFooter(html: string, url: string): string {
  const line = `<p style="margin:12px 0 0;color:#9A9A9A;font-size:11px;line-height:1.6;">Δεν θέλετε τέτοια μηνύματα; <a href="${url}" style="color:#9A9A9A;text-decoration:underline;">Διαγραφή από τη λίστα</a>.</p>`;
  return html.includes(UNSUBSCRIBE_MARKER) ? html.replace(UNSUBSCRIBE_MARKER, line) : html.replace(/<\/body>/i, `${line}</body>`);
}
