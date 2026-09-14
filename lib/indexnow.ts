import "server-only";
import { getSiteUrl } from "@/lib/site-url";

/**
 * IndexNow — tells Bing (and through it, everything built on Bing's index, ChatGPT search
 * included), Yandex, Seznam and Naver that a URL changed, the moment it changed. Google
 * does not take part; for Google the sitemap's real `lastmod` is the signal.
 *
 * A shoe shop's URLs change constantly — a size sells out, a price drops, a product is
 * archived — and waiting for a recrawl means a search result quoting last week's price.
 *
 * Off until INDEXNOW_KEY is set: a random string of 8–128 hex characters (`openssl rand
 * -hex 16` will do). The key is proven by serving it at /api/indexnow/key, which the
 * submission names as `keyLocation`, so no file has to be committed. Never throws — a
 * failed ping is a log line, not a failed admin save.
 */
const ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && /^[a-zA-Z0-9-]{8,128}$/.test(key) ? key : null;
}

export async function notifyIndexNow(paths: string[]): Promise<void> {
  const key = indexNowKey();
  if (!key || paths.length === 0) return;
  const site = getSiteUrl().replace(/\/$/, "");
  const host = new URL(site).host;
  // Only ever a production host: a preview deployment pinging its own vercel.app URLs
  // would ask search engines to index pages nobody should find.
  if (/\.vercel\.app$/.test(host) || host.startsWith("localhost")) return;
  const urlList = [...new Set(paths)].slice(0, 10_000).map((path) => `${site}${path.startsWith("/") ? path : `/${path}`}`);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${site}/api/indexnow/key`, urlList }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok && response.status !== 202) {
      console.warn("[indexnow] rejected", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    console.warn("[indexnow] failed", error instanceof Error ? error.message : error);
  }
}
