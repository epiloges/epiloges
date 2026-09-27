"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { fadeUp, viewportOnce } from "@/constants/animation";
import type { HeroSection } from "@/types/homepage";

interface SplitHeroPanel {
  eyebrow: string;
  headline: string;
  ctaLabel: string;
  href: string;
  image: { src: string; alt: string };
}

/**
 * The shop is women's-only — there is no men's line, so the two panels split by occasion
 * (new season pieces vs. curated complete looks) rather than by a gender the catalog
 * doesn't carry.
 *
 * Both photos are already live elsewhere on this site (the wool trench coat is the site's
 * own hero image; the knitwear flat-lay is used in Everyday Essentials) — reused
 * deliberately rather than picked fresh, so these placeholders are proven to load rather
 * than a new, unverified URL.
 */
/**
 * The two halves, from the homepage editor's Hero section: the left from its image, eyebrow,
 * headline and primary button; the right from its "second panel" fields and secondary button.
 *
 * These panels used to be written into this file — English copy and stock photos — and the
 * page rendered them INSTEAD of the Hero section, so nothing edited under Homepage → Hero ever
 * reached the storefront. A second panel without an image and a headline is left out, and the
 * first then spans the full width.
 */
export function heroPanels(hero: HeroSection["data"]): SplitHeroPanel[] {
  const panels: SplitHeroPanel[] = [];
  if (hero.image?.src && hero.headline) {
    panels.push({
      eyebrow: hero.eyebrow ?? "",
      headline: hero.headline,
      ctaLabel: hero.primaryCta?.label ?? "",
      href: hero.primaryCta?.href || "/new-in",
      image: hero.image,
    });
  }
  const second = hero.secondaryPanel;
  if (second?.image?.src && second.headline) {
    panels.push({
      eyebrow: second.eyebrow ?? "",
      headline: second.headline,
      ctaLabel: hero.secondaryCta?.label ?? "",
      href: hero.secondaryCta?.href || "/collections",
      image: { src: second.image.src, alt: second.image.alt || second.headline },
    });
  }
  return panels;
}

export function SplitHero({ hero }: { hero: HeroSection["data"] }) {
  const panels = heroPanels(hero);
  if (panels.length === 0) return null;
  return (
    // No `pt-header`: the header renders `transparent` on this page (see app/page.tsx), so
    // these panels need to run full-bleed up under it rather than start below it — that's
    // the whole point of the white-on-photo treatment. The announcement bar above the header
    // stays opaque regardless and simply overlaps the very top of the image, same as before.
    <section className={`grid grid-cols-1 gap-px bg-border ${panels.length > 1 ? "md:grid-cols-2" : ""}`}>
      {panels.map((panel, index) => (
        <Link
          key={`${index}:${panel.href}`}
          href={panel.href}
          // Taller from lg (1024px) up only, per request — md (tablet, 768-1023px) and mobile
          // heights are untouched.
          className="group relative flex h-[420px] items-end overflow-hidden bg-luxe-black md:h-[560px] lg:h-[720px]"
        >
          <Image
            src={panel.image.src}
            alt={panel.image.alt}
            fill
            priority={index === 0}
            sizes={panels.length > 1 ? "(min-width: 768px) 50vw, 100vw" : "100vw"}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          {/* Bottom-weighted scrim rather than a flat overlay — keeps the top of each photo
              true to itself and only darkens where the caption actually sits. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-luxe-black/80 via-luxe-black/15 to-transparent" />
          {/* Separate, short top scrim — purely so the transparent header's white wordmark
              and icons stay readable over whatever happens to be at the top of the photo
              (sky, pale stone, fabric), independent of the bottom scrim that serves the
              caption instead. Fades out well above the caption so it never doubles up. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-luxe-black/55 to-transparent md:h-32" />

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            transition={{ delay: index * 0.1 }}
            className="relative p-8 text-luxe-white md:p-10"
          >
            {panel.eyebrow ? <p className="text-eyebrow text-luxe-white/80">{panel.eyebrow}</p> : null}
            <h2 className="font-heading mt-3 text-3xl font-semibold whitespace-pre-line md:text-4xl">{panel.headline}</h2>
            {panel.ctaLabel ? (
              <span className="mt-5 inline-flex items-center border-b border-luxe-white/70 pb-1 text-xs font-semibold tracking-[0.14em] uppercase transition-opacity group-hover:opacity-70">
                {panel.ctaLabel}
              </span>
            ) : null}
          </motion.div>
        </Link>
      ))}
    </section>
  );
}
