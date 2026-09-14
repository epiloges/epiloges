import "server-only";
import { fetch as undiciFetch, ProxyAgent } from "undici";

/**
 * A fixed outbound address for the calls a bank insists on whitelisting.
 *
 * Piraeus epay answers the ticket request with result 1041 "Invalid IP address" unless
 * the calling server's IP is registered on the merchant account — and Vercel functions
 * have no fixed IP. So the ticket call (nothing else) can be routed through an HTTP(S)
 * proxy with a static egress address, named by PAYMENTS_EGRESS_PROXY_URL:
 *
 *   PAYMENTS_EGRESS_PROXY_URL="http://user:password@static-proxy.example:3128"
 *
 * Any static-IP proxy works — a hosted one (QuotaGuard Static, Fixie) or a €4 VPS
 * running tinyproxy with basic auth. The IP the bank registers is the proxy's. Unset in
 * development and on any host the bank has whitelisted directly, the call goes out as
 * before.
 *
 * Uses undici's own fetch with its ProxyAgent rather than passing a dispatcher to the
 * runtime's global fetch: Next patches global fetch, and a ProxyAgent from a different
 * undici build than the runtime's is rejected as "not a Dispatcher".
 */
let agent: ProxyAgent | null | undefined;

function proxyAgent(): ProxyAgent | null {
  if (agent !== undefined) return agent;
  const url = process.env.PAYMENTS_EGRESS_PROXY_URL?.trim();
  agent = url ? new ProxyAgent(url) : null;
  return agent;
}

export function egressConfigured(): boolean {
  return Boolean(process.env.PAYMENTS_EGRESS_PROXY_URL?.trim());
}

/** fetch() for a bank endpoint — through the static-IP proxy when one is configured. */
export async function egressFetch(url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }): Promise<Response> {
  const dispatcher = proxyAgent();
  if (!dispatcher) return fetch(url, { ...init, cache: "no-store" });
  // undici's Response is structurally the same as the runtime's; only the type differs.
  return (await undiciFetch(url, { ...init, dispatcher })) as unknown as Response;
}
