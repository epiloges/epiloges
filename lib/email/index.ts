import "server-only";
import { createDevTransport } from "@/lib/email/providers/dev";
import { createResendTransport } from "@/lib/email/providers/resend";
import { createEmailPipeline } from "@/lib/email/pipeline";
import type { EmailProvider, EmailTransport } from "@/lib/email/types";

export * from "@/lib/email/types";
export * from "@/lib/email/templates";

/**
 * Same single-switch-statement pattern as `lib/commerce/index.ts`'s
 * `getCommerceProvider()` — everything else only ever imports from here.
 * `EMAIL_PROVIDER=resend` requires `RESEND_API_KEY` + `EMAIL_FROM` in `.env`
 * (see `.env.example`); falls back to `dev` (logs to `EmailLog`, sends nothing
 * real) if the key is missing, so an unconfigured environment never throws.
 *
 * The value is lower-cased and trimmed before matching, and an unrecognised one
 * warns. `EMAIL_PROVIDER=Resend` previously fell through to `default` and sent
 * every order confirmation nowhere, in total silence.
 *
 * Surrounding quotes are stripped too. On launch day the Vercel dashboard held
 * `EMAIL_PROVIDER` as the seven characters `"resend"` — copied from `.env.example`,
 * where the quotes are file syntax, into a form where they are part of the value —
 * and every welcome email of the afternoon went to the dev provider. Same treatment
 * for the sender fields, which Resend would have refused for the same reason.
 */
function env(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const quoted = raw.length >= 2 && (raw[0] === '"' || raw[0] === "'") && raw[raw.length - 1] === raw[0];
  const value = quoted ? raw.slice(1, -1).trim() : raw;
  return value || undefined;
}

function buildTransport(): EmailTransport {
  const configured = env("EMAIL_PROVIDER");
  const providerName = configured ? configured.toLowerCase() : "dev";
  switch (providerName) {
    case "resend": {
      const apiKey = env("RESEND_API_KEY");
      const from = env("EMAIL_FROM");
      if (!apiKey || !from) {
        console.warn("[email] EMAIL_PROVIDER=resend but RESEND_API_KEY/EMAIL_FROM are not set — falling back to dev provider.");
        return createDevTransport();
      }
      if (isSandboxSender(from)) {
        // Loud, every boot, because the failure it predicts is silent: Resend's
        // onboarding sender delivers only to the account owner's own inbox. Every
        // customer's order confirmation is refused with a 4xx and nothing else changes.
        console.warn(
          `[email] EMAIL_FROM is ${from} — Resend's test sender. It can only deliver to the account owner. Verify a domain at resend.com/domains and set EMAIL_FROM to an address on it before customers see this.`
        );
      }
      return createResendTransport({ apiKey, from, replyTo: env("EMAIL_REPLY_TO") ?? env("CONTACT_EMAIL") });
    }
    case "dev":
      return createDevTransport();
    default:
      if (configured) {
        console.warn(`[email] EMAIL_PROVIDER="${configured}" is not a known provider — falling back to dev provider. NO EMAIL WILL BE SENT.`);
      }
      return createDevTransport();
  }
}

/** Resend's shared onboarding address — usable for a first test, not for a shop. */
export function isSandboxSender(from: string): boolean {
  return /@resend\.dev\b/i.test(from);
}

let cachedTransport: EmailTransport | null = null;
let cachedProvider: EmailProvider | null = null;

function getTransport(): EmailTransport {
  if (!cachedTransport) cachedTransport = buildTransport();
  return cachedTransport;
}

export function getEmailProvider(): EmailProvider {
  if (!cachedProvider) cachedProvider = createEmailPipeline(getTransport());
  return cachedProvider;
}

export interface EmailHealth {
  provider: "resend" | "dev";
  from: string;
  /** True when nothing will reach a real customer: dev provider, or the Resend test sender. */
  customersWillNotReceiveMail: boolean;
  reason?: string;
}

/**
 * What the admin dashboard shows. The two silent-failure modes — no provider configured,
 * and the sandbox sender — both look like "everything is fine" from the storefront, which
 * goes on placing orders and logging emails that never arrive.
 */
export function getEmailHealth(): EmailHealth {
  const transport = getTransport();
  if (transport.name === "dev") {
    return {
      provider: "dev",
      from: transport.from,
      customersWillNotReceiveMail: true,
      reason: "EMAIL_PROVIDER is not \"resend\" (or the Resend key is missing): emails are logged here but nothing is sent.",
    };
  }
  if (isSandboxSender(transport.from)) {
    return {
      provider: "resend",
      from: transport.from,
      customersWillNotReceiveMail: true,
      reason: `EMAIL_FROM is ${transport.from}, Resend's test sender, which only delivers to the account owner's own inbox. Verify the shop's domain in Resend and set EMAIL_FROM to an address on it.`,
    };
  }
  return { provider: "resend", from: transport.from, customersWillNotReceiveMail: false };
}
