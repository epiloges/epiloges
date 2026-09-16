"use client";

import type { ImageLoaderProps } from "next/image";
import { IMAGE_WIDTHS } from "@/lib/image-sizes";

/**
 * `next/image` loader pointing at the shop's own optimizer (app/api/img/route.ts).
 *
 * Vercel's optimizer is off — its transformation quota was exhausted and every product
 * photo on the live shop came back 402 — so `next/image` had been emitting the original
 * files: 300–400 KB JPEGs on a homepage that weighed 3 MB, LCP over 6 s on mobile, and a
 * failing Core Web Vitals assessment on a shop whose ranking depends on it.
 *
 * This route resizes with sharp and serves WebP, cached at the CDN for a year, so each
 * size of each image is computed once. Widths snap to a fixed ladder so a stray `w=`
 * cannot mint a fresh cache entry per request.
 *
 * Runs in the browser (a loader is client code), hence no server imports here.
 */
export default function imageLoader({ src, width, quality }: ImageLoaderProps): string {
  // Data URIs and SVGs are not worth a round trip; the optimizer would refuse them anyway.
  // Local /public files (single leading slash, not the protocol-relative "//host/path" form)
  // are already served straight from the CDN — routing them through /api/img just gets them
  // rejected by its remote-host allowlist, since a root-relative path isn't a parseable URL.
  if (src.startsWith("data:") || /\.svg(\?|$)/i.test(src) || (src.startsWith("/") && !src.startsWith("//"))) {
    return src;
  }
  const snapped = IMAGE_WIDTHS.find((step) => step >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
  const params = new URLSearchParams({ u: src, w: String(snapped) });
  if (quality && quality !== 75) params.set("q", String(quality));
  return `/api/img?${params.toString()}`;
}
