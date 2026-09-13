import { NextResponse } from "next/server";
import { conciergeSchema } from "@/lib/validation/concierge";
import { createConciergeRequest } from "@/services/concierge";
import { getCustomerSession } from "@/lib/customer-session";
import { adminNotificationEmail, conciergeAcknowledgementEmail, getEmailProvider } from "@/lib/email";
import { getSiteSettings } from "@/services/settings";
import { getSiteUrl } from "@/lib/site-url";
import { invalidInputResponse, rateLimitedResponse } from "@/lib/commerce/http-errors";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const key = `concierge:ip:${ip}`;
  const limit = await isRateLimited({ key, limit: 5, windowMs: 60 * 60 * 1000 });
  if (limit.limited) return rateLimitedResponse(limit.retryAfterSeconds);
  await recordAttempt(key);

  const body = await request.json();
  const parsed = conciergeSchema.safeParse(body);
  if (!parsed.success) return invalidInputResponse(parsed.error.issues[0]?.message ?? "Invalid input.");

  const session = await getCustomerSession();
  await createConciergeRequest(parsed.data, session?.sub);

  // Both best-effort: the request is persisted and visible in the admin regardless.
  try {
    const settings = await getSiteSettings();
    const provider = getEmailProvider();
    const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.CONTACT_EMAIL || settings.contactEmail;
    await provider.send({
      to: parsed.data.email,
      template: "concierge-acknowledgement",
      ...conciergeAcknowledgementEmail({ siteName: settings.siteName, name: parsed.data.name, topic: parsed.data.topic, message: parsed.data.message }),
    });
    if (to) {
      await provider.send({
        to,
        template: "concierge-request",
        replyTo: parsed.data.email,
        ...adminNotificationEmail({
          siteName: settings.siteName,
          title: `Νέο αίτημα στυλίστα από ${parsed.data.name}`,
          summary: parsed.data.topic,
          rows: [
            { label: "Από", value: `${parsed.data.name} <${parsed.data.email}>` },
            { label: "Θέμα", value: parsed.data.topic },
            { label: "Μήνυμα", value: parsed.data.message },
          ],
          adminUrl: `${getSiteUrl().replace(/\/$/, "")}/admin/concierge`,
          adminLabel: "Απάντηση από το admin",
        }),
      });
    }
  } catch (error) {
    console.error("Failed to send concierge emails", error);
  }

  return NextResponse.json({ ok: true });
}
