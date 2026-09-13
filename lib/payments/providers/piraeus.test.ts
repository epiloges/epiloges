import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PIRAEUS_REDIRECT_ENDPOINT,
  PIRAEUS_TICKET_ENDPOINT,
  buildTicketRequestXml,
  computePiraeusHashKey,
  isPiraeusSuccess,
  parsePiraeusDateTime,
  parsePiraeusResultBody,
  parseTicketResponse,
  piraeusPasswordDigest,
  piraeusProvider,
} from "./piraeus";
import { decryptSecret, encryptSecret } from "@/lib/payments/crypto";
import { PaymentWebhookVerificationError } from "@/lib/payments/types";
import type { PaymentContext, PaymentRecord, ResolvedProviderConfig } from "@/lib/payments/types";

/**
 * The bank's own test vector, as published in the reference implementation that
 * reproduces the Redirection manual (thanpa/PaycenterBundle,
 * Tests/Service/PiraeusHashCalculatorTest.php). If this ever fails, the signing
 * scheme has been changed and every result would be rejected as forged.
 */
const VECTOR = {
  ticket: "4236ece6142b4639925eb6f80217122f",
  posId: "99999999",
  acquirerId: "14",
  merchantReference: "Test",
  approvalCode: "389700",
  parameters: "MyParam",
  responseCode: "00",
  supportReferenceId: "364629",
  authStatus: "02",
  packageNo: "1",
  statusFlag: "Success",
  expected: "551f158e669965f30bcfa65e558fd4aabb191d394de39be2adfab416575102d7",
};

function config(values: Record<string, string> = {}, secrets: Record<string, string> = {}): ResolvedProviderConfig {
  return { providerId: "piraeus", environment: "sandbox", values, secrets, sourcedFromEnv: new Set() };
}

const COMPLETE = config(
  { acquirerId: "14", merchantId: "2345678901", posId: "99999999", username: "shop" },
  { password: "s3cret" }
);

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: "cmf0piraeuspay000001",
    orderId: "order_abcdef1234",
    providerId: "piraeus",
    methodId: "piraeus-card",
    externalPaymentId: null,
    amount: { amount: 39.9, currencyCode: "EUR" },
    refundedAmount: { amount: 0, currencyCode: "EUR" },
    status: "awaiting_customer_action",
    environment: "sandbox",
    idempotencyKey: "pay_key",
    failureReason: null,
    metadata: {},
    createdAt: "2026-09-13T09:00:00.000Z",
    updatedAt: "2026-09-13T09:00:00.000Z",
    paidAt: null,
    failedAt: null,
    cancelledAt: null,
    refundedAt: null,
    ...overrides,
  };
}

function context(cfg: ResolvedProviderConfig, record = payment()): PaymentContext {
  return {
    config: cfg,
    method: piraeusProvider.methods[0],
    payment: record,
    idempotencyKey: record.idempotencyKey,
    order: {
      orderId: record.orderId,
      customerEmail: "shopper@example.com",
      customerId: null,
      lineItems: [],
      totals: {} as never,
      shippingAddress: {} as never,
      billingAddress: {} as never,
    },
    returnUrls: { success: "https://shop.test/checkout/confirmation?order=x&verify=1", cancel: "https://shop.test/checkout/confirmation?order=x&cancelled=1" },
  };
}

function ticketResponseXml(fields: { ResultCode: string; ResultDescription?: string; TranTicket?: string; MinutesToExpiration?: string }): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap:Body><IssueNewTicketResponse xmlns="http://piraeusbank.gr/paycenter/redirection"><IssueNewTicketResult>` +
    `<ResultCode>${fields.ResultCode}</ResultCode><ResultDescription>${fields.ResultDescription ?? ""}</ResultDescription>` +
    `<TranTicket>${fields.TranTicket ?? ""}</TranTicket><Timestamp>2026-09-13T12:00:00</Timestamp>` +
    `<MinutesToExpiration>${fields.MinutesToExpiration ?? "30"}</MinutesToExpiration>` +
    `</IssueNewTicketResult></IssueNewTicketResponse></soap:Body></soap:Envelope>`
  );
}

/** A result body exactly as the bank's page posts it, signed with the given ticket. */
function signedResult(ticket: string, overrides: Partial<Record<string, string>> = {}): string {
  const base: Record<string, string> = {
    SupportReferenceID: "364629",
    ResultCode: "0",
    ResultDescription: "",
    StatusFlag: "Success",
    ResponseCode: "00",
    ResponseDescription: "Approved",
    LanguageCode: "el-GR",
    MerchantReference: payment().id,
    TransactionDateTime: "13/09/2026 15:04:05",
    TransactionId: "123456789",
    CardType: "1",
    PackageNo: "7",
    ApprovalCode: "389700",
    RetrievalRef: "626012345678",
    AuthStatus: "02",
    Parameters: "",
    ...overrides,
  };
  const hash = computePiraeusHashKey(ticket, {
    posId: "99999999",
    acquirerId: "14",
    merchantReference: base.MerchantReference,
    approvalCode: base.ApprovalCode,
    parameters: base.Parameters,
    responseCode: base.ResponseCode,
    supportReferenceId: base.SupportReferenceID,
    authStatus: base.AuthStatus,
    packageNo: base.PackageNo,
    statusFlag: base.StatusFlag,
  }).toUpperCase();
  return new URLSearchParams({ ...base, HashKey: overrides.HashKey ?? hash }).toString();
}

describe("Piraeus epay — signing scheme", () => {
  it("reproduces the bank's published HashKey test vector", () => {
    const { expected, ticket, ...fields } = VECTOR;
    expect(computePiraeusHashKey(ticket, fields)).toBe(expected);
  });

  it("changes when any signed field changes, including an empty Parameters slot", () => {
    const { expected, ticket, ...fields } = VECTOR;
    expect(computePiraeusHashKey(ticket, { ...fields, parameters: "" })).not.toBe(expected);
    expect(computePiraeusHashKey(ticket, { ...fields, statusFlag: "Failure" })).not.toBe(expected);
    expect(computePiraeusHashKey("another-ticket", fields)).not.toBe(expected);
  });

  it("sends the password as its MD5 digest, as the specification requires", () => {
    // md5("string") — the value in the reference bundle's request fixture.
    expect(piraeusPasswordDigest("string")).toBe("b45cffe084dd3d20d928bee85e7b0f21");
  });
});

describe("Piraeus epay — ticket request and response", () => {
  it("builds the SOAP 1.2 IssueNewTicket envelope in the bank's namespace and field order", () => {
    const xml = buildTicketRequestXml({
      Username: "shop",
      Password: "digest",
      MerchantId: "2345678901",
      PosId: "99999999",
      AcquirerId: "14",
      MerchantReference: "ref<1>",
      RequestType: "02",
      ExpirePreauth: "0",
      Amount: "39.90",
      CurrencyCode: "978",
      Installments: "0",
      Bnpl: "0",
      Parameters: "",
    });
    expect(xml).toContain('xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"');
    expect(xml).toContain('<IssueNewTicket xmlns="http://piraeusbank.gr/paycenter/redirection">');
    expect(xml).toContain("<MerchantReference>ref&lt;1&gt;</MerchantReference>");
    expect(xml.indexOf("<Username>")).toBeLessThan(xml.indexOf("<Password>"));
    expect(xml.indexOf("<Amount>")).toBeLessThan(xml.indexOf("<CurrencyCode>"));
    expect(xml).toContain("<Parameters></Parameters>");
  });

  it("reads the ticket and its validity out of a successful response", () => {
    const parsed = parseTicketResponse(ticketResponseXml({ ResultCode: "0", TranTicket: "abc123", MinutesToExpiration: "30" }));
    expect(parsed).toEqual({ resultCode: "0", resultDescription: "", tranTicket: "abc123", minutesToExpiration: 30 });
  });

  it("surfaces the bank's description on a refused request", () => {
    const parsed = parseTicketResponse(ticketResponseXml({ ResultCode: "1001", ResultDescription: "Invalid &amp; unknown merchant" }));
    expect(parsed.resultCode).toBe("1001");
    expect(parsed.resultDescription).toBe("Invalid & unknown merchant");
    expect(parsed.tranTicket).toBe("");
  });
});

describe("Piraeus epay — result parsing", () => {
  it("reads every documented field from a form-encoded body and defaults the rest to empty", () => {
    const fields = parsePiraeusResultBody("ResultCode=0&StatusFlag=Success&MerchantReference=abc&HashKey=ABC");
    expect(fields.ResultCode).toBe("0");
    expect(fields.StatusFlag).toBe("Success");
    expect(fields.MerchantReference).toBe("abc");
    expect(fields.ApprovalCode).toBe("");
    expect(fields.Parameters).toBe("");
  });

  it("treats only ResultCode 0 AND StatusFlag Success as approved", () => {
    expect(isPiraeusSuccess({ ResultCode: "0", StatusFlag: "Success" })).toBe(true);
    expect(isPiraeusSuccess({ ResultCode: "0", StatusFlag: "Failure" })).toBe(false);
    expect(isPiraeusSuccess({ ResultCode: "1001", StatusFlag: "Success" })).toBe(false);
  });

  it("converts the bank's Greek local timestamp to UTC, in both halves of the year", () => {
    expect(parsePiraeusDateTime("13/09/2026 15:04:05")).toBe("2026-09-13T12:04:05.000Z"); // EEST, UTC+3
    expect(parsePiraeusDateTime("20/01/2026 10:00:00")).toBe("2026-01-20T08:00:00.000Z"); // EET, UTC+2
    expect(parsePiraeusDateTime("-")).toBeUndefined();
  });
});

describe("Piraeus epay — provider", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    process.env.PAYMENTS_CONFIG_SECRET = "test-secret-for-piraeus-tests-0123456789";
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("is a connectable provider whose result arrives through the browser", () => {
    expect(piraeusProvider.integrationPending).toBeFalsy();
    expect(piraeusProvider.webhookDelivery).toBe("browser");
    expect(piraeusProvider.methods[0].requiresRedirect).toBe(true);
    expect(piraeusProvider.methods[0].supportedCurrencies).toEqual(["EUR"]);
  });

  it("is unconfigured until all five credentials are present", () => {
    expect(piraeusProvider.isConfigured(config())).toBe(false);
    expect(piraeusProvider.isConfigured(config({ acquirerId: "14", merchantId: "1", posId: "2", username: "u" }))).toBe(false);
    expect(piraeusProvider.isConfigured(COMPLETE)).toBe(true);
  });

  it("names the missing fields without contacting the bank", async () => {
    const result = await piraeusProvider.validateConfiguration(config({ acquirerId: "14" }));
    expect(result.status).toBe("not_configured");
    expect(result.checkedLive).toBe(false);
    expect(result.message).toMatch(/Merchant ID/);
    expect(result.message).toMatch(/Password/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proves credentials with a real ticket request, reporting the bank's verdict either way", async () => {
    fetchMock.mockResolvedValueOnce(new Response(ticketResponseXml({ ResultCode: "0", TranTicket: "t1", MinutesToExpiration: "30" }), { status: 200 }));
    const ok = await piraeusProvider.validateConfiguration(COMPLETE);
    expect(ok.status).toBe("connected");
    expect(ok.checkedLive).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(PIRAEUS_TICKET_ENDPOINT, expect.objectContaining({ method: "POST" }));
    const sent = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    // The digest travels, the password does not.
    expect(sent).toContain(`<Password>${piraeusPasswordDigest("s3cret")}</Password>`);
    expect(sent).not.toContain("s3cret");

    fetchMock.mockResolvedValueOnce(new Response(ticketResponseXml({ ResultCode: "1002", ResultDescription: "Authentication failed" }), { status: 200 }));
    const bad = await piraeusProvider.validateConfiguration(COMPLETE);
    expect(bad.status).toBe("auth_failed");
    expect(bad.checkedLive).toBe(true);
    expect(bad.message).toMatch(/Authentication failed/);
  });

  it("issues a ticket for the server-side amount and hands back a POST form, never a bare URL", async () => {
    fetchMock.mockResolvedValueOnce(new Response(ticketResponseXml({ ResultCode: "0", TranTicket: "ticket-xyz", MinutesToExpiration: "30" }), { status: 200 }));
    const result = await piraeusProvider.initializePayment(context(COMPLETE));

    const sent = String((fetchMock.mock.calls[0]![1] as RequestInit).body);
    expect(sent).toContain("<Amount>39.90</Amount>");
    expect(sent).toContain("<CurrencyCode>978</CurrencyCode>");
    expect(sent).toContain(`<MerchantReference>${payment().id}</MerchantReference>`);
    expect(sent).toContain("<RequestType>02</RequestType>");
    expect(sent).toContain("<Installments>0</Installments>");

    expect(result.status).toBe("awaiting_customer_action");
    expect(result.customerAction?.type).toBe("redirect");
    expect(result.customerAction?.redirectUrl).toBeUndefined();
    expect(result.customerAction?.redirectForm?.action).toBe(PIRAEUS_REDIRECT_ENDPOINT);
    expect(result.customerAction?.redirectForm?.fields).toMatchObject({
      AcquirerId: "14",
      MerchantId: "2345678901",
      PosId: "99999999",
      User: "shop",
      LanguageCode: "el-GR",
      MerchantReference: payment().id,
    });
    expect(result.customerAction?.expiresAt).toBeDefined();

    // The ticket is the signing key for the result: stored, but never in clear.
    const stored = result.metadata?.piraeusTicketEncrypted;
    expect(typeof stored).toBe("string");
    expect(stored).not.toContain("ticket-xyz");
    expect(decryptSecret(stored as string)).toBe("ticket-xyz");
    // And nothing secret rides along in the browser-visible form.
    expect(JSON.stringify(result.customerAction?.redirectForm)).not.toContain("s3cret");
    expect(JSON.stringify(result.customerAction?.redirectForm)).not.toContain("ticket-xyz");
  });

  it("refuses to start a payment the bank would not ticket", async () => {
    fetchMock.mockResolvedValueOnce(new Response(ticketResponseXml({ ResultCode: "1001", ResultDescription: "Invalid merchant" }), { status: 200 }));
    await expect(piraeusProvider.initializePayment(context(COMPLETE))).rejects.toThrow(/Invalid merchant/);
  });

  it("refuses to start a payment without credentials rather than posting an empty form", async () => {
    await expect(piraeusProvider.initializePayment(context(config()))).rejects.toThrow(/incomplete/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a refund for the admin to execute in the bank's portal, capped at what was collected", async () => {
    const partial = await piraeusProvider.refundPayment({
      ...context(COMPLETE, payment({ status: "paid" })),
      amount: { amount: 10, currencyCode: "EUR" },
    });
    expect(partial.status).toBe("partially_refunded");
    expect(partial.refundedAmount?.amount).toBe(10);
    expect(partial.metadata?.refundMethod).toBe("manual_epay_portal");

    await expect(
      piraeusProvider.refundPayment({ ...context(COMPLETE, payment({ status: "paid" })), amount: { amount: 50, currencyCode: "EUR" } })
    ).rejects.toThrow(/exceed/i);
  });

  describe("result verification", () => {
    const ticket = "4236ece6142b4639925eb6f80217122f";
    const stored = () =>
      payment({
        metadata: { piraeusTicketEncrypted: encryptSecret(ticket), piraeusPosId: "99999999", piraeusAcquirerId: "14" },
      });
    const request = (rawBody: string, record: PaymentRecord | null = stored()) => ({
      rawBody,
      headers: new Headers({ "content-type": "application/x-www-form-urlencoded" }),
      findPayment: async () => record,
    });

    it("accepts a success whose HashKey matches the stored ticket", async () => {
      const event = await piraeusProvider.parseWebhook!(request(signedResult(ticket)), COMPLETE);
      expect(event.status).toBe("paid");
      expect(event.paymentId).toBe(payment().id);
      expect(event.externalPaymentId).toBe("123456789");
      expect(event.eventId).toBe("epay:364629");
      expect(event.occurredAt).toBe("2026-09-13T12:04:05.000Z");
      expect(event.ignored).toBeFalsy();
    });

    it("rejects a success signed with a different ticket", async () => {
      await expect(piraeusProvider.parseWebhook!(request(signedResult("some-other-ticket")), COMPLETE)).rejects.toThrow(
        PaymentWebhookVerificationError
      );
    });

    it("rejects a success whose signed fields were altered after signing", async () => {
      const genuine = new URLSearchParams(signedResult(ticket));
      genuine.set("ApprovalCode", "000000");
      await expect(piraeusProvider.parseWebhook!(request(genuine.toString()), COMPLETE)).rejects.toThrow(/did not match/);
    });

    it("rejects a success that claims to be signed but carries no HashKey", async () => {
      const body = new URLSearchParams(signedResult(ticket));
      body.set("HashKey", "");
      await expect(piraeusProvider.parseWebhook!(request(body.toString()), COMPLETE)).rejects.toThrow(/without a HashKey/);
    });

    it("files a rejected result against the payment it named", async () => {
      try {
        await piraeusProvider.parseWebhook!(request(signedResult("wrong")), COMPLETE);
        throw new Error("expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentWebhookVerificationError);
        expect((error as PaymentWebhookVerificationError).paymentId).toBe(payment().id);
      }
    });

    it("cannot verify a result for a payment with no stored ticket", async () => {
      await expect(piraeusProvider.parseWebhook!(request(signedResult(ticket), payment()), COMPLETE)).rejects.toThrow(/no Piraeus ticket/);
    });

    it("never lets an unsigned decline change a payment's status", async () => {
      const declined = new URLSearchParams(signedResult(ticket, { StatusFlag: "Failure", ResponseCode: "05", ResponseDescription: "Do not honour", HashKey: "" }));
      const event = await piraeusProvider.parseWebhook!(request(declined.toString()), COMPLETE);
      // Recorded, attributed, acknowledged — and explicitly not applied. The bank does
      // not sign failures, so this message could have come from anyone.
      expect(event.ignored).toBe(true);
      expect(event.status).toBeNull();
      expect(event.paymentId).toBe(payment().id);
      expect(event.eventType).toBe("epay.declined");
      expect(event.failureReason).toBe("Do not honour");
    });

    it("ignores a result for a reference it never issued", async () => {
      const event = await piraeusProvider.parseWebhook!(request(signedResult(ticket), null), COMPLETE);
      expect(event.ignored).toBe(true);
      expect(event.paymentId).toBeNull();
    });

    it("refuses a result with no MerchantReference at all", async () => {
      await expect(piraeusProvider.parseWebhook!(request("ResultCode=0&StatusFlag=Success"), COMPLETE)).rejects.toThrow(/MerchantReference/);
    });
  });
});
