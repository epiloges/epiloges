import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { getCustomerById } from "@/services/customers";
import { commerceErrorResponse, rateLimitedResponse } from "@/lib/commerce/http-errors";
import { isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { emailVerificationEmail, getEmailProvider } from "@/lib/email";
import { emailVerificationUrl, VERIFICATION_LINK_HOURS } from "@/lib/email-verification";
import { getSiteSettings } from "@/services/settings";

/**
 * "Send the link again", from the account page. Session-gated — it can only mail the
 * signed-in customer's own address — and limited per account, since each call is an
 * email someone has to receive.
 */
export async function POST() {
  try {
    const session = await requireCustomerSession();
    const key = `verify-email:customer:${session.sub}`;
    const limit = await isRateLimited({ key, limit: 3, windowMs: 60 * 60 * 1000 });
    if (limit.limited) return rateLimitedResponse(limit.retryAfterSeconds);

    const customer = await getCustomerById(session.sub);
    if (!customer) throw new Error("Unauthorized");
    if (customer.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

    await recordAttempt(key);
    const settings = await getSiteSettings();
    const message = emailVerificationEmail({
      siteName: settings.siteName,
      firstName: customer.firstName,
      verifyUrl: await emailVerificationUrl(customer.id, customer.email),
      expiresInHours: VERIFICATION_LINK_HOURS,
    });
    await getEmailProvider().send({ to: customer.email, template: "email-verification", ...message });
    return NextResponse.json({ ok: true, alreadyVerified: false });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
