import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { isOptimizableImageUrl } from "@/lib/image-hosts";
import { IMAGE_DEFAULT_QUALITY, IMAGE_WIDTHS } from "@/lib/image-sizes";

/**
 * The shop's own image optimizer — see lib/image-loader.ts for why it exists.
 *
 * Accepts only hosts `next/image` is configured for (the same allowlist, so this cannot be
 * used to proxy arbitrary URLs) and only widths on the fixed ladder. Output is always WebP,
 * which every browser this shop supports decodes, so the CDN needs no `Vary: Accept` and
 * one cached object serves everyone. A year-long immutable cache: an upload never changes
 * in place — the Media Library gives a replacement a new URL.
 *
 * Failure mode is a redirect to the original file rather than an error: a broken optimizer
 * must never mean a broken product photo, which is exactly the incident that turned the
 * previous optimizer off.
 */
export const maxDuration = 20;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("u") ?? "";
  const width = Number(searchParams.get("w"));
  const quality = Number(searchParams.get("q") ?? IMAGE_DEFAULT_QUALITY);

  if (!isOptimizableImageUrl(source)) return bad("Host not allowed");
  if (!IMAGE_WIDTHS.includes(width as (typeof IMAGE_WIDTHS)[number])) return bad("Width not allowed");
  if (!Number.isInteger(quality) || quality < 30 || quality > 90) return bad("Quality not allowed");

  try {
    const upstream = await fetch(source, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!upstream.ok) return NextResponse.redirect(source, 302);
    const length = Number(upstream.headers.get("content-length") ?? 0);
    if (length > MAX_SOURCE_BYTES) return NextResponse.redirect(source, 302);
    const input = Buffer.from(await upstream.arrayBuffer());

    const output = await sharp(input, { failOn: "none", animated: false })
      .rotate() // honour EXIF orientation, then drop the tag
      .resize({ width, withoutEnlargement: true, fastShrinkOnLoad: true })
      .webp({ quality, effort: 4 })
      .toBuffer();

    return new NextResponse(output, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(output.byteLength),
        "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[img] optimisation failed, serving original", source, error instanceof Error ? error.message : error);
    return NextResponse.redirect(source, 302);
  }
}
