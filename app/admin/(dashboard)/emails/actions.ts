"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { capabilityDenied } from "@/lib/admin-session";
import { getEmailProvider } from "@/lib/email";
import { REDACTED_TOKEN } from "@/lib/email/pipeline";
import type { EmailTemplate } from "@/lib/email/types";
import { recordAdminAction } from "@/services/audit-log";

export interface ResendEmailState {
  error?: string;
  success?: string;
}

/**
 * Sends a logged email again, exactly as rendered — the retry for a failed send, or a
 * "the customer says it never arrived" re-send of a good one. A new row is written for
 * the new attempt; the original stays as the record of what happened first time.
 */
export async function resendLoggedEmail(id: string): Promise<ResendEmailState> {
  const denied = await capabilityDenied("orders:manage");
  if (denied) return { error: denied };

  const row = await prisma.emailLog.findUnique({ where: { id } });
  if (!row) return { error: "That email is no longer in the log." };
  // The stored copy has its one-time link removed (lib/email/pipeline.ts), so resending it
  // would deliver a dead link. The customer can request a fresh one themselves.
  if (row.html.includes(`token=${REDACTED_TOKEN}`)) {
    return { error: "This email contained a one-time link, which isn't kept. Ask the customer to request a new one from the site." };
  }

  try {
    const outcome = await getEmailProvider().send({
      to: row.to,
      subject: row.subject,
      html: row.html,
      text: row.text,
      template: row.template as EmailTemplate,
      // A fresh key: the original may have been sent with one, and re-using it would make
      // the provider deduplicate this deliberate re-send into nothing.
      idempotencyKey: `resend:${row.id}:${Date.now()}`,
    });
    await recordAdminAction({
      action: "email.resent",
      targetType: "email",
      targetId: row.id,
      summary: `Re-sent "${row.subject}" (${row.template})`,
      metadata: { status: outcome.status },
    });
    revalidatePath("/admin/emails");
    return outcome.status === "skipped"
      ? { error: `Not sent: ${outcome.reason ?? "the recipient is not deliverable"}.` }
      : { success: "Sent again." };
  } catch (error) {
    revalidatePath("/admin/emails");
    return { error: error instanceof Error ? error.message : "The send failed again." };
  }
}
