import { NextResponse } from "next/server";
import { newsletterSchema } from "@/lib/validation/newsletter";
import { subscribeToNewsletter } from "@/services/newsletter";
import { getEmailProvider, newsletterWelcomeEmail } from "@/lib/email";
import { getSiteSettings } from "@/services/settings";
import { getSiteUrl } from "@/lib/site-url";
import { invalidInputResponse, rateLimitedResponse } from "@/lib/commerce/http-errors";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rate-limit";

/** Public, unauthenticated by nature — rate limited per IP so it can't be used to bulk-stuff the list. */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const key = `newsletter:ip:${ip}`;
  const limit = await isRateLimited({ key, limit: 5, windowMs: 60 * 60 * 1000 });
  if (limit.limited) return rateLimitedResponse(limit.retryAfterSeconds);
  await recordAttempt(key);

  const body = await request.json().catch(() => null);
  const parsed = newsletterSchema.safeParse(body);
  if (!parsed.success) return invalidInputResponse(parsed.error.issues[0]?.message ?? "Invalid input.");

  const source = typeof (body as { source?: unknown })?.source === "string" ? (body as { source: string }).source : undefined;
  const { created } = await subscribeToNewsletter(parsed.data.email, source);

  // A welcome, once. The sign-up form used to say "you are on the list" and nothing ever
  // arrived, so a typo in the address stayed invisible until the first campaign.
  if (created) {
    try {
      const settings = await getSiteSettings();
      const message = newsletterWelcomeEmail({ siteName: settings.siteName, shopUrl: getSiteUrl().replace(/\/$/, "") });
      await getEmailProvider().send({ to: parsed.data.email, template: "newsletter-welcome", ...message });
    } catch (error) {
      console.error("Failed to send newsletter welcome email", error);
    }
  }

  return NextResponse.json({ ok: true });
}
