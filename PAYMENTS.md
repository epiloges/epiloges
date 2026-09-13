# Payments — developer guide

How payments work in this project, and how to add a provider without touching
checkout, orders, the database or the admin dashboard.

---

## 1. The shape of it

```
Checkout UI  ──►  GET /api/payment-methods        ──►  services/payments.ts
   │                                                        │
   │                                                        ├─► lib/payments/config.ts      (credentials, settings)
   │                                                        ├─► lib/payments/availability.ts (may we offer this?)
   │                                                        └─► lib/payments/fees.ts        (what does it cost?)
   │
   └──►  POST /api/checkout/:id/complete  ──►  services/checkout.ts
                                                    │
                                                    └─► services/payments.ts  initiatePayment()
                                                              │
                                                              └─► lib/payments/registry.ts
                                                                        │
                                          ┌───────────────┬─────────────┼─────────────────┐
                                   CashOnDelivery   BankTransfer   Piraeus (epay)      Iris
```

The checkout never imports a provider. It knows four things and nothing else:

| Concept | Where it lives |
|---|---|
| `PaymentMethod` (what a shopper picks) | `AvailablePaymentMethod` in `services/payments.ts` |
| `PaymentIntent` (starting a payment) | `initiatePayment()` → `CustomerAction` |
| `PaymentStatus` | `lib/payments/types.ts` + `lib/payments/status.ts` |
| `PaymentResult` | `lib/payments/types.ts` |

The **one** branch the storefront takes on payment behaviour is
`customerAction.type === "redirect"`. That is about the *action*, not the vendor —
Piraeus, IRIS and a provider nobody has written yet all travel the same path. A
provider whose page can only be entered by a browser POST (every Greek bank gateway)
returns `redirectForm` instead of `redirectUrl`; the service points the checkout at
`/api/payments/redirect/:paymentId`, a bridge page that submits that form, and the
checkout still sees nothing but a URL.

### File map

| Path | What it is |
|---|---|
| `lib/payments/types.ts` | The whole vocabulary. Provider contract, statuses, config field schema. |
| `lib/payments/status.ts` | The state machine. Every status change funnels through `assertTransition`. |
| `lib/payments/registry.ts` | Provider registration. Adding a provider = one line here. |
| `lib/payments/config.ts` | Credential + settings storage, env-var precedence, masked admin projection. |
| `lib/payments/crypto.ts` | AES-256-GCM secret storage, constant-time signature comparison. |
| `lib/payments/availability.ts` | Pure: may this method be offered for this order? |
| `lib/payments/fees.ts` | Pure: what does this method add to the total? |
| `lib/payments/idempotency.ts` | Pure: the key that stops double-charging. |
| `lib/payments/providers/*` | One file per provider. |
| `services/payments.ts` | The only seam the rest of the app uses. |
| `app/api/payments/webhooks/[provider]/route.ts` | One endpoint, every provider, zero provider-specific code. Answers a server with JSON and a browser (`webhookDelivery: "browser"`) with a redirect to the order. |
| `app/api/payments/redirect/[paymentId]/route.ts` | The bridge page for gateways that must be entered by a browser POST. Provider-agnostic. |
| `app/admin/(dashboard)/settings/payments/*` | Control panel, rendered from the registry. |
| `app/admin/(dashboard)/payments/*` | Transaction list, detail, timeline, refunds. |

---

## 2. Data model

Payments are their **own** tables, not columns on `Order`. An order's lifecycle and
its money's lifecycle are separate facts — a Cash-on-Delivery order ships while its
payment is still pending, and a delivered order can later be refunded without the
shipment un-happening.

| Table | Purpose |
|---|---|
| `payments` | One attempt to collect the money for an order. |
| `payment_transactions` | Append-only audit trail. Never updated, never deleted. |
| `payment_webhook_events` | Raw inbound webhooks, unique on `(provider, eventId)`. |
| `payment_provider_configs` | Credentials + environment, secrets encrypted. |
| `payment_method_settings` | Admin-editable fee, limits, countries, sort order. |

**Capabilities are not in the database.** `supportsRefunds`, `requiresWebhook`,
`requiresRedirect` and friends live in code beside the provider that implements
them, where an admin cannot toggle them into being true.

---

## 3. Status transitions

```
                    ┌──────────────────────────┐
                    ▼                          │
pending ──► awaiting_customer_action ──► processing ──► paid ──► partially_refunded ──► refunded
   │                    │                     │           │
   ├──► awaiting_bank_transfer ───────────────┼───────────┘
   │                    │                     │
   └────────────────────┴─────────────────────┴──► failed ──► pending (retry)
                                                    │
                        cancelled ◄─────────────────┘
                        expired
```

Rules the machine enforces (`lib/payments/status.ts`, tested in `status.test.ts`):

- **Nothing un-settles money.** `paid` can only become a refund state.
- **`cancelled` / `refunded` / `expired` are terminal.** A stale QR code or redirect
  can never revive an abandoned payment.
- **There is no `awaiting_bank_transfer → processing` edge.** A transfer is unpaid
  until a human (or a future reconciliation API) confirms it. Nothing automatic
  settles it.
- **Re-asserting the current status is a no-op, not an error.** Duplicate webhooks
  and status polls are ordinary traffic.

Order status and payment status are kept separate and always shown separately in the
admin.

---

## 4. Adding a provider

Worked example: **Viva Wallet**. Nothing outside these two files changes.

### Step 1 — write the provider

`lib/payments/providers/viva-wallet.ts`

```ts
import "server-only";
import type { PaymentProvider, PaymentMethodDefinition, PaymentConfigField } from "@/lib/payments/types";
import { PaymentError } from "@/lib/payments/types";

const CONFIG_FIELDS: readonly PaymentConfigField[] = [
  { key: "merchantId",  label: "Merchant ID",  type: "text",   secret: false, required: true },
  { key: "apiKey",      label: "API key",      type: "secret", secret: true,  required: true },
  { key: "webhookSecret", label: "Webhook secret", type: "secret", secret: true, required: false },
];

const VIVA_CARD: PaymentMethodDefinition = {
  id: "viva-card",
  providerId: "viva-wallet",
  name: "Cards (Viva Wallet)",
  defaultDisplayName: "Credit / Debit Card",
  defaultDescription: "Card payments processed by Viva Wallet.",
  type: "card",
  defaultEnabled: false,          // needs credentials, so never on by default
  requiresRedirect: true,
  requiresManualConfirmation: false,
  requiresWebhook: true,
  supportsRefunds: true,
  supportsPartialRefunds: true,
  supportsCapture: true,
  supportsRecurring: false,
  supportedCurrencies: ["EUR"],
  icon: "card",
};

export const vivaWalletProvider: PaymentProvider = {
  id: "viva-wallet",
  name: "Viva Wallet",
  description: "Card acquiring through Viva Wallet.",
  methods: [VIVA_CARD],
  configFields: CONFIG_FIELDS,
  supportsEnvironments: true,
  supportsConnectionTest: true,
  webhookSupported: true,

  isConfigured: (config) => Boolean(config.values.merchantId && config.secrets.apiKey),

  async validateConfiguration(config) {
    if (!this.isConfigured(config)) {
      return { status: "not_configured", message: "Merchant ID and API key are required.", checkedLive: false };
    }
    // Make a REAL authenticated request here. Never return `connected` without one.
    return { status: "connected", message: "Connected.", checkedLive: true };
  },

  async initializePayment(ctx) {
    // ctx.payment.amount is server-computed. Never accept an amount from a caller.
    return {
      status: "awaiting_customer_action",
      externalPaymentId: "…provider order id…",
      customerAction: { type: "redirect", redirectUrl: "…provider checkout url…" },
    };
  },

  async confirmPayment(ctx)  { /* server-side lookup, return the provider's truth */ },
  async cancelPayment(ctx)   { /* … */ },
  async refundPayment(ctx)   { /* ctx.amount is validated by the service first */ },
  async getPaymentStatus(ctx){ /* … */ },

  async parseWebhook(request, config) {
    // Verify against request.rawBody EXACTLY as received. Throw
    // PaymentWebhookVerificationError on a bad signature.
    return { eventId: "…", eventType: "…", paymentId: null, externalPaymentId: "…", status: "paid" };
  },
};
```

### Step 2 — register it

`lib/payments/registry.ts`

```ts
import { vivaWalletProvider } from "@/lib/payments/providers/viva-wallet";
paymentProviderRegistry.register(vivaWalletProvider);
```

### That's the whole change

You now automatically have:

- a settings page at `/admin/settings/payments/viva-wallet`, rendered from
  `configFields` — no React written;
- encrypted credential storage, masking, and env-var override
  (`VIVA_WALLET_API_KEY`, `VIVA_WALLET_ENABLED`, `VIVA_WALLET_ENVIRONMENT`);
- a working **Test Connection** button;
- a webhook endpoint at `/api/payments/webhooks/viva-wallet` with signature
  verification, deduplication, raw-payload storage and retry-safe handling;
- the method on the checkout the moment it is enabled and configured;
- fee, order-value limits, country and delivery-method restrictions;
- rows in `/admin/payments`, a timeline, and refund actions.

**Zero changes** to: the checkout UI, `services/checkout.ts`, the `Order` model, the
database schema, or the webhook route.

---

## 5. Adding a payment method to an existing provider

Add another entry to that provider's `methods` array. Method ids must be globally
unique — the registry throws at boot if two providers claim the same one. A row
appears in the admin method table with default settings; no migration is needed,
because `getAllMethodSettings()` fills in defaults for methods that have no row yet.

## 6. Adding a configuration field

Add a `PaymentConfigField` to the provider's `configFields`. The admin form renders
it. Set `secret: true` for anything that must be encrypted, masked and never
returned to the browser — that is enforced centrally in `lib/payments/config.ts`, not
by each provider remembering to do it.

Scope a field to one environment with `environment: "sandbox" | "production"` when
a provider issues separate test and live key pairs. Piraeus does not — the bank runs
test and live merchants on the same endpoints — so its fields are unscoped and the
environment switch only labels the payments.

## 7. Adding a webhook

Implement `parseWebhook` and set `webhookSupported: true`. The shared route already
exists. Your parser receives the **raw body string** — verify the signature against
those exact bytes, and never `JSON.parse` then re-stringify before verifying.

Return `{ ignored: true }` for events you don't act on. Do **not** throw: the
pipeline acknowledges ignored events with a 200 so the provider doesn't retry
forever and eventually disable the endpoint. Throw
`PaymentWebhookVerificationError` **only** for a genuine signature failure — that is
the one case that returns a 400.

## 8. Testing a provider

`Test Connection` calls `validateConfiguration`. The `ConfigurationTestResult` type
forces the honest answer:

```ts
{ status: "connected" | "auth_failed" | "not_configured" | "unavailable" | "not_implemented",
  message: string,
  checkedLive: boolean }   // ← false means NO request was made
```

The admin renders `checkedLive` verbatim ("Verified with a live request" vs
"reflects the stored configuration only"), so a green state that made no network
call can never be mistaken for a verified integration.

## 9. Refunds

`services/payments.ts`'s `refundPayment()` validates before calling the provider:
the method must declare `supportsRefunds`; a partial refund additionally requires
`supportsPartialRefunds`; and the amount is checked against
`amount − refundedAmount`. The running total lives on the payment row, so a second
partial refund can't exceed what's left.

For manual methods (COD, bank transfer) the provider records the refund rather than
calling an API — the admin performs the actual repayment. Recording it anyway is the
point: otherwise refunded COD orders exist only in someone's memory.

## 10. Idempotency

`derivePaymentIdempotencyKey(orderId, methodId, attempt)` is deterministic and
unique-constrained in the database. A double-click, a refresh, a dropped connection
or a return from a provider all derive the same key and recover the existing payment
— including its redirect URL, so a shopper resumes rather than restarts. Switching
method after a decline derives a different key, which is correct.

Webhooks are deduplicated separately, on a `(provider, eventId)` database unique
constraint — not an in-memory set, because serverless instances don't share memory.
Providers that don't issue an event id get a SHA-256 of the payload, which achieves
the same at-most-once effect for identical bodies.

Outbound writes to providers that support an idempotency header carry one derived
from the same value. Piraeus has no such header; its equivalent is the
MerchantReference (our payment id), which the bank refuses to charge twice
(ResponseCode 11).

## 11. Security

- **Amounts are always computed server-side**, from the stored cart and checkout.
  No code path lets a browser-supplied number reach a provider.
- **Fees are computed server-side.** The quote shown at checkout and the amount
  charged come from the same function (`computePaymentFee`).
- **A method's availability is validated twice** — once to build the list, once at
  order time, both through `evaluateMethodAvailability`.
- **No card data ever touches this application.** There is no card form and no
  `cardSchema`; that was removed deliberately when this landed. Card entry happens
  on the processor's own page. No PAN, no CVV, no card storage.
- **A browser redirect is never proof of payment.** The confirmation page re-verifies
  server-side against the provider before showing a paid state.
- **Nothing client-side can set a payment status.** Every transition goes through
  `assertTransition` inside `services/payments.ts`, which has no HTTP surface a
  shopper can reach.
- **Secrets are AES-256-GCM encrypted at rest**, keyed from `PAYMENTS_CONFIG_SECRET`.
  A missing key is a hard error, never a silent fallback to plaintext.
- **Webhook signatures are compared in constant time** (`safeCompare`) with a
  timestamp tolerance, so a captured signature can't be replayed forever.
- **Admin actions are capability-gated**: `payments:view`, `payments:manage`,
  `payments:refund`, `payments:configure`. An editor can see whether an order is
  paid; they cannot confirm, refund, or read credentials.
- **Payment endpoints are rate-limited** through the existing `lib/rate-limit.ts`.
- **Secrets never reach logs.** `PaymentError` carries a separate `publicMessage`;
  the developer-facing text is logged server-side and never returned to a shopper.

## 12. Piraeus Bank — epay eCommerce (Redirection)

The card rail. Acquiring is the shop's Euronet Merchant Services contract; the
gateway is the bank's **epay eCommerce** platform (historically "ePOS Paycenter"),
used through its **Redirection** integration — the only tier that keeps card data
off this application. Implemented in `lib/payments/providers/piraeus.ts` from the
bank's Redirection manual as reproduced in the public reference implementations;
the HMAC test vector in `piraeus.test.ts` is the bank's own.

The flow, and where each step lives:

1. **Ticket** — `initializePayment` calls the bank's SOAP ticket service with the
   five credentials, the server-computed amount and our payment id as
   `MerchantReference`, and receives a one-time `TranTicket`. The ticket binds the
   amount. It is stored on the payment **encrypted** (`piraeusTicketEncrypted`),
   because it is the key that verifies the result.
2. **Redirect** — the provider returns a `redirectForm` for the bank's `pay.aspx`;
   the bridge page POSTs it from the shopper's browser. Every field in that form is
   one the bank's specification has the browser send in the clear.
3. **Result** — the bank POSTs the outcome to `/api/payments/webhooks/piraeus`
   **through the shopper's browser** (register that URL as both success and failure
   URL on the merchant account). `parseWebhook` looks up the payment named by
   `MerchantReference`, decrypts its ticket, recomputes `HashKey` (HMAC-SHA256 over
   the documented field list, keyed with the ticket) and compares in constant time.
   A match is proof the bank produced this result for this payment. The route then
   303s the shopper to their confirmation page.

Three consequences of the bank's design, all deliberate here:

- **Only successes are signed.** A decline or error arrives with an empty
  `HashKey`, so it is stored against the payment and shown to the admin but **never
  applied** — an unsigned message must not be able to mark a payment `failed` and
  thereby block a later genuine success. The shopper sees "you came back without
  completing payment" and the payment stays `awaiting_customer_action` until an
  admin cancels it.
- **There is no status-query API in this tier.** `confirmPayment` returns the stored
  status — which only a verified result can have set — rather than asking anyone.
- **There is no refund API in this tier.** `refundPayment` records the refund; the
  admin executes it in the epay ePOS merchant portal. Same pattern as Cash on
  Delivery, for the same reason.

**Before it takes a real card:** the bank's test merchant account has to be
exercised end to end (ticket → bank page with a test card → result verified → order
paid), the result URL registered on the merchant account, and one live transaction
reconciled against the ePOS portal before `PIRAEUS_ENVIRONMENT` is flipped to
`production`. Until the epay activation exists the provider is simply unconfigured
and never reaches checkout.

**IRIS** remains an **integration boundary**, built with
`createPendingIntegrationProvider`: registered, configurable, routable, but
`validateConfiguration` returns `not_implemented`, `isConfigured` is always false
and `initializePayment` throws `PROVIDER_NOT_IMPLEMENTED`. To complete it, replace
that factory call with a full `PaymentProvider` from the acquirer's specification.
Nothing else changes.

**Stripe and Apple Pay were removed on 2026-09-13** in favour of the bank the shop
already has its acquiring contract with. The architecture is unchanged; a wallet or
a second processor is still one file plus one registry line.

## 13. Local development

1. Set `PAYMENTS_CONFIG_SECRET` (see `.env.example`).
2. Cash on Delivery and Bank Transfer are enabled by default and need nothing else —
   a fresh install has a working checkout immediately.
3. Piraeus needs the bank's test credentials and a publicly reachable result URL
   (the bank's page posts back through the browser, so a tunnel such as
   `cloudflared` or `ngrok` in front of localhost works). Set
   `NEXT_PUBLIC_SITE_URL` to the tunnel origin so the bridge and result redirects
   resolve there.
4. `npm test` covers the state machine, availability, fees, idempotency, secret
   storage, the registry's structural guarantees, both internal providers, the
   IRIS boundary, and Piraeus's SOAP envelope, ticket parsing, HashKey signing
   (against the bank's vector), result verification and the unsigned-decline rule —
   all without a database or a network.
