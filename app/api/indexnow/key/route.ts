import { connection } from "next/server";
import { indexNowKey } from "@/lib/indexnow";

/** Proves ownership of the host to IndexNow — see lib/indexnow.ts. 404 until a key is configured. */
export async function GET() {
  await connection();
  const key = indexNowKey();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
