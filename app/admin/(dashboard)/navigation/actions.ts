"use server";

import { revalidatePath, updateTag } from "next/cache";
import { siteContentTag } from "@/lib/site-content";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { saveNavigation } from "@/services/navigation";
import { firstIssueMessage, navigationConfigSchema } from "@/lib/validation/site-content";
import type { NavigationConfig } from "@/types";

export interface SiteContentActionState {
  error?: string;
}

export async function saveNavigationAction(navigation: NavigationConfig): Promise<SiteContentActionState> {
  await requireCapability("content:navigation");
  const parsed = navigationConfigSchema.safeParse(navigation);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  await saveNavigation(parsed.data as NavigationConfig);
  updateTag(siteContentTag("navigation"));
  await recordAdminAction({
    action: "settings.updated",
    targetType: "settings",
    targetId: "navigation",
    summary: `Updated the navigation menu (${parsed.data.primary.length} main items)`,
  });
  revalidatePath("/", "layout");
  return {};
}
