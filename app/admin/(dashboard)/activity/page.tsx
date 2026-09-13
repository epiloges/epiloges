import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ListFilterBar } from "@/components/admin/ListFilterBar";
import { Pagination } from "@/components/admin/Pagination";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE, parsePage } from "@/lib/pagination";
import { listAuditLog, type AuditLogEntry } from "@/services/audit-log";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface AdminActivityPageProps {
  searchParams: Promise<{ action?: string; page?: string }>;
}

/**
 * The admin activity log (OBS-002).
 *
 * Records only what matters: money moved, and who can do what. Everything else would bury
 * those. Read-only by construction — there is no edit or delete here, because a log an
 * admin can edit answers no question worth asking.
 */
/** Where each target type has a page of its own. Types without one show the full id in monospace. */
const TARGET_PATHS: Record<string, (id: string) => string> = {
  order: (id) => `/admin/orders/${id}`,
  payment: (id) => `/admin/payments/${id}`,
  product: (id) => `/admin/products/${id}`,
  category: (id) => `/admin/categories/${id}`,
  collection: (id) => `/admin/collections/${id}`,
  discount: (id) => `/admin/discounts/${id}`,
  blogPost: (id) => `/admin/blog/${id}`,
};

function TargetLink({ type, id }: { type: string; id: string }) {
  // Bulk actions and settings keys ("bulk:delete", "shipping") are labels, not ids.
  const href = id.includes(":") ? undefined : TARGET_PATHS[type]?.(id);
  const label = `${type} · ${id}`;
  return href ? (
    <Link href={href} className="font-mono text-xs underline-offset-4 hover:underline">
      {label}
    </Link>
  ) : (
    <span className="font-mono text-xs">{label}</span>
  );
}

export default async function AdminActivityPage({ searchParams }: AdminActivityPageProps) {
  await requireCapabilityOrRedirect("admin:activity");
  const params = await searchParams;

  // Dotted verbs mean a prefix filter works: "payment" catches every payment.* action.
  const action = params.action?.trim() || undefined;
  const { rows, total, page, pageCount, pageSize } = await listAuditLog({
    action,
    page: parsePage(params.page),
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <div>
      <AdminPageHeader
        title="Activity"
        description={
          total === 0
            ? "Nothing recorded yet. Refunds, manual payment confirmations and role changes appear here."
            : `${total} recorded action${total === 1 ? "" : "s"}.`
        }
      />

      <ListFilterBar
        action="/admin/activity"
        selects={[
          {
            name: "action",
            label: "All actions",
            value: action ?? "",
            // OBS-003 widened the vocabulary, and a filter that does not list a prefix makes
            // those entries effectively unfindable — they are recorded but nobody can reach
            // them. Ordered by how often the answer is actually wanted, money first.
            options: [
              // With the dot, so "payment." does not also match paymentMethod.* below.
              { value: "payment.", label: "Payments" },
              { value: "paymentMethod", label: "Payment settings" },
              { value: "paymentProvider", label: "Payment providers" },
              { value: "order", label: "Orders" },
              { value: "return", label: "Returns" },
              { value: "giftCard", label: "Gift cards" },
              { value: "discount", label: "Discounts" },
              { value: "product", label: "Products" },
              { value: "category", label: "Categories" },
              { value: "collection", label: "Collections" },
              { value: "media", label: "Media" },
              { value: "blogPost", label: "Blog" },
              { value: "review", label: "Reviews" },
              { value: "settings", label: "Settings" },
              { value: "dataSubject", label: "GDPR requests" },
              { value: "adminUser", label: "Users & roles" },
            ],
          },
        ]}
      />

      <DataTable<AuditLogEntry>
        columns={[
          // Date AND time: three status changes on one day are a sequence only if you can see
          // which came first.
          { header: "When", cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span> },
          { header: "Who", cell: (row) => row.actorEmail },
          { header: "Action", cell: (row) => row.action },
          { header: "What", cell: (row) => row.summary },
          { header: "Target", cell: (row) => <TargetLink type={row.targetType} id={row.targetId} /> },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
      />

      <Pagination
        basePath="/admin/activity"
        params={{ action }}
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        label="actions"
      />
    </div>
  );
}
