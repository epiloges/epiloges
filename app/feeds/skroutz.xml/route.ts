import { connection } from "next/server";
import { buildSkroutzFeed } from "@/services/feeds";

/**
 * Skroutz / BestPrice product feed. Public by design — comparison engines fetch it on a
 * schedule, with no credentials. Cached at the CDN for an hour, which is tighter than any
 * of them poll; `stale-while-revalidate` keeps a fetch that lands on the hour fast.
 */
export async function GET() {
  // A GET handler with no dynamic read is attempted as a prerender at build; the feed must
  // reflect the live catalogue on every fetch.
  await connection();
  const xml = await buildSkroutzFeed();
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
