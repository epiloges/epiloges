import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getSiteUrl } from "@/lib/site-url";

/**
 * Opting out of marketing mail.
 *
 * Every marketing email carries a link to `/api/email/unsubscribe?t=<token>` (and the
 * same URL in a List-Unsubscribe header, which Gmail and Apple Mail turn into a one-click
 * button). The token is a signed JWT naming the address, so the link works without a login
 * — a guest who abandoned a cart has no account to sign in to — and cannot be forged to
 * unsubscribe somebody else. Long-lived on purpose: people click these months later.
 *
 * The pipeline consults `isUnsubscribed` before any marketing template; account holders
 * who turned off "accepts marketing" in their profile are treated the same way.
 */
const TOKEN_TTL = "365d";

function secretKey(): Uint8Array {
  // A dedicated secret if one is set, else the customer-session secret: the token grants
  // exactly one thing (stopping mail to one address), which is less than a session does.
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.CUSTOMER_SESSION_SECRET;
  if (!secret) throw new Error("CUSTOMER_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signUnsubscribeToken(email: string): Promise<string> {
  return new SignJWT({ email: email.trim().toLowerCase(), purpose: "unsubscribe" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey());
}

export async function readUnsubscribeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.purpose === "unsubscribe" && typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function unsubscribeUrl(email: string): Promise<string> {
  const token = await signUnsubscribeToken(email);
  return `${getSiteUrl().replace(/\/$/, "")}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

export async function isUnsubscribed(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  const [row, customer] = await Promise.all([
    prisma.emailUnsubscribe.findUnique({ where: { email: address }, select: { email: true } }),
    prisma.customer.findUnique({ where: { email: address }, select: { acceptsMarketing: true } }),
  ]);
  if (row) return true;
  return customer ? !customer.acceptsMarketing : false;
}

export async function recordUnsubscribe(email: string, reason?: string): Promise<void> {
  const address = email.trim().toLowerCase();
  await prisma.$transaction([
    prisma.emailUnsubscribe.upsert({ where: { email: address }, create: { email: address, reason }, update: { reason } }),
    // The newsletter list and the account flag are the two other places "wants marketing"
    // lives; an opt-out must land in all three or the next job reads the one it missed.
    prisma.newsletterSubscriber.deleteMany({ where: { email: address } }),
    prisma.customer.updateMany({ where: { email: address }, data: { acceptsMarketing: false } }),
  ]);
}
