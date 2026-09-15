import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Brand, BrandStripSection } from "@/types";

interface BrandStripProps {
  data: BrandStripSection["data"];
}

/**
 * The brands the shop stocks, set as one uniform row.
 *
 * Deliberately typographic rather than a wall of official logo files. Eight logos gathered
 * from eight sources arrive at eight different weights, colours, aspect ratios and optical
 * sizes — one is a navy wordmark, one is a black monogram, one has a registered-trademark
 * bug the size of the letters — and lining them up is a losing fight that ends with a strip
 * that reads as clip art. Setting the names in the shop's own face makes them a set by
 * construction, which is the thing that actually looks expensive.
 *
 * A real logo can still be dropped into any entry (`brand.logo`) once a brand supplies one;
 * it is then normalised to the same optical height and the same muted treatment as the
 * wordmarks, so mixing the two does not break the row.
 */
function BrandMark({ brand, index }: { brand: Brand; index: number }) {
  const content = brand.logo ? (
    // Plain <img>, not next/image: this renders whatever URL is in the CMS, and an
    // unconfigured host makes next/image throw fatally instead of degrading — it would take
    // the homepage down. A logo that fails to load here is just a gap.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={brand.logo}
      alt={brand.logoAlt ?? brand.name}
      // The uniformity trick: one height for every logo, contained rather than cropped, and
      // desaturated so a brand's house colour cannot shout over its neighbours.
      className="h-6 w-auto max-w-[140px] object-contain opacity-60 grayscale transition-all duration-300 group-hover:opacity-100 group-hover:grayscale-0 md:h-7"
    />
  ) : (
    <span className="font-heading text-xs tracking-[0.12em] whitespace-nowrap text-luxe-gray-dark uppercase transition-colors duration-300 group-hover:text-luxe-black md:text-lg md:tracking-[0.18em]">
      {brand.name}
    </span>
  );

  const className = "group flex h-10 items-center justify-center md:h-12";

  // Same rule as the social tiles: no link at all beats a link that goes nowhere.
  return brand.href ? (
    <div className="reveal" style={{ "--reveal-i": index % 6 } as React.CSSProperties}>
      <Link href={brand.href} className={className}>
        {content}
      </Link>
    </div>
  ) : (
    <div className={cn("reveal", className)} style={{ "--reveal-i": index % 6 } as React.CSSProperties}>
      {content}
    </div>
  );
}

export function BrandStrip({ data }: BrandStripProps) {
  if (data.brands.length === 0) return null;

  return (
    <section className="border-y border-border py-14 md:py-20">
      <div className="container-luxe">
        {data.title || data.subtitle ? (
          <div className="mb-10 text-center md:mb-14">
            {data.title ? (
              <h2 className="font-heading text-2xl md:text-3xl">{data.title}</h2>
            ) : null}
            {data.subtitle ? <p className="mt-2 text-sm text-luxe-gray-dark">{data.subtitle}</p> : null}
          </div>
        ) : null}

        {/*
          Wrapping flex rather than a fixed grid. The brand list is CMS-editable, so the
          layout has to stay balanced at seven brands or at nine — a `grid-cols-4` looks
          deliberate at eight and broken at five.
        */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 md:gap-x-16 md:gap-y-8">
          {data.brands.map((brand, index) => (
            <BrandMark key={brand.name} brand={brand} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
