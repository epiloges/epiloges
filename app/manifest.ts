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
    theme_color: "#111111",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      // Android's home-screen icon: a raster, since not every launcher takes an SVG.
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
