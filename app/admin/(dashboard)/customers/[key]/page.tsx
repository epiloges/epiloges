import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { OrderStatusBadge } from "@/components/admin/OrderStatusBadge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getCustomerById, getCustomerForAdmin } from "@/services/customers";
import { getOrdersForEmail } from "@/services/orders";
import { getReturnsForEmail } from "@/services/returns";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import type { Order, Return } from "@/lib/commerce/types";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface CustomerDetailPageProps {
  params: Promise<{ key: string }>;
}

/**
 * One person: who they are, where they have things sent, what they ordered and returned,
 * whether they are on the newsletter. The customers list used to be the end of the road —
 * the only link on it was mailto:, so answering "what did this customer order?" meant
 * searching the orders list by hand.
 */
export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  await requireCapabilityOrRedirect("orders:view");
  const { key } = await params;
  await connection();
  const summary = await getCustomerForAdmin(decodeURIComponent(key));
  if (!summary) notFound();

  const [account, orders, returns, subscriber] = await Promise.all([
    summary.hasAccount ? getCustomerById(summary.id) : Promise.resolve(null),
    getOrdersForEmail(summary.email),
    getReturnsForEmail(summary.email),
    prisma.newsletterSubscriber.findUnique({ where: { email: summary.email.toLowerCase() }, select: { subscribedAt: true } }),
  ]);

  const orderCount = (order: Order) => order.lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      <p className="mb-3 text-xs">
        <Link href="/admin/customers" className="text-luxe-gray-dark underline-offset-4 hover:underline">
          ← All customers
        </Link>
      </p>
      <AdminPageHeader
        title={`${summary.firstName} ${summary.lastName}`.trim() || summary.email}
        description={`${summary.hasAccount ? "Account" : "Guest"} · ${summary.ordersCount} order${summary.ordersCount === 1 ? "" : "s"} · ${formatMoney({ amount: summary.totalSpent, currencyCode: "EUR" })} · since ${formatDate(summary.createdAt)}`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="border border-border bg-luxe-white">
            <h3 className="border-b border-border p-4 text-sm font-medium tracking-[0.05em] uppercase">Orders</h3>
            <DataTable<Order>
              columns={[
                {
                  header: "Order",
                  cell: (row) => (
                    <Link href={`/admin/orders/${row.id}`} className="font-mono text-xs hover:underline">
                      #{row.id.slice(-8).toUpperCase()}
                    </Link>
                  ),
                },
                { header: "Placed", cell: (row) => formatDateTime(row.createdAt) },
                { header: "Items", cell: (row) => orderCount(row) },
                { header: "Status", cell: (row) => <OrderStatusBadge status={row.status} /> },
                { header: "Total", cell: (row) => formatMoney(row.totals.total), className: "text-right" },
              ]}
              rows={orders}
              getRowKey={(row) => row.id}
              emptyMessage="No orders under this email."
            />
          </section>

          {returns.length > 0 ? (
            <section className="border border-border bg-luxe-white">
              <h3 className="border-b border-border p-4 text-sm font-medium tracking-[0.05em] uppercase">Returns</h3>
              <DataTable<Return>
                columns={[
                  {
                    header: "Order",
                    cell: (row) => (
                      <Link href={`/admin/orders/${row.orderId}`} className="font-mono text-xs hover:underline">
                        #{row.orderId.slice(-8).toUpperCase()}
                      </Link>
                    ),
                  },
                  { header: "Requested", cell: (row) => formatDate(row.createdAt) },
                  { header: "Items", cell: (row) => row.items.reduce((sum, item) => sum + item.quantity, 0) },
                  { header: "Status", cell: (row) => <span className="capitalize">{row.status}</span> },
                ]}
                rows={returns}
                getRowKey={(row) => row.id}
              />
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="border border-border bg-luxe-white p-4 text-sm">
            <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Contact</h3>
            <p>
              <a href={`mailto:${summary.email}`} className="hover:underline">
                {summary.email}
              </a>
            </p>
            {summary.phone ? <p className="mt-1">{summary.phone}</p> : null}
            <p className="mt-3 text-xs text-luxe-gray-dark">
              {subscriber ? `Newsletter subscriber since ${formatDate(subscriber.subscribedAt.toISOString())}` : "Not on the newsletter"}
              {account ? ` · marketing ${account.acceptsMarketing ? "accepted" : "declined"}` : ""}
            </p>
          </section>

          {account && account.addresses.length > 0 ? (
            <section className="border border-border bg-luxe-white p-4 text-sm">
              <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Saved addresses</h3>
              <ul className="space-y-3">
                {account.addresses.map((address) => (
                  <li key={address.id} className="text-xs leading-relaxed">
                    {address.firstName} {address.lastName}
                    {address.company ? `, ${address.company}` : ""}
                    <br />
                    {address.address1}
                    {address.address2 ? `, ${address.address2}` : ""}
                    <br />
                    {address.city} {address.postalCode}, {address.countryCode}
                    {address.phone ? ` · ${address.phone}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="border border-border bg-luxe-white p-4 text-sm">
            <h3 className="mb-2 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Data requests</h3>
            <p className="text-xs text-luxe-gray-dark">
              Export or erase everything held for this address from the{" "}
              <Link href="/admin/customers#data-requests" className="underline underline-offset-4">
                data requests panel
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
