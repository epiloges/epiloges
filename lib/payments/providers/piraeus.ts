import "server-only";
import { createHash, createHmac } from "node:crypto";
import { decryptSecret, encryptSecret, safeCompare } from "@/lib/payments/crypto";
import { egressConfigured, egressFetch } from "@/lib/payments/egress";
import type {
  ConfigurationTestResult,
  NormalizedWebhookEvent,
  PaymentConfigField,
  PaymentContext,
  PaymentMethodDefinition,
  PaymentProvider,
  PaymentResult,
  PaymentStatusResult,
  RefundContext,
  ResolvedProviderConfig,
  WebhookRequest,
} from "@/lib/payments/types";
import { PaymentError, PaymentWebhookVerificationError } from "@/lib/payments/types";

/**
 * Piraeus Bank — the "epay eCommerce" gateway (historically "ePOS Paycenter"),
 * acquired through Euronet Merchant Services, using its **Redirection** integration.
 *
 * Built from the bank's own Redirection manual as reproduced field-for-field in the
 * public reference implementations (thanpa/PaycenterBundle carries the manual's
 * parameter table verbatim, including the HMAC test vector this file's tests use;
 * ouranosv/piraeus-bank-redirection is the bank's flow in plain PHP). Nothing here
 * is guessed: every endpoint, field name, value and the signing scheme come from
 * that specification. It still has to be exercised against the bank's TEST merchant
 * account before it takes a real card — see PAYMENTS.md §12.
 *
 * The protocol, in three steps:
 *
 *   1. **Ticket.** Our server calls the bank's ticket-issuing web service (SOAP)
 *      with the merchant credentials, the amount and our reference, and receives a
 *      one-time `TranTicket`. The ticket binds the amount: whatever the shopper
 *      does next can only ever charge the sum we asked for here.
 *   2. **Redirect.** The shopper's browser POSTs a form to the bank's payment page
 *      (`pay.aspx`) naming the merchant and the reference. Card entry happens
 *      there, on the bank's domain — no card data ever touches this application.
 *   3. **Result.** The bank sends the outcome back THROUGH THE SHOPPER'S BROWSER as
 *      a form POST to the URL registered on the merchant account. A successful
 *      result carries `HashKey`: HMAC-SHA256 over a fixed list of the result's
 *      fields, keyed with the ticket from step 1. Only the bank and this server
 *      ever saw that ticket, so a valid HashKey is proof the bank produced this
 *      exact result for this exact payment. That is our webhook — delivered by a
 *      browser (`webhookDelivery: "browser"`) but verified exactly like any other.
 *
 * One asymmetry the design has to respect: **the bank signs successes only**. A
 * declined or errored result arrives with an empty HashKey, so it cannot be
 * verified, so it is recorded but never allowed to move a payment's status. The
 * state machine forbids `failed → paid`; letting an unsigned message mark a payment
 * failed would let anyone who knew the reference block a genuine success from
 * being applied later. The shopper is still shown the honest outcome — they land on
 * the confirmation page, which reads "you came back without completing payment" —
 * and the admin sees the declined notification against the payment.
 *
 * What the Redirection tier does not offer: a status-query API and a refund API.
 * Both live in the bank's Web Services tier, which requires the merchant to hold
 * PCI DSS certification, so `getPaymentStatus` returns the stored truth (set only
 * by a verified result) and `refundPayment` records a refund the admin performs in
 * the epay ePOS merchant portal — the same manual-record pattern Cash on Delivery
 * uses, for the same reason: a refund that exists only in a portal is invisible to
 * this shop's accounting.
 */

export const PIRAEUS_TICKET_ENDPOINT = "https://paycenter.piraeusbank.gr/services/tickets/issuer.asmx";
export const PIRAEUS_REDIRECT_ENDPOINT = "https://paycenter.piraeusbank.gr/redirection/pay.aspx";
const PIRAEUS_SOAP_NAMESPACE = "http://piraeusbank.gr/paycenter/redirection";

/**
 * REL-001, same reasoning as the courier ceiling: a stalled bank service must not hold
 * a checkout invocation open indefinitely. Ticket issuing normally answers in well
 * under a second; this bounds the pathological case, not slowness. Timing out here is
 * safe — a ticket that may have been issued anyway is simply never used and expires.
 */
const PIRAEUS_TIMEOUT_MS = 15_000;

/** ISO 4217 numeric codes the bank expects. The method declares EUR only. */
const CURRENCY_CODES: Record<string, string> = { EUR: "978" };
/** `RequestType` "02" is a straight sale (authorise and capture). "00" would be a pre-authorisation. */
const REQUEST_TYPE_SALE = "02";
/** The bank's payment page language. The storefront is Greek. */
const LANGUAGE_CODE = "el-GR";

const CONFIG_FIELDS: readonly PaymentConfigField[] = [
  {
    key: "acquirerId",
    label: "Acquirer ID",
    type: "text",
    secret: false,
    required: true,
    placeholder: "14",
    help: "Issued with your epay eCommerce credentials. Piraeus Bank's acquirer id is 14.",
  },
  {
    key: "merchantId",
    label: "Merchant ID",
    type: "text",
    secret: false,
    required: true,
    help: "The e-commerce Merchant ID from your epay activation letter — not the MID on your physical POS contract.",
  },
  {
    key: "posId",
    label: "POS ID",
    type: "text",
    secret: false,
    required: true,
    help: "The virtual POS (vPOS) id from the same letter.",
  },
  {
    key: "username",
    label: "Username",
    type: "text",
    secret: false,
    required: true,
    help: "The web-service user for ticket issuing. It is also posted, visibly, in the redirect form — the bank's own design.",
  },
  {
    key: "password",
    label: "Password",
    type: "secret",
    secret: true,
    required: true,
    help: "The web-service password. Stored encrypted; sent to the bank only as its MD5 digest, as the specification requires, and never to a browser.",
  },
] as const;

const PIRAEUS_CARD_METHOD: PaymentMethodDefinition = {
  id: "piraeus-card",
  providerId: "piraeus",
  name: "Cards (Piraeus Bank epay)",
  defaultDisplayName: "Κάρτα · IRIS · Google Pay",
  defaultDescription: "Visa, Mastercard, Maestro, IRIS ή Google Pay — επιλέγετε στην ασφαλή σελίδα της Τράπεζας Πειραιώς.",
  type: "card",
  // Requires credentials, so it can never be on before someone supplies them.
  defaultEnabled: false,
  requiresRedirect: true,
  requiresManualConfirmation: false,
  requiresWebhook: true,
  supportsRefunds: true,
  supportsPartialRefunds: true,
  // Sale only (RequestType 02). Pre-authorisation exists in the protocol but this
  // integration does not use it, so there is nothing to capture later.
  supportsCapture: false,
  supportsRecurring: false,
  supportedCurrencies: ["EUR"],
  icon: "card",
  trust: {
    securedBy: "Τράπεζα Πειραιώς",
    securedByGenitive: "Τράπεζας Πειραιώς",
    // IRIS and Google Pay are live on the bank's hosted page for this POS; the shopper
    // picks between them there. Shown here so they know before they commit.
    schemes: ["visa", "mastercard", "maestro", "iris", "google-pay"],
    assurances: ["3-D Secure", "Κρυπτογράφηση SSL", "Τα στοιχεία της κάρτας δεν φτάνουν ποτέ στο κατάστημα"],
  },
};

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

interface PiraeusCredentials {
  acquirerId: string;
  merchantId: string;
  posId: string;
  username: string;
  password: string;
}

function readCredentials(config: ResolvedProviderConfig): PiraeusCredentials | null {
  const acquirerId = config.values.acquirerId?.trim();
  const merchantId = config.values.merchantId?.trim();
  const posId = config.values.posId?.trim();
  const username = config.values.username?.trim();
  const password = config.secrets.password;
  if (!acquirerId || !merchantId || !posId || !username || !password) return null;
  return { acquirerId, merchantId, posId, username, password };
}

function requireCredentials(config: ResolvedProviderConfig): PiraeusCredentials {
  const credentials = readCredentials(config);
  if (!credentials) {
    throw new PaymentError("PROVIDER_NOT_CONFIGURED", "Piraeus epay credentials are incomplete.");
  }
  return credentials;
}

/** The specification sends the password as its MD5 digest, never in clear. */
export function piraeusPasswordDigest(password: string): string {
  return createHash("md5").update(password, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Step 1 — ticket issuing (SOAP 1.2, `IssueNewTicket`)
// ---------------------------------------------------------------------------

export interface TicketRequestFields {
  Username: string;
  /** Already digested — see piraeusPasswordDigest. */
  Password: string;
  MerchantId: string;
  PosId: string;
  AcquirerId: string;
  MerchantReference: string;
  RequestType: string;
  ExpirePreauth: string;
  /** Decimal with two places, e.g. "39.90". */
  Amount: string;
  CurrencyCode: string;
  Installments: string;
  Bnpl: string;
  Parameters: string;
}

/** Field order matches the bank's WSDL. Values are XML-escaped; nothing else is transformed. */
export function buildTicketRequestXml(fields: TicketRequestFields): string {
  const body = (Object.keys(fields) as (keyof TicketRequestFields)[])
    .map((key) => `<${key}>${escapeXml(fields[key])}</${key}>`)
    .join("");
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><IssueNewTicket xmlns="${PIRAEUS_SOAP_NAMESPACE}"><Request>${body}</Request></IssueNewTicket></soap12:Body>` +
    `</soap12:Envelope>`
  );
}

export interface TicketResponse {
  resultCode: string;
  resultDescription: string;
  tranTicket: string;
  /** How long the ticket stays valid, as reported by the bank. */
  minutesToExpiration: number | null;
}

/**
 * The response is a fixed, flat schema, so a local-name match is all the parsing it
 * needs — and it means no XML dependency for one element lookup.
 */
export function parseTicketResponse(xml: string): TicketResponse {
  const read = (name: string): string => {
    const match = xml.match(new RegExp(`<(?:[A-Za-z0-9]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[A-Za-z0-9]+:)?${name}>`));
    return match ? unescapeXml(match[1]).trim() : "";
  };
  const minutes = Number(read("MinutesToExpiration"));
  return {
    resultCode: read("ResultCode"),
    resultDescription: read("ResultDescription"),
    tranTicket: read("TranTicket"),
    minutesToExpiration: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
  };
}

interface IssueTicketInput {
  merchantReference: string;
  amount: number;
  currencyCode: string;
}

async function issueTicket(credentials: PiraeusCredentials, input: IssueTicketInput): Promise<TicketResponse> {
  const currency = CURRENCY_CODES[input.currencyCode.toUpperCase()];
  if (!currency) {
    throw new PaymentError("PROVIDER_ERROR", `Piraeus epay does not accept ${input.currencyCode} through this integration.`);
  }
  if (!(input.amount > 0)) {
    throw new PaymentError("PROVIDER_ERROR", `Refusing to issue a Piraeus ticket for a non-positive amount (${input.amount}).`);
  }

  const xml = buildTicketRequestXml({
    Username: credentials.username,
    Password: piraeusPasswordDigest(credentials.password),
    MerchantId: credentials.merchantId,
    PosId: credentials.posId,
    AcquirerId: credentials.acquirerId,
    MerchantReference: input.merchantReference,
    RequestType: REQUEST_TYPE_SALE,
    ExpirePreauth: "0",
    Amount: input.amount.toFixed(2),
    CurrencyCode: currency,
    Installments: "0",
    Bnpl: "0",
    Parameters: "",
  });

  let response: Response;
  try {
    // Through the static-IP egress proxy when one is configured — the bank whitelists
    // the caller's address (result 1041 otherwise), and this host has no fixed one.
    response = await egressFetch(PIRAEUS_TICKET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
      body: xml,
      signal: AbortSignal.timeout(PIRAEUS_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new PaymentError(
        "PROVIDER_ERROR",
        `Piraeus epay did not respond within ${PIRAEUS_TIMEOUT_MS}ms (IssueNewTicket).`,
        "The bank's payment service is not responding. Please try again in a moment."
      );
    }
    throw new PaymentError(
      "PROVIDER_ERROR",
      `Piraeus epay request failed (IssueNewTicket): ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new PaymentError("PROVIDER_ERROR", `Piraeus epay returned HTTP ${response.status} for IssueNewTicket: ${text.slice(0, 300)}`);
  }
  const parsed = parseTicketResponse(text);
  if (!parsed.resultCode) {
    throw new PaymentError("PROVIDER_ERROR", `Piraeus epay returned an unrecognised ticket response: ${text.slice(0, 300)}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Step 3 — the result and its signature
// ---------------------------------------------------------------------------

/** The fields the bank posts back. Names are the bank's; every one is optional on the wire. */
export interface PiraeusResultFields {
  SupportReferenceID: string;
  ResultCode: string;
  ResultDescription: string;
  StatusFlag: string;
  ResponseCode: string;
  ResponseDescription: string;
  LanguageCode: string;
  MerchantReference: string;
  TransactionDateTime: string;
  TransactionId: string;
  CardType: string;
  PackageNo: string;
  ApprovalCode: string;
  RetrievalRef: string;
  AuthStatus: string;
  Parameters: string;
  HashKey: string;
}

const RESULT_FIELD_NAMES: readonly (keyof PiraeusResultFields)[] = [
  "SupportReferenceID",
  "ResultCode",
  "ResultDescription",
  "StatusFlag",
  "ResponseCode",
  "ResponseDescription",
  "LanguageCode",
  "MerchantReference",
  "TransactionDateTime",
  "TransactionId",
  "CardType",
  "PackageNo",
  "ApprovalCode",
  "RetrievalRef",
  "AuthStatus",
  "Parameters",
  "HashKey",
];

/** The result arrives `application/x-www-form-urlencoded`. Missing fields read as "". */
export function parsePiraeusResultBody(rawBody: string): PiraeusResultFields {
  const params = new URLSearchParams(rawBody);
  const fields = {} as PiraeusResultFields;
  for (const name of RESULT_FIELD_NAMES) fields[name] = params.get(name)?.trim() ?? "";
  return fields;
}

/**
 * The bank's signature: HMAC-SHA256, keyed with the transaction ticket, over the
 * listed fields joined with ";" — in exactly this order, ticket first. Any field the
 * bank sent empty contributes an empty string, which is why `Parameters` (always ""
 * for us) still has to be in the list.
 */
export function computePiraeusHashKey(
  ticket: string,
  input: {
    posId: string;
    acquirerId: string;
    merchantReference: string;
    approvalCode: string;
    parameters: string;
    responseCode: string;
    supportReferenceId: string;
    authStatus: string;
    packageNo: string;
    statusFlag: string;
  }
): string {
  const message = [
    ticket,
    input.posId,
    input.acquirerId,
    input.merchantReference,
    input.approvalCode,
    input.parameters,
    input.responseCode,
    input.supportReferenceId,
    input.authStatus,
    input.packageNo,
    input.statusFlag,
  ].join(";");
  return createHmac("sha256", ticket).update(message, "utf8").digest("hex");
}

/** True only for an approved transaction: the bank's two flags, both checked. */
export function isPiraeusSuccess(fields: Pick<PiraeusResultFields, "ResultCode" | "StatusFlag">): boolean {
  return fields.ResultCode === "0" && fields.StatusFlag === "Success";
}

/**
 * "DD/MM/YYYY HH:MM:SS" in the bank's local time (Greece). Converted on a best-effort
 * basis; the raw string is kept alongside, and a malformed value yields no timestamp
 * rather than a wrong one.
 */
export function parsePiraeusDateTime(value: string): string | undefined {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, day, month, year, hours, minutes, seconds] = match;
  const iso = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  const asUtc = Date.parse(`${iso}Z`);
  if (!Number.isFinite(asUtc)) return undefined;
  // Greece is UTC+2, UTC+3 in summer. Last Sunday of March 01:00 UTC → last Sunday of October 01:00 UTC.
  const y = Number(year);
  const lastSunday = (m: number) => {
    const d = new Date(Date.UTC(y, m + 1, 0));
    return Date.UTC(y, m, d.getUTCDate() - d.getUTCDay(), 1);
  };
  const offsetHours = asUtc >= lastSunday(2) && asUtc < lastSunday(9) ? 3 : 2;
  return new Date(asUtc - offsetHours * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// The provider
// ---------------------------------------------------------------------------

export const piraeusProvider: PaymentProvider = {
  id: "piraeus",
  name: "Piraeus Bank (epay)",
  description:
    "Cards through the Piraeus Bank / Euronet epay eCommerce gateway. The shopper pays on the bank's page; no card data touches this application.",
  methods: [PIRAEUS_CARD_METHOD],
  configFields: CONFIG_FIELDS,
  // The bank runs test and live merchants on the same endpoints; "sandbox" here
  // means "these are the test-account credentials", and labels the payments so.
  supportsEnvironments: true,
  defaultEnabled: false,
  supportsConnectionTest: true,
  webhookSupported: true,
  webhookDelivery: "browser",

  isConfigured(config: ResolvedProviderConfig): boolean {
    return readCredentials(config) !== null;
  },

  /**
   * A real authenticated call — issuing a ticket the shopper's browser will never
   * present. It proves the five credentials work together against the live service
   * and costs nothing: a ticket is not a transaction, appears in no statement, and
   * simply expires.
   */
  async validateConfiguration(config: ResolvedProviderConfig): Promise<ConfigurationTestResult> {
    const credentials = readCredentials(config);
    if (!credentials) {
      const missing = CONFIG_FIELDS.filter((field) =>
        field.secret ? !config.secrets[field.key] : !config.values[field.key]?.trim()
      ).map((field) => field.label);
      return {
        status: "not_configured",
        message: `Missing: ${missing.join(", ")}. All five come with the epay eCommerce activation of your merchant account.`,
        checkedLive: false,
      };
    }

    try {
      const ticket = await issueTicket(credentials, {
        merchantReference: `connection-test-${Date.now()}`,
        amount: 1,
        currencyCode: "EUR",
      });
      if (ticket.resultCode !== "0") {
        // 1041 is not about the credentials at all: the bank only accepts the ticket call
        // from IP addresses registered on the merchant account, and it checks that before
        // the username and password. Say so, and say what to do about it.
        const ipRejected = ticket.resultCode === "1041";
        const route = egressConfigured() ? "static-IP proxy" : "direct (no fixed IP)";
        return {
          status: "auth_failed",
          message: ipRejected
            ? `The bank refused the call because it came from an unregistered IP address (result 1041). Piraeus epay only accepts ticket requests from server addresses registered on the merchant account. ${egressConfigured() ? "A static-IP proxy is configured (PAYMENTS_EGRESS_PROXY_URL): register that proxy's IP address with the bank." : "This host has no fixed address: route the call through a static-IP proxy (PAYMENTS_EGRESS_PROXY_URL) and register the proxy's IP with the bank."}`
            : `The bank rejected these credentials (result ${ticket.resultCode}): ${ticket.resultDescription || "no description"}.`,
          checkedLive: true,
          details: {
            Environment: config.environment,
            "Acquirer / Merchant / POS": `${credentials.acquirerId} / ${credentials.merchantId} / ${credentials.posId}`,
            "Bank response": `${ticket.resultCode}: ${ticket.resultDescription || "no description"}`,
            "Outbound route": route,
          },
        };
      }
      return {
        status: "connected",
        message: `Connected to Piraeus epay in ${config.environment} mode. A test ticket was issued and left to expire — nothing was charged.`,
        checkedLive: true,
        details: {
          Environment: config.environment,
          "Acquirer / Merchant / POS": `${credentials.acquirerId} / ${credentials.merchantId} / ${credentials.posId}`,
          "Ticket validity": ticket.minutesToExpiration ? `${ticket.minutesToExpiration} minutes` : "not reported",
          "Result URL to register with the bank": "/api/payments/webhooks/piraeus (both success and failure)",
        },
      };
    } catch (error) {
      return {
        status: "unavailable",
        message: `Could not reach Piraeus epay: ${error instanceof Error ? error.message : String(error)}`,
        checkedLive: true,
      };
    }
  },

  async initializePayment(ctx: PaymentContext): Promise<PaymentResult> {
    const credentials = requireCredentials(ctx.config);
    if (!ctx.order) throw new PaymentError("PROVIDER_ERROR", "Piraeus epay requires order context to create a payment.");

    // Our payment id is the bank's MerchantReference: unique per attempt (a retried
    // order gets a new payment row and therefore a new reference, which the bank
    // requires), within the 50-character alphanumeric limit, and echoed back in the
    // result — which is how the result finds the payment it belongs to.
    const merchantReference = ctx.payment.id;
    const ticket = await issueTicket(credentials, {
      // Server-computed, never from the browser — and bound into the ticket, so the
      // bank cannot be made to charge a different sum for this reference.
      amount: ctx.payment.amount.amount,
      currencyCode: ctx.payment.amount.currencyCode,
      merchantReference,
    });

    if (ticket.resultCode !== "0" || !ticket.tranTicket) {
      throw new PaymentError(
        "PROVIDER_ERROR",
        `Piraeus epay refused to issue a ticket (result ${ticket.resultCode}): ${ticket.resultDescription || "no description"}.`,
        "The bank could not start this payment. Please try again or choose another payment method."
      );
    }

    const issuedAt = new Date();
    const expiresAt = ticket.minutesToExpiration
      ? new Date(issuedAt.getTime() + ticket.minutesToExpiration * 60_000).toISOString()
      : undefined;

    return {
      status: "awaiting_customer_action",
      customerAction: {
        type: "redirect",
        // No URL: the bank's page is entered by a browser POST, which the bridge page
        // (app/api/payments/redirect) performs. Every field below is one the bank's
        // own specification has the browser send in the clear.
        redirectForm: {
          action: PIRAEUS_REDIRECT_ENDPOINT,
          fields: {
            AcquirerId: credentials.acquirerId,
            MerchantId: credentials.merchantId,
            PosId: credentials.posId,
            User: credentials.username,
            LanguageCode: LANGUAGE_CODE,
            MerchantReference: merchantReference,
            // Appended as a query string when the shopper presses Cancel on the
            // bank's page; the webhook route's GET handler turns it into a return to
            // the order. Everything else comes back as a POST.
            ParamBackLink: `order=${encodeURIComponent(ctx.order.orderId)}`,
          },
        },
        message: "Θα μεταφερθείτε στην ασφαλή σελίδα πληρωμής της Τράπεζας Πειραιώς για να ολοκληρώσετε την πληρωμή.",
        expiresAt,
      },
      metadata: {
        // The HMAC key for the result. Encrypted with the same key as provider
        // credentials, because in plaintext it would let whoever read the row forge
        // a "paid" result for this payment.
        piraeusTicketEncrypted: encryptSecret(ticket.tranTicket),
        // Frozen at issue time so a later credential change can't break verification
        // of a result the bank signed against these values.
        piraeusPosId: credentials.posId,
        piraeusAcquirerId: credentials.acquirerId,
        piraeusMerchantReference: merchantReference,
        piraeusTicketIssuedAt: issuedAt.toISOString(),
        piraeusMode: ctx.config.environment,
      },
    };
  },

  /**
   * The Redirection tier has no status-query API, so there is nothing to ask the
   * bank. The stored status IS the verified truth: it was set by a result whose
   * HashKey checked out against the ticket only the bank and this server knew, and
   * nothing unsigned can have moved it. Returning it unchanged is correct, not lazy.
   */
  async confirmPayment(ctx: PaymentContext): Promise<PaymentResult> {
    return { status: ctx.payment.status, externalPaymentId: ctx.payment.externalPaymentId ?? undefined };
  },

  /** Nothing to cancel at the bank — an unused ticket simply expires. Our record is what changes. */
  async cancelPayment(): Promise<PaymentResult> {
    return { status: "cancelled", metadata: { cancelledLocally: true } };
  },

  /**
   * Recorded here, executed by the admin in the epay ePOS merchant portal. The
   * Redirection tier exposes no refund call; the amount checks mirror the manual
   * providers so the running total can never exceed what was collected.
   */
  async refundPayment(ctx: RefundContext): Promise<PaymentResult> {
    const alreadyRefunded = ctx.payment.refundedAmount.amount;
    const total = alreadyRefunded + ctx.amount.amount;
    if (total > ctx.payment.amount.amount + 0.005) {
      throw new PaymentError("REFUND_AMOUNT_INVALID", "Refund would exceed the amount collected.");
    }
    const isFull = total >= ctx.payment.amount.amount - 0.005;
    return {
      status: isFull ? "refunded" : "partially_refunded",
      refundedAmount: { amount: total, currencyCode: ctx.payment.amount.currencyCode },
      metadata: { refundMethod: "manual_epay_portal", refundReason: ctx.reason ?? null },
    };
  },

  async getPaymentStatus(ctx: PaymentContext): Promise<PaymentStatusResult> {
    return { status: ctx.payment.status, externalPaymentId: ctx.payment.externalPaymentId ?? undefined };
  },

  /**
   * The bank's result, arriving as a browser form POST. Verified against the exact
   * bytes received, keyed with the ticket stored (encrypted) on the payment the
   * result names.
   */
  async parseWebhook(request: WebhookRequest): Promise<NormalizedWebhookEvent> {
    const fields = parsePiraeusResultBody(request.rawBody);
    const eventId = fields.SupportReferenceID ? `epay:${fields.SupportReferenceID}` : "";

    if (!fields.MerchantReference) {
      throw new PaymentWebhookVerificationError("Piraeus epay result carried no MerchantReference.");
    }
    const payment = await request.findPayment({ paymentId: fields.MerchantReference });
    if (!payment) {
      // A reference we never issued. Recorded and acknowledged, never acted on.
      return { eventId, eventType: "epay.unknown_reference", paymentId: null, externalPaymentId: fields.TransactionId || null, status: null, ignored: true };
    }

    const summary = {
      resultCode: fields.ResultCode,
      resultDescription: fields.ResultDescription,
      responseCode: fields.ResponseCode,
      responseDescription: fields.ResponseDescription,
      statusFlag: fields.StatusFlag,
      supportReferenceId: fields.SupportReferenceID,
      transactionDateTime: fields.TransactionDateTime,
    };

    if (!isPiraeusSuccess(fields)) {
      // Unsigned by the bank's design (HashKey is blank unless the transaction
      // succeeded), so it cannot be verified and must not change the status — see
      // the file comment. It is stored against the payment for the admin, and the
      // shopper is sent back to their order with the "unfinished" message.
      return {
        eventId,
        eventType: fields.ResultCode === "0" ? "epay.declined" : "epay.error",
        paymentId: payment.id,
        externalPaymentId: fields.TransactionId || null,
        status: null,
        ignored: true,
        failureReason: fields.ResponseDescription || fields.ResultDescription || undefined,
        metadata: summary,
      };
    }

    if (!fields.HashKey) {
      throw new PaymentWebhookVerificationError("Piraeus epay reported success without a HashKey.", { paymentId: payment.id });
    }
    const storedTicket = payment.metadata.piraeusTicketEncrypted;
    const posId = payment.metadata.piraeusPosId;
    const acquirerId = payment.metadata.piraeusAcquirerId;
    if (typeof storedTicket !== "string" || typeof posId !== "string" || typeof acquirerId !== "string") {
      throw new PaymentWebhookVerificationError(
        "This payment has no Piraeus ticket stored, so its result cannot be verified.",
        { paymentId: payment.id }
      );
    }

    let ticket: string;
    try {
      ticket = decryptSecret(storedTicket);
    } catch (error) {
      throw new PaymentWebhookVerificationError(
        `Could not decrypt the stored Piraeus ticket: ${error instanceof Error ? error.message : String(error)}`,
        { paymentId: payment.id }
      );
    }

    const expected = computePiraeusHashKey(ticket, {
      posId,
      acquirerId,
      merchantReference: fields.MerchantReference,
      approvalCode: fields.ApprovalCode,
      parameters: fields.Parameters,
      responseCode: fields.ResponseCode,
      supportReferenceId: fields.SupportReferenceID,
      authStatus: fields.AuthStatus,
      packageNo: fields.PackageNo,
      statusFlag: fields.StatusFlag,
    });
    // The bank sends the digest in upper-case hex; case is not part of the signature.
    if (!safeCompare(expected.toLowerCase(), fields.HashKey.toLowerCase())) {
      throw new PaymentWebhookVerificationError("Piraeus epay HashKey did not match.", { paymentId: payment.id });
    }

    return {
      eventId,
      eventType: "epay.success",
      paymentId: payment.id,
      externalPaymentId: fields.TransactionId || null,
      status: "paid",
      // The result states no amount. The ticket does — it was issued for exactly
      // ctx.payment.amount and a HashKey keyed with it cannot belong to any other
      // sum — so the pipeline's "no amount to verify" note is expected here.
      occurredAt: parsePiraeusDateTime(fields.TransactionDateTime),
      metadata: {
        ...summary,
        approvalCode: fields.ApprovalCode,
        retrievalRef: fields.RetrievalRef,
        packageNo: fields.PackageNo,
        cardType: fields.CardType,
        authStatus: fields.AuthStatus,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
