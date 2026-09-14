"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { saveSiteSettings } from "@/services/settings";
import { setMaintenanceMode } from "@/services/maintenance";
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

/**
 * The dashboard's maintenance switch. Audited because it is the one setting whose effect is
 * "nobody can buy anything" — when the shop is found closed, the log should say who closed it.
 */
export async function setMaintenanceModeAction(enabled: boolean): Promise<SiteContentActionState> {
  const session = await requireCapability("admin:settings");
  const state = await setMaintenanceMode(enabled, session.name);
  await recordAdminAction({
    action: "settings.maintenance_toggled",
    targetType: "settings",
    targetId: "maintenance",
    summary: enabled ? "Closed the shop for maintenance" : "Reopened the shop",
    metadata: { enabled, changedAt: state.changedAt },
  });
  revalidatePath("/admin");
  return {};
}
