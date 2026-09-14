import { connection } from "next/server";
import { buildLlmsText } from "@/lib/seo/llms";

/**
 * /llms-full.txt — llms.txt with the content inlined: every category and brand guide, every
 * FAQ, the shipping and returns pages. One fetch answers "do they have cowboy boots in a
 * 38" or "what is the return window" without a crawl. See lib/seo/llms.ts.
 */
export async function GET() {
  await connection();
  return new Response(await buildLlmsText(true), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
