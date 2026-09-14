import { NextResponse } from "next/server";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/commerce/http-errors";
import { getMaintenanceMode, MAINTENANCE_PASS_COOKIE, MAINTENANCE_PASS_MAX_AGE, maintenancePassToken } from "@/services/maintenance";

/**
 * The "back soon" page's PIN. The right one earns the cookie `proxy.ts` honours while the
 * shop is closed; the page then reloads into the storefront.
 *
 * Four digits is ten thousand guesses, so failures are rate-limited per address — ten in a
 * quarter-hour — which turns a brute force into a fortnight's work for a prize of window
 * shopping. Only failures count: a tester who fat-fingers it a couple of times is not locked
 * out, and a correct PIN is never the thing being limited.
 *
 * Reachable while the shop is closed because `/api` is outside the maintenance rewrite.
 */
export async function POST(request: Request) {
  const key = `maintenance-pin:ip:${getClientIp(request.headers)}`;
  const limit = await isRateLimited({ key, limit: 10, windowMs: 15 * 60 * 1000 });
  if (limit.limited) return rateLimitedResponse(limit.retryAfterSeconds);

  const body = (await request.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  const { enabled, pin: expected } = await getMaintenanceMode();

  if (!enabled) return NextResponse.json({ ok: true });
  if (!/^\d{4}$/.test(pin) || pin !== expected) {
    await recordAttempt(key);
    return NextResponse.json({ error: "wrong-pin" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(MAINTENANCE_PASS_COOKIE, await maintenancePassToken(pin), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAINTENANCE_PASS_MAX_AGE,
  });
  return response;
}
