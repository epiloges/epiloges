import { describe, expect, it } from "vitest";
import { redactSecrets } from "./pipeline";

/** The admin email log used to show live password-reset links to every admin role. */
describe("redactSecrets", () => {
  it("removes a password-reset token", () => {
    const html = '<a href="https://shop.test/account/reset-password?token=abc123def">Reset</a>';
    expect(redactSecrets(html)).toBe('<a href="https://shop.test/account/reset-password?token=REDACTED">Reset</a>');
  });

  it("removes a verification token that follows other parameters, including HTML-escaped ampersands", () => {
    expect(redactSecrets("/api/auth/verify-email?x=1&token=eyJ.a.b end")).toBe("/api/auth/verify-email?x=1&token=REDACTED end");
    expect(redactSecrets("/verify?x=1&amp;token=eyJ.a.b")).toBe("/verify?x=1&amp;token=REDACTED");
  });

  it("leaves ordinary links alone", () => {
    const html = '<a href="https://shop.test/checkout/confirmation?order=abc">Order</a>';
    expect(redactSecrets(html)).toBe(html);
  });
});
