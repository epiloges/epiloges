import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailVerificationUrl, readEmailVerificationToken, signEmailVerificationToken } from "./email-verification";
import { signUnsubscribeToken } from "./email/unsubscribe";

const ORIGINAL = process.env.CUSTOMER_SESSION_SECRET;

beforeEach(() => {
  process.env.CUSTOMER_SESSION_SECRET = "a-test-secret-that-is-long-enough";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CUSTOMER_SESSION_SECRET;
  else process.env.CUSTOMER_SESSION_SECRET = ORIGINAL;
});

describe("email verification token", () => {
  it("round-trips the customer and the lower-cased address", async () => {
    const token = await signEmailVerificationToken("cust_1", "Maria@Example.COM");
    expect(await readEmailVerificationToken(token)).toEqual({ customerId: "cust_1", email: "maria@example.com" });
  });

  it("reads nothing from a missing or mangled token", async () => {
    expect(await readEmailVerificationToken(undefined)).toBeNull();
    expect(await readEmailVerificationToken("not-a-jwt")).toBeNull();
    const token = await signEmailVerificationToken("cust_1", "maria@example.com");
    expect(await readEmailVerificationToken(token.slice(0, -2) + "xx")).toBeNull();
  });

  it("refuses a token signed with the same secret for another purpose", async () => {
    // Same key, same algorithm — only the purpose claim tells an unsubscribe link from a
    // verification link. Without that check, a marketing footer could verify an address.
    const unsubscribe = await signUnsubscribeToken("maria@example.com");
    expect(await readEmailVerificationToken(unsubscribe)).toBeNull();
  });

  it("builds a link on the configured site, with the token URL-encoded", async () => {
    const url = await emailVerificationUrl("cust_1", "maria@example.com");
    expect(url).toMatch(/^https?:\/\/[^/]+\/api\/auth\/verify-email\?token=/);
    const token = decodeURIComponent(url.split("token=")[1]);
    expect((await readEmailVerificationToken(token))?.customerId).toBe("cust_1");
  });
});
