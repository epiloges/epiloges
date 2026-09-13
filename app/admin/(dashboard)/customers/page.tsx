import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ListFilterBar } from "@/components/admin/ListFilterBar";
import { Pagination } from "@/components/admin/Pagination";
import { DEFAULT_PAGE_SIZE, parsePage, parseSearch } from "@/lib/pagination";
import { EraseCustomerDataForm, ExportCustomerDataForm } from "@/components/admin/DataSubjectPanel";
import { currentRoleHasCapability } from "@/lib/admin-session";
import { formatDate, formatMoney } from "@/lib/format";
import { listCustomersForAdmin, type AdminCustomerRow } from "@/services/customers";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface AdminCustomersPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminCustomersPage({ searchParams }: AdminCustomersPageProps) {
  const params = await searchParams;
  const search = parseSearch(params.q);
  // Data-subject work sits with whoever owns the shop's legal obligations, not with whoever
  // is editing the catalogue, so the panel is hidden from roles without `admin:settings`.
  // Both actions re-check the capability themselves; this only keeps a dead control off the page.
  const [{ rows, total, page, pageCount, pageSize, accounts, everyone }, canHandleDataRequests] = await Promise.all([
    listCustomersForAdmin({ search, page: parsePage(params.page), pageSize: DEFAULT_PAGE_SIZE }),
    currentRoleHasCapability("admin:settings"),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Customers"
        description={`${everyone} customers — ${accounts} with an account, ${everyone - accounts} who checked out as guests.`}
      />

      <ListFilterBar action="/admin/customers" searchValue={search} searchPlaceholder="Search name, email or phone" />

      <DataTable<AdminCustomerRow>
        columns={[
          {
            header: "Customer",
            cell: (row) => (
              <div>
                <p className="flex items-center gap-2">
                  <Link href={`/admin/customers/${encodeURIComponent(row.id)}`} className="hover:underline">
                    {row.firstName} {row.lastName}
                  </Link>
                  {row.hasAccount ? null : (
                    <span className="border border-border px-1.5 py-px text-[10px] tracking-[0.05em] text-luxe-gray-dark uppercase">
                      Guest
                    </span>
                  )}
                </p>
                <p className="text-xs text-luxe-gray-dark">
                  <a href={`mailto:${row.email}`} className="hover:underline">
                    {row.email}
                  </a>
                  {row.phone ? <span> · {row.phone}</span> : null}
                </p>
              </div>
            ),
          },
          { header: "Orders", cell: (row) => row.ordersCount },
          { header: "Total Spent", cell: (row) => formatMoney({ amount: row.totalSpent, currencyCode: "EUR" }) },
          { header: "Since", cell: (row) => formatDate(row.createdAt) },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyMessage={search ? "No customers match that search." : "No customers yet."}
      />

      <Pagination basePath="/admin/customers" params={{ q: search }} page={page} pageCount={pageCount} total={total} pageSize={pageSize} label="customers" />

      {canHandleDataRequests ? (
        <section id="data-requests" className="mt-10">
          <h2 className="text-sm font-medium tracking-[0.05em] uppercase">Data requests</h2>
          <p className="mt-1 max-w-2xl text-xs text-luxe-gray-dark">
            Someone can ask for a copy of everything you hold on them, or ask you to delete it. Both have a
            one-month deadline under GDPR. Search by email — these cover guests and subscribers too, not only
            the accounts listed above.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ExportCustomerDataForm />
            <EraseCustomerDataForm />
          </div>
        </section>
      ) : null}
    </div>
  );
}
