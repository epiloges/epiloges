"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { formatMoney } from "@/lib/format";
import { getEffectivePrice, getListPrice, isOnSale } from "@/lib/product";
import type { Product } from "@/types";

interface CategorySpotlightProps {
  eyebrow?: string;
  headline: string;
  ctaLabel: string;
  href: string;
  products: Product[];
}

/**
 * The runway: one row of the category's newest pieces, each photograph the height of most
 * of the screen, edge to edge with nothing between them — no card, no border, no caption
 * until the pointer rests on one. The contrast with the rest of the homepage is scale.
 * Everything else about it (white ground, the small caps, the hairline rule) is the same
 * language as the page around it.
 *
 * Product photographs are shot on white, so with no gap the row reads as one continuous
 * white runway with the boots standing along it — the effect depends on that, which is why
 * there is no background colour and no gap to tune.
 */
export function CategorySpotlight({ eyebrow, headline, ctaLabel, href, products }: CategorySpotlightProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  // Same edge test as CarouselScroller: measured from where the first and last pieces sit.
  const syncEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-runway-item]");
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const bounds = el.getBoundingClientRect();
    setAtStart(first.getBoundingClientRect().left >= bounds.left - 1);
    setAtEnd(last.getBoundingClientRect().right <= bounds.right + 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncEdges();
    el.addEventListener("scroll", syncEdges, { passive: true });
    const observer = new ResizeObserver(syncEdges);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", syncEdges);
      observer.disconnect();
    };
  }, [syncEdges]);

  const scrollByOne = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const width = el.querySelector<HTMLElement>("[data-runway-item]")?.clientWidth ?? 400;
    el.scrollBy({ left: direction * width, behavior: "smooth" });
  };

  if (products.length === 0) return null;

  return (
    <section className="bg-luxe-white py-12 md:py-16" aria-labelledby="category-spotlight-heading">
      {/* Same header as a New Arrivals row — serif title, the link beside it — so the two
          sections read as siblings; only the row beneath is different. */}
      <div className="container-luxe mb-6">
        <div className="flex items-baseline gap-4">
          <h2 id="category-spotlight-heading" className="font-heading text-xl md:text-2xl">
            {headline}
          </h2>
          <Link
            href={href}
            className="text-xs tracking-[0.05em] text-luxe-gray-dark underline-offset-4 uppercase transition-colors hover:text-luxe-black hover:underline"
          >
            {ctaLabel}
          </Link>
        </div>
        {eyebrow ? <p className="mt-1 text-sm text-luxe-gray-dark">{eyebrow}</p> : null}
      </div>

      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <RunwayItem key={product.id} product={product} />
          ))}
        </div>

        {/* Arrows on the row, hidden at the edge where they would do nothing. */}
        {!atStart ? (
          <button
            type="button"
            onClick={() => scrollByOne(-1)}
            aria-label="Προηγούμενο"
            className="absolute top-1/2 left-4 hidden size-11 -translate-y-1/2 items-center justify-center bg-luxe-white/90 text-luxe-black shadow-sm transition-colors hover:bg-luxe-black hover:text-luxe-white md:flex"
          >
            <ChevronLeft className="size-5" strokeWidth={1.5} />
          </button>
        ) : null}
        {!atEnd ? (
          <button
            type="button"
            onClick={() => scrollByOne(1)}
            aria-label="Επόμενο"
            className="absolute top-1/2 right-4 hidden size-11 -translate-y-1/2 items-center justify-center bg-luxe-white/90 text-luxe-black shadow-sm transition-colors hover:bg-luxe-black hover:text-luxe-white md:flex"
          >
            <ChevronRight className="size-5" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RunwayItem({ product }: { product: Product }) {
  const image = product.images[0];
  // Catalogue names end in " - κωδικός 2326" for the feeds; here the code is noise.
  const label = product.name.replace(/\s*[-–]\s*κωδικός.*$/i, "");
  const price = getEffectivePrice(product);
  const sale = isOnSale(product);

  return (
    <Link
      href={ROUTES.product(product.slug)}
      data-runway-item
      className="group relative block aspect-[3/4] w-[80vw] shrink-0 snap-start overflow-hidden bg-luxe-white sm:w-[50vw] lg:w-[36vw] xl:w-[30vw]"
    >
      {image ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 1280px) 30vw, (min-width: 1024px) 36vw, (min-width: 640px) 50vw, 80vw"
          // Scaled past the frame so the shoe, not the studio margin around it, fills the
          // photograph; the hover carries it a little further.
          className="scale-[1.12] object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.18]"
        />
      ) : null}
      {/* The caption — set exactly like the name and price under a product card, so the
          runway and the arrivals row read as the same catalogue. Only on hover or focus,
          and always on a screen that cannot hover. */}
      <span className="absolute bottom-5 left-5 flex max-w-[80%] flex-col font-sans opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
        <span className="text-sm">{label}</span>
        <span className="mt-1 flex items-center gap-2 text-sm">
          <span className={sale ? "text-destructive" : ""}>{formatMoney(price)}</span>
          {sale ? <span className="text-luxe-gray-dark line-through">{formatMoney(getListPrice(product))}</span> : null}
        </span>
      </span>
    </Link>
  );
}
