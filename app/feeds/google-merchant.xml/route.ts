import { connection } from "next/server";
import { buildGoogleMerchantFeed } from "@/services/feeds";

/** Google Merchant Center feed — see services/feeds.ts. Same caching as the Skroutz feed. */
export async function GET() {
  await connection();
  const xml = await buildGoogleMerchantFeed();
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
