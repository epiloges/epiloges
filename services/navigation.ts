import "server-only";
import navigationFallback from "@/data/navigation.json";
import { getSiteContentCached, setSiteContent } from "@/lib/site-content";
import type { NavigationConfig } from "@/types";

export async function getNavigation(): Promise<NavigationConfig> {
  return getSiteContentCached<NavigationConfig>("navigation", navigationFallback as NavigationConfig);
}

export async function saveNavigation(navigation: NavigationConfig): Promise<void> {
  await setSiteContent<NavigationConfig>("navigation", navigation);
}
