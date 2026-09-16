"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { Heart, Eye, Plus } from "lucide-react";
import { ColorSwatches } from "@/components/product/ColorSwatches";
import { QuickViewDialog } from "@/components/product/QuickViewDialog";
import { QuickAddDialog } from "@/components/product/QuickAddDialog";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getEffectivePrice, getProductBadges, getListPrice, isOnSale } from "@/lib/product";
import { SHIMMER_BLUR_DATA_URL } from "@/lib/blur-placeholder";
import { useWishlist } from "@/components/providers/WishlistProvider";
import type { Product } from "@/types";

interface ProductCardProps {
  product: Product;
  className?: string;
  /**
   * Above the fold in a listing. The first row of a category is the page’s Largest
   * Contentful Paint, and a lazy-loaded LCP image is the single most expensive thing a
   * listing can do to itself — the browser will not even request it until layout is done.
   * `"priority"` preloads (first two cards, the mobile first row); `"eager"` just skips
   * lazy-loading (the rest of the first desktop row).
   */
  loading?: "priority" | "eager";
}

const CARD_SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, 50vw";

/** Plain uppercase text, no coloured pill — the label row lives below the photo now (see
 * the layout comment on the row itself), so a badge no longer has to read as a sticker
 * fighting for attention against the image underneath it. Sale/low-stock stay in the
 * destructive colour because that's information worth the emphasis; the rest are neutral. */
const LABEL_STYLES: Record<string, string> = {
  sale: "text-destructive",
  "low-stock": "text-destructive",
  new: "text-luxe-gray-dark",
  preorder: "text-luxe-gray-dark",
  backorder: "text-luxe-gray-dark",
  bestseller: "text-luxe-gray-dark",
};

export function ProductCard({ product, className, loading }: ProductCardProps) {
  const tBadge = useTranslations("ProductBadge");
  const tCard = useTranslations("ProductCard");
  const { isInWishlist, toggle } = useWishlist();
  const wishlisted = isInWishlist(product.id);
  const [quickViewOpen, setQuickViewOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const [primaryImage, hoverImage] = product.images;
  const badges = getProductBadges(product);
  const effectivePrice = getEffectivePrice(product);
  const productHref = `/products/${product.slug}`;

  // Scroll-snap reports position as scroll offset, not an index; a product with one photo
  // never fires this at all, which is exactly what we want (no dots to keep in sync).
  function handleStripScroll() {
    const el = stripRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveImage(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className={cn("group relative", className)}>
      <div className="relative aspect-3/4 overflow-hidden bg-luxe-gray-light">
        {/* Mobile: swipe through every photo on the card itself — no need to open the
            product just to see the back or a detail shot. Desktop keeps the hover
            crossfade below instead, since there's no swipe gesture to reach for with a
            mouse and hover already does the job. */}
        <div
          ref={stripRef}
          onScroll={handleStripScroll}
          className="flex size-full snap-x snap-mandatory overflow-x-auto md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {product.images.map((image, index) => (
            <Link
              key={image.src}
              href={productHref}
              aria-label={product.name}
              className="relative block size-full shrink-0 snap-center"
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes={CARD_SIZES}
                preload={loading === "priority" && index === 0}
                fetchPriority={loading === "priority" && index === 0 ? "high" : undefined}
                loading={loading === "eager" && index === 0 ? "eager" : undefined}
                placeholder="blur"
                blurDataURL={SHIMMER_BLUR_DATA_URL}
                className="object-cover"
              />
            </Link>
          ))}
        </div>
        {product.images.length > 1 ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1 md:hidden">
            {product.images.map((image, index) => (
              <span
                key={image.src}
                className={cn(
                  "size-1.5 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.15)] transition-colors",
                  index === activeImage ? "bg-luxe-white" : "bg-luxe-white/50"
                )}
              />
            ))}
          </div>
        ) : null}

        <Link href={productHref} aria-label={product.name} className="relative hidden size-full md:block">
          <Image
            src={primaryImage.src}
            alt={primaryImage.alt}
            fill
            // Two columns up to `lg`, three from `lg`, four from `xl` — must track the
            // listing grid's breakpoints (ProductListingPage) or the fetched image is
            // smaller than the box it renders into.
            sizes={CARD_SIZES}
            preload={loading === "priority"}
            fetchPriority={loading === "priority" ? "high" : undefined}
            loading={loading === "eager" ? "eager" : undefined}
            placeholder="blur"
            blurDataURL={SHIMMER_BLUR_DATA_URL}
            className={cn(
              "object-cover transition-opacity duration-500",
              hoverImage ? "group-hover:opacity-0" : ""
            )}
          />
          {hoverImage ? (
            <Image
              src={hoverImage.src}
              alt={hoverImage.alt}
              fill
              sizes={CARD_SIZES}
              placeholder="blur"
              blurDataURL={SHIMMER_BLUR_DATA_URL}
              className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          ) : null}
        </Link>

        <button
          type="button"
          onClick={() => setQuickViewOpen(true)}
          className="absolute inset-x-3 bottom-3 hidden h-10 translate-y-2 items-center justify-center gap-2 bg-luxe-white text-xs font-medium tracking-[0.08em] text-luxe-black uppercase opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 md:flex"
        >
          <Eye className="size-4" strokeWidth={1.5} />
          {tCard("quickView")}
        </button>
      </div>

      {/* Everything that used to sit on top of the photo — badges, wishlist, quick-add —
          moved into this row underneath it instead: a clean image plus a compact label/
          icon line, the shape a modern listing card reads as now rather than a photo with
          stickers on it. */}
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
          {badges.map((badge) => (
            <span key={badge.tone} className={cn("text-[10px] font-medium tracking-[0.1em] uppercase", LABEL_STYLES[badge.tone])}>
              {tBadge(badge.key)}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            aria-label={wishlisted ? tCard("removeFromWishlist") : tCard("addToWishlist")}
            onClick={() => toggle(product.id)}
            className="flex size-6 items-center justify-center text-luxe-black"
          >
            <Heart className={cn("size-[18px]", wishlisted ? "fill-luxe-black" : "")} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label={tCard("quickAdd")}
            onClick={() => setQuickAddOpen(true)}
            className="flex size-6 items-center justify-center text-luxe-black md:hidden"
          >
            <Plus className="size-[18px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="mt-1">
        <Link href={productHref} className="block text-sm">
          {product.name}
        </Link>
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className={isOnSale(product) ? "text-destructive" : ""}>{formatMoney(effectivePrice)}</span>
          {isOnSale(product) ? (
            <span className="text-luxe-gray-dark line-through">{formatMoney(getListPrice(product))}</span>
          ) : null}
        </div>
        <ColorSwatches colors={product.colors} className="mt-2" />
      </div>

      <QuickViewDialog product={product} open={quickViewOpen} onOpenChange={setQuickViewOpen} />
      <QuickAddDialog product={product} open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
