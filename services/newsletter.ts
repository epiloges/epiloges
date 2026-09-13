import "server-only";
import { prisma } from "@/lib/prisma";
import type { NewsletterSubscriber } from "@/types";

/**
 * Real newsletter persistence. This replaced a form that awaited a 500ms timer and
 * then claimed success while discarding the address — the footer signup (sitewide)
 * and the homepage Newsletter section both went through it, so every subscriber
 * collected up to this point was silently dropped.
 */

/**
 * Idempotent by email: re-subscribing updates nothing and reports the same success as a
 * first-time signup. That keeps a double-submit from erroring, and deliberately makes
 * "already subscribed" indistinguishable from "newly subscribed" to the caller, so the
 * endpoint can't be used to test whether an address is on the list.
 */
/** Returns whether this was a NEW subscription — the welcome email is only for those. */
export async function subscribeToNewsletter(email: string, source?: string): Promise<{ created: boolean }> {
  const address = email.trim().toLowerCase();
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: address }, select: { email: true } });
  await prisma.newsletterSubscriber.upsert({
    where: { email: address },
    create: { email: address, source },
    update: {},
  });
  // Signing up again is the clearest possible "I do want these" — clear a previous opt-out.
  await prisma.emailUnsubscribe.deleteMany({ where: { email: address } });
  return { created: !existing };
}

export async function getNewsletterSubscribers(): Promise<NewsletterSubscriber[]> {
  const rows = await prisma.newsletterSubscriber.findMany({ orderBy: { subscribedAt: "desc" } });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    source: row.source ?? undefined,
    subscribedAt: row.subscribedAt.toISOString(),
  }));
}
