"use server";

import { revalidatePath, updateTag } from "next/cache";
import { siteContentTag } from "@/lib/site-content";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { saveHomepageSections } from "@/services/homepage";
import { firstIssueMessage, homepageSectionsSchema } from "@/lib/validation/site-content";
import type { HomepageSection } from "@/types";

export interface SiteContentActionState {
  error?: string;
}

/**
 * Validated before it goes live: this publishes straight to the homepage, and a hero
 * with no image or headline used to publish just as readily as a complete one.
 */
export async function publishHomepageSections(sections: HomepageSection[]): Promise<SiteContentActionState> {
  await requireCapability("content:publish");
  const parsed = homepageSectionsSchema.safeParse(sections);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  await saveHomepageSections(parsed.data as HomepageSection[]);
  updateTag(siteContentTag("homepage"));
  await recordAdminAction({
    action: "settings.updated",
    targetType: "settings",
    targetId: "homepage",
    summary: `Published the homepage (${parsed.data.filter((s) => s.enabled).length} of ${parsed.data.length} sections enabled)`,
    metadata: { sections: parsed.data.map((s) => ({ id: s.id, type: s.type, enabled: s.enabled })) },
  });
  revalidatePath("/", "layout");
  return {};
}
