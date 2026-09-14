/**
 * The only widths the optimizer will produce. Shared by the client loader (which snaps
 * requests to this ladder) and the route (which refuses anything off it), so the CDN cache
 * holds at most this many variants per image, however the query string is written.
 *
 * Matches next/image's own device + image size ladder closely enough that its generated
 * srcset lands on real entries rather than rounding every one up to the same width.
 */
export const IMAGE_WIDTHS = [96, 160, 256, 384, 480, 640, 750, 828, 1080, 1200, 1600] as const;
export const IMAGE_MAX_WIDTH = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
export const IMAGE_DEFAULT_QUALITY = 75;
