import { NextResponse, type NextRequest } from "next/server";
import { getPaymentById, handleProviderWebhook, type WebhookProcessingResult } from "@/services/payments";
import { paymentProviderRegistry } from "@/lib/payments/registry";
import { getSiteUrl } from "@/lib/site-url";
import { logger } from "@/lib/logger";

/**
 * One endpoint, every provider (§14): `/api/payments/webhooks/:provider`.
 *
 * This handler deliberately contains no provider-specific logic at all — it reads
 * the raw body, hands it to the payment service, and translates the outcome into a
 * response. Every signature scheme, event vocabulary and payload shape lives in
 * the provider that owns it, so connecting a new bank adds zero lines here.
 *
 * `request.text()` rather than `request.json()` is load-bearing: signature
 * verification must run against the exact bytes the provider signed, and any
 * parse-then-restringify round trip can reorder keys or change escaping enough to
 * invalidate a perfectly good signature.
 *
 * The one thing that differs per provider is WHO is on the other end of the
 * connection. A server-to-server webhook (Stripe-style) gets JSON and a status
 * code. A provider that declares `webhookDelivery: "browser"` — Piraeus epay, whose
 * result arrives as a form POST made by the shopper's own browser at the end of
 * the redirect — gets the shopper sent on to their confirmation page instead,
 * whatever the outcome. The pipeline behind both is identical.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const deliveredByBrowser = paymentProviderRegistry.get(provider)?.webhookDelivery === "browser";

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    if (deliveredByBrowser) return redirectShopper(null);
    return NextResponse.json({ error: "Could not read the request body." }, { status: 400 });
  }

  let result: WebhookProcessingResult;
  try {
    result = await handleProviderWebhook(provider, rawBody, request.headers);
  } catch (error) {
    // A genuine server fault (database down, unexpected bug) SHOULD be retried by
    // the provider, so this is the only path that returns a 5xx.
    logger.error("Webhook processing failed", error, { provider });
    if (deliveredByBrowser) return redirectShopper(null);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  if (deliveredByBrowser) {
    // The shopper is standing here. Nothing about the outcome is decided by this
    // redirect — the confirmation page shows whatever the verified pipeline recorded
    // and re-checks with the provider — so a rejected or duplicate delivery simply
    // lands them on their order, where the truth is.
    const payment = result.paymentId ? await getPaymentById(result.paymentId) : null;
    return redirectShopper(payment ? { orderId: payment.orderId, paid: payment.status === "paid" } : null);
  }

  // Everything the pipeline handled — including duplicates and events we don't
  // act on — is acknowledged with a 200. Returning an error for those would make
  // the provider retry indefinitely and eventually disable the endpoint, which
  // would then also stop delivering the events we DO care about.
  if (result.status === "unverified") {
    // The one case that must not be acknowledged: an unverifiable signature is
    // either an attack or a real misconfiguration, and both deserve a hard 400.
    // The payload is already stored for inspection.
    return NextResponse.json({ received: true, applied: false, reason: result.message }, { status: 400 });
  }
  return NextResponse.json({ received: true, status: result.status, message: result.message });
}

/**
 * 303 so the browser follows with a GET — a 307 would replay the bank's POST at
 * the confirmation page. The `verify` / `cancelled` hints mean the same here as
 * they do for every other redirect provider: a nudge to re-check, never evidence.
 */
function redirectShopper(target: { orderId: string; paid: boolean } | null): NextResponse {
  const base = getSiteUrl().replace(/\/$/, "");
  if (!target) return NextResponse.redirect(`${base}/checkout/confirmation`, 303);
  const hint = target.paid ? "verify=1" : "cancelled=1";
  return NextResponse.redirect(`${base}/checkout/confirmation?order=${encodeURIComponent(target.orderId)}&${hint}`, 303);
}

/**
 * A GET is almost always someone checking the endpoint exists — answer plainly
 * rather than 405ing. For a browser-delivered provider it can also be the shopper
 * arriving by plain navigation (Piraeus appends the provider's `ParamBackLink` as
 * a query string when the shopper presses Cancel on the bank's page), and a person
 * must never be shown JSON: send them back to their order. Nothing is applied — the
 * `order` parameter only says where to go, and the confirmation page still requires
 * the order-access grant before it shows anything.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (paymentProviderRegistry.get(provider)?.webhookDelivery === "browser") {
    const orderId = request.nextUrl.searchParams.get("order");
    return redirectShopper(orderId && /^[A-Za-z0-9_-]{1,64}$/.test(orderId) ? { orderId, paid: false } : null);
  }
  return NextResponse.json({ endpoint: `payments webhook for "${provider}"`, method: "POST" });
}
