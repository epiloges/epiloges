"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";

/**
 * Removes one subscriber. Until now the only way to take someone off the list from the
 * admin was the full GDPR erasure — which also deletes their account, wishlist and
 * reviews. "Please stop emailing me" is a smaller request than that.
 */
export async function removeNewsletterSubscriber(id: string): Promise<void> {
  await requireCapability("orders:manage");
  const row = await prisma.newsletterSubscriber.findUnique({ where: { id }, select: { email: true } });
  if (!row) return;
  await prisma.newsletterSubscriber.delete({ where: { id } });
  await recordAdminAction({
    action: "settings.updated",
    targetType: "customer",
    targetId: `newsletter:${maskEmail(row.email)}`,
    summary: `Removed ${maskEmail(row.email)} from the newsletter`,
  });
  revalidatePath("/admin/newsletter");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain ?? ""}`;
}
