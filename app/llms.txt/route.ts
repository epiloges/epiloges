import { connection } from "next/server";
import { buildLlmsText } from "@/lib/seo/llms";

/**
 * /llms.txt — a plain-language map of the shop for language-model crawlers (the
 * llmstxt.org convention): who this is, the terms, where every section lives. Built by
 * lib/seo/llms.ts from the same rows and constants the pages use, so it cannot drift from
 * them. `/llms-full.txt` is the same map with the guides and FAQs inlined.
 */
export async function GET() {
  await connection();
  return new Response(await buildLlmsText(false), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
