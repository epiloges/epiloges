"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { SEO_CACHE_TAG, saveSeoDefaults } from "@/services/seo";
import { firstIssueMessage, siteSeoDefaultsSchema } from "@/lib/validation/site-content";
import type { SiteSeoDefaults } from "@/types";

export interface SiteContentActionState {
  error?: string;
}

export async function saveSeoDefaultsAction(seo: SiteSeoDefaults): Promise<SiteContentActionState> {
  await requireCapability("admin:settings");
  const parsed = siteSeoDefaultsSchema.safeParse(seo);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  await saveSeoDefaults(parsed.data);
  await recordAdminAction({
    action: "settings.updated",
    targetType: "settings",
    targetId: "seo",
    summary: `Updated the SEO defaults (site URL ${parsed.data.siteUrl})`,
  });
  revalidatePath("/", "layout");
  // Cached in the root layout (PERF-002 tier 1); without this the new title and description
  // would not appear until the TTL expired.
  updateTag(SEO_CACHE_TAG);
  return {};
}
