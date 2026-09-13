import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";
import { recordAdminAction } from "@/services/audit-log";
import { getNewsletterSubscribers } from "@/services/newsletter";

/** The list as CSV, for a mailing tool. The "Export CSV" button used to do nothing at all. */
export async function GET() {
  try {
    await requireCapability("orders:view");
    const subscribers = await getNewsletterSubscribers();
    const lines = ["email,source,subscribedAt", ...subscribers.map((s) => [s.email, s.source ?? "", s.subscribedAt].map(csvCell).join(","))];
    // Exporting every address is a bulk personal-data read; the trail should show it happened.
    await recordAdminAction({
      action: "dataSubject.exported",
      targetType: "customer",
      targetId: "newsletter:all",
      summary: `Exported the newsletter list (${subscribers.length} addresses)`,
    });
    return new Response(`\uFEFF${lines.join("\n")}\n`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="newsletter-subscribers.csv"',
      },
    });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
