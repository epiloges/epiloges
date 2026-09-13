import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPaymentById } from "@/services/payments";
import { canAccessOrder } from "@/lib/order-access-cookie";
import { getSiteUrl } from "@/lib/site-url";

/**
 * The bridge between "go to this URL" and a gateway that only accepts a POST.
 *
 * Piraeus epay — like every Greek bank gateway — has no link a shopper can be sent
 * to. Its payment page is entered by submitting a form, so a provider that needs
 * this returns `CustomerAction.redirectForm` and services/payments.ts points the
 * checkout at THIS page for that payment. The page renders the stored form and
 * submits it on load, with a button for a browser that has scripts off. Nothing in
 * the checkout knows the difference, which is the point: the one behavioural
 * branch it takes stays "redirect or not", never "which vendor".
 *
 * Provider-agnostic on purpose. It knows nothing about Piraeus: the form's action
 * and fields come from the payment's own metadata, put there by whichever provider
 * created it, and the only Piraeus-specific line in this flow lives in that
 * provider's file. A second bank would reuse this page unchanged.
 *
 * Two gates before anything is rendered:
 *   - the browser must hold the order-access grant (the same cookie the confirmation
 *     page trusts), so an unguessable payment id alone opens nothing; and
 *   - the payment must still be waiting on the shopper. A settled, failed or
 *     cancelled payment is never re-submitted to the bank.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const home = getSiteUrl().replace(/\/$/, "");

  const payment = await getPaymentById(paymentId);
  if (!payment || !(await canAccessOrder(payment.orderId))) {
    return NextResponse.redirect(`${home}/checkout/confirmation`, 303);
  }

  const form = readRedirectForm(payment.metadata.customerRedirectForm);
  if (payment.status !== "awaiting_customer_action" || !form) {
    return NextResponse.redirect(
      `${home}/checkout/confirmation?order=${encodeURIComponent(payment.orderId)}&verify=1`,
      303
    );
  }

  const html = renderBridgePage(form);
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never cached, never indexed: it carries a one-shot form for one payment.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // The whole reason this route is excluded from the site-wide policy in
      // next.config.ts: `form-action` has to name the gateway. Everything else is as
      // locked down as the rest of the site, and the auto-submit script is the only
      // inline script — hashed rather than 'unsafe-inline'.
      "Content-Security-Policy": [
        "default-src 'none'",
        `script-src '${SUBMIT_SCRIPT_HASH}'`,
        "style-src 'unsafe-inline'",
        `form-action ${new URL(form.action).origin}`,
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}

interface RedirectForm {
  action: string;
  fields: Record<string, string>;
}

/** Trusts nothing about the shape: metadata is JSON that has been through the database. */
function readRedirectForm(value: unknown): RedirectForm | null {
  if (!value || typeof value !== "object") return null;
  const { action, fields } = value as { action?: unknown; fields?: unknown };
  if (typeof action !== "string" || !/^https:\/\//.test(action)) return null;
  if (!fields || typeof fields !== "object") return null;
  const clean: Record<string, string> = {};
  for (const [key, item] of Object.entries(fields as Record<string, unknown>)) {
    if (typeof item === "string" && /^[A-Za-z0-9_]+$/.test(key)) clean[key] = item;
  }
  return { action, fields: clean };
}

const SUBMIT_SCRIPT = "document.getElementById('pay').submit();";
/** SHA-256 of SUBMIT_SCRIPT, for the CSP. Recomputed at module load so the two can't drift. */
const SUBMIT_SCRIPT_HASH = `sha256-${createHash("sha256").update(SUBMIT_SCRIPT, "utf8").digest("base64")}`;

function renderBridgePage(form: RedirectForm): string {
  const inputs = Object.entries(form.fields)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`)
    .join("\n      ");

  return `<!doctype html>
<html lang="el">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Μετάβαση στην ασφαλή σελίδα πληρωμής…</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; background: #fff; }
    main { text-align: center; padding: 2rem; }
    p { margin: 0 0 1rem; font-size: 0.95rem; color: #444; }
    button { font: inherit; padding: 0.75rem 1.5rem; border: 1px solid #111; background: #111; color: #fff; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.75rem; cursor: pointer; }
  </style>
</head>
<body>
  <main>
    <p>Μεταφέρεστε στο ασφαλές περιβάλλον πληρωμής της τράπεζας…</p>
    <form id="pay" method="post" action="${escapeHtml(form.action)}" accept-charset="UTF-8">
      ${inputs}
      <button type="submit">Συνέχεια στην πληρωμή</button>
    </form>
  </main>
  <script>${SUBMIT_SCRIPT}</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
