import "server-only";
import homepageFallback from "@/data/homepage.json";
import { getSiteContent, getSiteContentCached, setSiteContent } from "@/lib/site-content";
import type { HomepageConfig, HomepageSection } from "@/types";

export async function getHomepageConfig(): Promise<HomepageConfig> {
  return getSiteContent<HomepageConfig>("homepage", homepageFallback as HomepageConfig);
}

/** Enabled sections, sorted for rendering — this is the exact ordering the admin editor mutates. Cached; the publish action updates the tag. */
export async function getVisibleHomepageSections(): Promise<HomepageSection[]> {
  const homepage = await getSiteContentCached<HomepageConfig>("homepage", homepageFallback as HomepageConfig);
  return [...homepage.sections]
    .filter((section) => section.enabled)
    .sort((a, b) => a.order - b.order);
}

export async function saveHomepageSections(sections: HomepageSection[]): Promise<void> {
  await setSiteContent<HomepageConfig>("homepage", { sections });
}
