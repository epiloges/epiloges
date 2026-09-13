"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { saveSiteSettings } from "@/services/settings";
import { firstIssueMessage, siteSettingsSchema } from "@/lib/validation/site-content";
import type { SiteSettings } from "@/types";

export interface SiteContentActionState {
  error?: string;
}

export async function saveSiteSettingsAction(settings: SiteSettings): Promise<SiteContentActionState> {
  await requireCapability("admin:settings");
  const parsed = siteSettingsSchema.safeParse(settings);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  await saveSiteSettings(parsed.data);
  await recordAdminAction({
    action: "settings.updated",
    targetType: "settings",
    targetId: "site",
    summary: "Updated the site settings",
    metadata: { siteName: parsed.data.siteName, announcements: parsed.data.announcementMessages.length },
  });
  revalidatePath("/", "layout");
  return {};
}
