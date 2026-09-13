import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Proving that a password sign-up owns the address it typed.
 *
 * The welcome email carries a link to `/api/auth/verify-email?token=<jwt>`; clicking it
 * stamps `Customer.emailVerifiedAt`. The token is signed, names the customer AND the
 * address, and is short-lived — a stateless twin of the password-reset token, which
 * needs a table because it must be single-use. Verifying twice is harmless, so this one
 * does not. OAuth sign-ins skip all of this: Google/Apple/Facebook verified the address
 * before they issued us a token.
 *
 * Nothing on the storefront is locked behind verification. Its job is to catch a typo
 * before the first order confirmation goes to a stranger, and to give the account page a
 * reason to say "we could not reach you" instead of nothing.
 */
const TOKEN_TTL = "48h";
export const VERIFICATION_LINK_HOURS = 48;

function secretKey(): Uint8Array {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signEmailVerificationToken(customerId: string, email: string): Promise<string> {
  return new SignJWT({ sub: customerId, email: email.trim().toLowerCase(), purpose: "email-verification" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

/** The customer and address the token vouches for, or null for anything invalid, expired or of another purpose. */
export async function readEmailVerificationToken(token: string | null | undefined): Promise<{ customerId: string; email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== "email-verification" || typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { customerId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function emailVerificationUrl(customerId: string, email: string): Promise<string> {
  const token = await signEmailVerificationToken(customerId, email);
  return `${getSiteUrl().replace(/\/$/, "")}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}
