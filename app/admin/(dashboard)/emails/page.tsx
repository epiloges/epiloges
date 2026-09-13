import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ListFilterBar } from "@/components/admin/ListFilterBar";
import { Pagination } from "@/components/admin/Pagination";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE, parsePage, parseSearch } from "@/lib/pagination";
import { emailProviderLabel, listEmailLogsForAdmin, type EmailLogEntry } from "@/services/emails";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const TEMPLATE_LABELS: Record<string, string> = {
  "order-confirmation": "Order Confirmation",
  "shipping-update": "Shipping Update",
  "password-reset": "Password Reset",
  "return-status-update": "Return Status Update",
  welcome: "Welcome",
  "contact-message": "Contact Message",
  "referral-reward": "Referral Reward",
  "abandoned-cart": "Abandoned Cart",
  "review-request": "Review Request",
  "back-in-stock": "Back in Stock",
};

interface AdminEmailsPageProps {
  searchParams: Promise<{ q?: string; template?: string; page?: string }>;
}

export default async function AdminEmailsPage({ searchParams }: AdminEmailsPageProps) {
  const params = await searchParams;
  const search = parseSearch(params.q);
  const template = params.template && TEMPLATE_LABELS[params.template] ? params.template : undefined;
  const { rows, total, page, pageCount, pageSize } = await listEmailLogsForAdmin({
    search,
    template,
    page: parsePage(params.page),
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <div>
      <AdminPageHeader
        title="Emails"
        description={`${total} emails sent through ${emailProviderLabel()}. Every order confirmation, shipping update and password reset is logged here; bodies are kept for 180 days.`}
      />

      <ListFilterBar
        action="/admin/emails"
        searchValue={search}
        searchPlaceholder="Search recipient or subject"
        selects={[
          {
            name: "template",
            label: "All templates",
            value: template ?? "",
            options: Object.entries(TEMPLATE_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]}
      />

      <DataTable<EmailLogEntry>
        columns={[
          {
            header: "To",
            cell: (row) => (
              <Link href={`/admin/emails/${row.id}`} className="hover:underline">
                {row.to}
              </Link>
            ),
          },
          { header: "Template", cell: (row) => TEMPLATE_LABELS[row.template] ?? row.template },
          { header: "Subject", cell: (row) => row.subject },
          { header: "Sent", cell: (row) => formatDateTime(row.sentAt), className: "text-right whitespace-nowrap" },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyMessage={search || template ? "No emails match those filters." : "No emails sent yet."}
      />

      <Pagination basePath="/admin/emails" params={{ q: search, template }} page={page} pageCount={pageCount} total={total} pageSize={pageSize} label="emails" />
    </div>
  );
}
