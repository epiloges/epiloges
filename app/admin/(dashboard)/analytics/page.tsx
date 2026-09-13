import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { MiniBarChart } from "@/components/admin/MiniBarChart";
import { DataTable } from "@/components/admin/DataTable";
import { formatDate, formatMoney } from "@/lib/format";
import { countsAsSale } from "@/lib/order-revenue";
import { getAllOrdersForAdmin } from "@/services/orders";
import { getAllCustomersForAdmin, type AdminCustomerRow } from "@/services/customers";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminAnalyticsPage() {
  const [orders, customers] = await Promise.all([getAllOrdersForAdmin(), getAllCustomersForAdmin()]);

  // Cancelled and refunded orders are not sales — see lib/order-revenue.ts. They still
  // appear in the status chart below, which is where they belong.
  const sales = orders.filter(countsAsSale);
  const revenue = sales.reduce((sum, o) => sum + o.totals.total.amount, 0);
  const averageOrderValue = sales.length ? revenue / sales.length : 0;
  const eur = (amount: number) => formatMoney({ amount, currencyCode: "EUR" });

  const revenueByDay = [...sales]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((order) => ({ label: formatDate(order.createdAt).replace(/, \d{4}$/, ""), value: order.totals.total.amount }));

  const statusCounts = new Map<string, number>();
  for (const order of orders) statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
  const ordersByStatus = Array.from(statusCounts.entries()).map(([label, value]) => ({ label, value }));

  const topCustomers = customers.filter((c) => c.ordersCount > 0).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5);

  return (
    <div>
      <AdminPageHeader title="Analytics" description="Aggregate figures derived from real orders and customers. Sales exclude cancelled and refunded orders." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard id="revenue" label="Total Sales" value={eur(revenue)} />
        <StatCard id="aov" label="Average Order Value" value={eur(Math.round(averageOrderValue * 100) / 100)} />
        <StatCard id="orders" label="Orders" value={sales.length === orders.length ? String(orders.length) : `${sales.length} (${orders.length - sales.length} cancelled/refunded)`} />
        <StatCard id="customers" label="Total Customers" value={String(customers.length)} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="border border-border bg-luxe-white p-5">
          <h3 className="mb-4 text-sm font-medium tracking-[0.05em] uppercase">Revenue by Order</h3>
          <MiniBarChart data={revenueByDay} formatValue={eur} />
        </div>
        <div className="border border-border bg-luxe-white p-5">
          <h3 className="mb-4 text-sm font-medium tracking-[0.05em] uppercase">Orders by Status</h3>
          <MiniBarChart data={ordersByStatus} />
        </div>
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium tracking-[0.05em] uppercase">Top Customers</h3>
        <DataTable<AdminCustomerRow>
          columns={[
            { header: "Customer", cell: (row) => `${row.firstName} ${row.lastName}` },
            { header: "Orders", cell: (row) => row.ordersCount },
            { header: "Total Spent", cell: (row) => eur(row.totalSpent), className: "text-right" },
          ]}
          rows={topCustomers}
          getRowKey={(row) => row.id}
        />
      </div>
    </div>
  );
}
