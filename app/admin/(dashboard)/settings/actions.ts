"use server";

import { revalidatePath, updateTag } from "next/cache";
import { siteContentTag } from "@/lib/site-content";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { getRawSiteSettings, saveSiteSettings } from "@/services/settings";
import { setMaintenanceMode, setMaintenancePin } from "@/services/maintenance";
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
  updateTag(siteContentTag("settings"));
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

/** The dashboard's quick switch for the TikTok Live popup — same one field the Site Settings
 * form edits, just reachable without leaving the dashboard right before a merchant goes live. */
export async function setTikTokLiveAction(enabled: boolean): Promise<SiteContentActionState> {
  await requireCapability("admin:settings");
  const current = await getRawSiteSettings();
  const parsed = siteSettingsSchema.safeParse({ ...current, liveOnTikTok: enabled });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  await saveSiteSettings(parsed.data);
  updateTag(siteContentTag("settings"));
  await recordAdminAction({
    action: "settings.updated",
    targetType: "settings",
    targetId: "site",
    summary: enabled ? "Turned on the TikTok Live popup" : "Turned off the TikTok Live popup",
    metadata: { liveOnTikTok: enabled },
  });
  revalidatePath("/", "layout");
  revalidatePath("/admin");
  return {};
}

/** The tester PIN on the "back soon" page. Changing it logs out everyone who used the old one. */
export async function setMaintenancePinAction(pin: string): Promise<SiteContentActionState> {
  await requireCapability("admin:settings");
  const cleaned = pin.trim();
  if (!/^\d{4}$/.test(cleaned)) return { error: "The PIN must be exactly four digits." };
  await setMaintenancePin(cleaned);
  await recordAdminAction({
    action: "settings.maintenance_toggled",
    targetType: "settings",
    targetId: "maintenance",
    summary: "Changed the maintenance-mode tester PIN",
  });
  revalidatePath("/admin");
  return {};
}
