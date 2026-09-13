import "server-only";
import { prisma } from "@/lib/prisma";
import { toOrder } from "@/lib/commerce/postgres/mappers";
import type { Order } from "@/lib/commerce/types";
import type { AdminUser, DashboardStat } from "@/types";

/**
 * Orders/Customers/Discounts/GiftCards/Returns moved to services/orders.ts,
 * services/customers.ts, services/discounts.ts, services/gift-cards.ts,
 * services/returns.ts, and Newsletter to services/newsletter.ts (all
 * Postgres-backed now).
 *
 * The activity log used to live here and has been REMOVED, not migrated. It read
 * data/activity-log.json — a file of seeded, invented entries — and presented them at
 * /admin/activity under the heading "Recent actions taken across this dashboard". Nothing
 * ever wrote to it, so it could only ever show a fixed set of things that never happened.
 *
 * That is worse than having no audit log, because it is the screen someone opens during an
 * incident to find out who changed a price, and it would answer confidently and wrongly.
 * An honest absence is recoverable; a convincing fabrication is not. The real thing is an
 * AdminAuditLog table written from this service layer, with the same append-only
 * discipline PaymentTransaction already uses for payments — deliberately left undone here
 * rather than faked.
 */

/**
 * Reads the real `AdminUser` table (Postgres, Real Backend Phase 1) — this
 * was still reading data/admin-users.json until now, a leftover gap from
 * that migration: admin login (app/admin/actions.ts) already used Prisma,
 * but this list didn't, so an admin created directly in the database never
 * showed up here (and vice versa). Never returns `passwordHash`.
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  const rows = await prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === "editor" ? "editor" : "admin",
  }));
}

/**
 * Midnight today in the shop's own timezone, as a UTC instant. Vercel runs on UTC, so a
 * plain `new Date().setHours(0)` would start "today" two or three hours late for Athens
 * and an order placed at 01:00 would count towards yesterday.
 */
function startOfTodayIn(timeZone: string): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  // Midnight of that calendar date as if it were UTC, then shift by the zone's offset at that moment.
  const midnightAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"));
  const offsetMs = zoneOffsetMs(new Date(midnightAsUtc), timeZone);
  return new Date(midnightAsUtc - offsetMs);
}

function zoneOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - at.getTime();
}

export interface DashboardSummary {
  stats: DashboardStat[];
  /** Orders placed since midnight Athens time, newest first. */
  todayOrders: Order[];
  /** Confirmed/processing orders from before today, oldest first — the backlog to clear. */
  awaitingShipment: Order[];
}

/**
 * What the shop needs to act on today — not lifetime totals. Lifetime revenue and
 * customer counts belong on Analytics; the dashboard is the screen opened each morning
 * to see what came in overnight and what still has to go out the door.
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const since = startOfTodayIn("Europe/Athens");
  const unshipped = ["confirmed", "processing"];

  const [todayRows, backlogRows, openReturns, openConcierge] = await Promise.all([
    prisma.order.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    prisma.order.findMany({
      where: { createdAt: { lt: since }, status: { in: unshipped } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.return.count({ where: { status: { in: ["requested", "approved"] } } }),
    prisma.conciergeRequest.count({ where: { status: "open" } }),
  ]);

  const todayOrders = todayRows.map(toOrder);
  const awaitingShipment = backlogRows.map(toOrder);
  const todayRevenue = todayOrders.reduce((sum, order) => sum + order.totals.total.amount, 0);
  const toShip = todayOrders.filter((order) => unshipped.includes(order.status)).length + awaitingShipment.length;

  return {
    stats: [
      { id: "today-orders", label: "Today's Orders", value: String(todayOrders.length) },
      { id: "today-revenue", label: "Today's Revenue", value: `€${todayRevenue.toLocaleString()}` },
      { id: "to-ship", label: "To Ship", value: String(toShip) },
      { id: "open-returns", label: "Open Returns", value: String(openReturns) },
      { id: "stylist-requests", label: "Stylist Requests", value: String(openConcierge) },
    ],
    todayOrders,
    awaitingShipment,
  };
}
