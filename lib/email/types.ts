/**
 * Every template the shop sends, by the name logged on the EmailLog row.
 *
 * Kept as a union rather than a bare string so a new template has to be declared here —
 * which is also where its CATEGORY is decided (see `isMarketingTemplate`): whether the
 * message needs an unsubscribe link and must honour the recipient's marketing preference.
 */
export type EmailTemplate =
  // Account
  | "welcome"
  | "password-reset"
  | "account-already-exists"
  // Orders and payments
  | "order-confirmation"
  | "payment-received"
  | "payment-failed"
  | "refund-issued"
  | "shipping-update"
  // Returns
  | "return-requested"
  | "return-status-update"
  // Forms
  | "contact-message"
  | "contact-acknowledgement"
  | "concierge-request"
  | "concierge-acknowledgement"
  // Marketing (unsubscribable)
  | "newsletter-welcome"
  | "abandoned-cart"
  | "review-request"
  | "back-in-stock"
  | "referral-reward"
  // Internal
  | "admin-notification";

/**
 * Templates a person can opt out of. Everything else is transactional — a receipt for
 * something they did, or a security notice — and goes regardless of preference.
 *
 * `back-in-stock` and `referral-reward` are things the person explicitly asked for, but
 * they are still promotional in character, so they carry the unsubscribe link and respect
 * a global opt-out; an unsubscribed address simply never gets them.
 */
const MARKETING_TEMPLATES: ReadonlySet<EmailTemplate> = new Set<EmailTemplate>([
  "newsletter-welcome",
  "abandoned-cart",
  "review-request",
  "back-in-stock",
  "referral-reward",
]);

export function isMarketingTemplate(template: EmailTemplate): boolean {
  return MARKETING_TEMPLATES.has(template);
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: EmailTemplate;
  /** Override the account-wide reply-to (defaults to the shop's contact address). */
  replyTo?: string;
  /**
   * A stable key for this logical send, so a retried request can never produce two copies
   * of one email — e.g. `order-confirmation:<orderId>`. Passed to the provider where it
   * supports idempotency (Resend does).
   */
  idempotencyKey?: string;
  /** Extra headers, e.g. List-Unsubscribe on marketing mail. Set by the pipeline, not callers. */
  headers?: Record<string, string>;
}

export interface SendOutcome {
  status: "sent" | "skipped";
  providerMessageId?: string;
  /** Why a skipped message was skipped — a reserved address, an unsubscribed recipient. */
  reason?: string;
}

/** What a transport actually does with a fully prepared message. Logging and retries live above it. */
export interface EmailTransport {
  name: "resend" | "dev";
  /** The From header, for the health check. */
  from: string;
  deliver(message: EmailMessage): Promise<SendOutcome>;
}

/** What the rest of the app talks to. `send` never throws for a skipped message; it throws only once every retry has failed. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<SendOutcome>;
}
