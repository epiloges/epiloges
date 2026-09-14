import Link from "next/link";
import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { DataTable, type DataTableColumn } from "@/components/admin/DataTable";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { formatDate, formatMoney, orderReference } from "@/lib/format";
import { DEFAULT_LOCALE, LOCALE_TAG } from "@/i18n/config";
import { getDashboardSummary } from "@/services";
import { countRecentEmailFailures } from "@/services/emails";
import { getEmailHealth } from "@/lib/email";
import { getMaintenanceMode } from "@/services/maintenance";
import { currentRoleHasCapability } from "@/lib/admin-session";
import { MaintenanceModeToggle } from "@/components/admin/MaintenanceModeToggle";
import { setMaintenanceModeAction } from "@/app/admin/(dashboard)/settings/actions";
import type { Order } from "@/lib/commerce/types";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[DEFAULT_LOCALE], {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
  }).format(new Date(dateString));
}

// Every cell routes to the order page: the point of the list is to open the order and
// process it, not to read the row.
function orderColumns(when: (row: Order) => string): DataTableColumn<Order>[] {
  return [
    {
      header: "Order",
      cell: (row) => (
        <Link href={`/admin/orders/${row.id}`} className="font-mono text-xs hover:underline">
          #{orderReference(row.id)}
        </Link>
      ),
    },
    {
      header: "Customer",
      cell: (row) => (
        <Link href={`/admin/orders/${row.id}`} className="block hover:underline">
          <p>
            {row.shippingAddress.firstName} {row.shippingAddress.lastName}
          </p>
          <p className="text-xs text-luxe-gray-dark">{row.customerEmail}</p>
        </Link>
      ),
    },
    { header: "When", cell: when },
    { header: "Status", cell: (row) => <OrderStatusBadge status={row.status} /> },
    {
      header: "Total",
      cell: (row) => formatMoney(row.totals.total),
      className: "text-right",
    },
  ];
}

export default async function AdminDashboardPage() {
  // "Today" is read from the clock, which Cache Components refuses to prerender even
  // under `instant = false` — same as the blog editor's date field. A cached dashboard
  // would show yesterday's morning all day, so it is made per-request instead.
  await connection();
  const [{ stats, todayOrders, awaitingShipment }, recentEmailFailures, maintenance, canToggleMaintenance] = await Promise.all([
    getDashboardSummary(),
    countRecentEmailFailures(),
    getMaintenanceMode(),
    currentRoleHasCapability("admin:settings"),
  ]);
  const emailHealth = getEmailHealth();

  return (
    <div>
      <AdminPageHeader title="Dashboard" description={`What needs doing today, ${formatDate(new Date().toISOString(), "en-GB")}.`} />

      {/*
        The shop-open switch. Loud when it is on — a closed shop that nobody remembers closing
        is the failure mode — and quiet when it is off. Editors see the state; only a role with
        `admin:settings` gets the switch, the same gate as every other setting.
      */}
      <div
        className={`mb-6 flex flex-col gap-3 border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
          maintenance.enabled ? "border-amber-500/60 bg-amber-50" : "border-border bg-luxe-white"
        }`}
        role={maintenance.enabled ? "alert" : undefined}
      >
        <div>
          <p className={`font-medium ${maintenance.enabled ? "text-amber-800" : ""}`}>
            {maintenance.enabled ? "The shop is closed for maintenance." : "The shop is open."}
          </p>
          <p className="mt-1 text-luxe-gray-dark">
            {maintenance.enabled
              ? `Customers see a "back soon" page and cannot order. You can still browse the store while signed in here. Closed${
                  maintenance.changedBy ? ` by ${maintenance.changedBy}` : ""
                }${maintenance.changedAt ? ` on ${formatDate(maintenance.changedAt, "en-GB")}` : ""}.`
              : "Switch on maintenance mode to take the storefront offline; the admin, payments and courier callbacks stay up."}
          </p>
        </div>
        {canToggleMaintenance ? <MaintenanceModeToggle defaultEnabled={maintenance.enabled} onToggle={setMaintenanceModeAction} /> : null}
      </div>

      {/*
        The two ways email fails without anyone noticing: nothing is configured to send, or
        the sender is Resend's test address and every customer is refused. Both leave the
        shop taking orders whose confirmations go nowhere — so they are the first thing on
        the dashboard, not a line in a server log.
      */}
      {emailHealth.customersWillNotReceiveMail || recentEmailFailures > 0 ? (
        <div className="mb-6 border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
          <p className="font-medium text-destructive">
            {emailHealth.customersWillNotReceiveMail ? "Customers are not receiving email." : `${recentEmailFailures} email${recentEmailFailures === 1 ? "" : "s"} failed to send in the last 24 hours.`}
          </p>
          <p className="mt-1 text-luxe-gray-dark">
            {emailHealth.customersWillNotReceiveMail ? emailHealth.reason : "Order confirmations or updates may not have reached customers."}{" "}
            <Link href="/admin/emails?status=failed" className="underline underline-offset-4">
              See the failed emails
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.id} {...stat} />
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium tracking-[0.05em] uppercase">Today&apos;s Orders</h3>
          <Link href="/admin/orders" className="text-xs text-luxe-gray-dark underline underline-offset-4">
            All orders
          </Link>
        </div>
        <DataTable<Order>
          columns={orderColumns((row) => formatTime(row.createdAt))}
          rows={todayOrders}
          getRowKey={(row) => row.id}
          emptyMessage="No orders yet today."
        />
      </div>

      {awaitingShipment.length > 0 ? (
        <div className="mt-8">
          <div className="mb-3">
            <h3 className="text-sm font-medium tracking-[0.05em] uppercase">Still To Ship</h3>
            <p className="mt-1 text-xs text-luxe-gray-dark">
              Orders from earlier days that have not gone out yet, oldest first.
            </p>
          </div>
          <DataTable<Order>
            columns={orderColumns((row) => formatDate(row.createdAt))}
            rows={awaitingShipment}
            getRowKey={(row) => row.id}
          />
        </div>
      ) : null}
    </div>
  );
}
