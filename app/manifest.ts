import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/services";
import { storeName } from "@/constants/company";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings();

  return {
    name: `${storeName()} — ${settings.tagline}`,
    short_name: settings.siteName,
    description: settings.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#3d1155",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
