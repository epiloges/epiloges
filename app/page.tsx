import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { SplitHero } from "@/components/sections/SplitHero";
import { CategorySpotlight } from "@/components/sections/CategorySpotlight";
import { buildMetadata } from "@/lib/seo";
import { getNavigation, getPublishedProductsByIds, getSeoDefaults, getSiteSettings, getVisibleHomepageSections } from "@/services";
import { localizeProducts } from "@/lib/localize";
import type { Locale } from "@/i18n/config";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeoDefaults();
  return buildMetadata({
    seo,
    title: seo.defaultTitle,
    description: seo.defaultDescription,
    path: "/",
  });
}

export default async function HomePage() {
  const [navigation, settings, sections, locale] = await Promise.all([
    getNavigation(),
    getSiteSettings(),
    getVisibleHomepageSections(),
    getLocale(),
  ]);

  /**
   * The hero renders as the split layout the client chose, but from the CMS "hero" section
   * (SplitHero reads its two panels from it). It, a category grid and a video slot used to be
   * hard-coded placeholders shown INSTEAD of the CMS sections — English copy, stock photos,
   * made-up "24 pieces" counts and a play button that played nothing — so Homepage → Hero and
   * the featured-collections section in the admin changed nothing on the storefront. The
   * featured-collections section now renders from the CMS like every other section.
   *
   * bestSellers gets an override treatment, but for a
   * different reason: it's still the CMS's real title/subtitle/productIds, just rendered as
   * the CategorySpotlight runway (edge-to-edge, no card) between the hero and the category
   * grid instead of the standard card grid further down — the client asked for this
   * specific placement and treatment, reusing the runway ALEXANDRIS's own homepage already
   * had for exactly this purpose.
   */
  const withoutReplacedSections = sections.filter(
    (section) => section.type !== "hero" && section.type !== "bestSellers"
  );
  const heroSection = sections.find((section) => section.type === "hero");
  const newsletterSection = withoutReplacedSections.find((section) => section.type === "newsletter");
  const middleSections = withoutReplacedSections.filter((section) => section.type !== "newsletter");

  const bestSellersSection = sections.find((section) => section.type === "bestSellers");
  const bestSellersProducts =
    bestSellersSection && bestSellersSection.type === "bestSellers"
      ? localizeProducts(await getPublishedProductsByIds(bestSellersSection.data.productIds), locale as Locale)
      : [];

  return (
    <>
      <Header
        navigation={navigation}
        siteName={settings.siteName}
        announcementMessages={settings.announcementMessages}
        // SplitHero now renders full-bleed under the fixed header (no pt-header offset) with
        // its own top scrim, specifically so this can go back to true: white wordmark/icons
        // floating over the photo until scrolled, solid white bar after.
        transparent
      />
      <main id="main" className="flex-1">
        {heroSection && heroSection.type === "hero" ? <SplitHero hero={heroSection.data} /> : null}
        {bestSellersSection && bestSellersSection.type === "bestSellers" && bestSellersProducts.length > 0 ? (
          <CategorySpotlight
            headline={bestSellersSection.data.title}
            eyebrow={bestSellersSection.data.subtitle}
            ctaLabel={bestSellersSection.data.viewAllCta?.label ?? "Shop All"}
            href={bestSellersSection.data.viewAllCta?.href ?? "/new-in"}
            products={bestSellersProducts}
          />
        ) : null}
        {middleSections.map((section) => (
          <SectionRenderer key={section.id} section={section} />
        ))}
        {newsletterSection ? <SectionRenderer section={newsletterSection} /> : null}
      </main>
      <Footer navigation={navigation} settings={settings} />
    </>
  );
}
