import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ListFilterBar } from "@/components/admin/ListFilterBar";
import { Pagination } from "@/components/admin/Pagination";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_PAGE_SIZE, parsePage, parseSearch } from "@/lib/pagination";
import { emailProviderLabel, listEmailLogsForAdmin, type EmailLogEntry } from "@/services/emails";
import { EmailDeliveryPill } from "@/components/admin/EmailDeliveryPill";
import { ResendEmailButton } from "@/components/admin/ResendEmailButton";
import { getEmailHealth } from "@/lib/email";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const TEMPLATE_LABELS: Record<string, string> = {
  "order-confirmation": "Order Confirmation",
  "payment-received": "Payment Received",
  "payment-failed": "Payment Failed",
  "refund-issued": "Refund Issued",
  "shipping-update": "Shipping Update",
  "return-requested": "Return Requested",
  "return-status-update": "Return Status Update",
  "password-reset": "Password Reset",
  "account-already-exists": "Account Already Exists",
  welcome: "Welcome",
  "contact-message": "Contact Message (to shop)",
  "contact-acknowledgement": "Contact Acknowledgement",
  "concierge-request": "Stylist Request (to shop)",
  "concierge-acknowledgement": "Stylist Acknowledgement",
  "newsletter-welcome": "Newsletter Welcome",
  "referral-reward": "Referral Reward",
  "abandoned-cart": "Abandoned Cart",
  "review-request": "Review Request",
  "back-in-stock": "Back in Stock",
  "admin-notification": "Admin Notification",
};

interface AdminEmailsPageProps {
  searchParams: Promise<{ q?: string; template?: string; status?: string; page?: string }>;
}

export default async function AdminEmailsPage({ searchParams }: AdminEmailsPageProps) {
  const params = await searchParams;
  const search = parseSearch(params.q);
  const template = params.template && TEMPLATE_LABELS[params.template] ? params.template : undefined;
  const status = params.status === "sent" || params.status === "failed" || params.status === "skipped" ? params.status : undefined;
  const health = getEmailHealth();
  const { rows, total, page, pageCount, pageSize } = await listEmailLogsForAdmin({
    search,
    template,
    status,
    page: parsePage(params.page),
    pageSize: DEFAULT_PAGE_SIZE,
  });

  return (
    <div>
      <AdminPageHeader
        title="Emails"
        description={`${total} emails sent through ${emailProviderLabel()}. Every order confirmation, shipping update and password reset is logged here; bodies are kept for 180 days.`}
      />

      {health.customersWillNotReceiveMail ? (
        <div className="mb-4 border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
          <p className="font-medium text-destructive">Customers are not receiving email.</p>
          <p className="mt-1 text-luxe-gray-dark">{health.reason}</p>
        </div>
      ) : null}

      <ListFilterBar
        action="/admin/emails"
        searchValue={search}
        searchPlaceholder="Search recipient or subject"
        selects={[
          {
            name: "status",
            label: "Any outcome",
            value: status ?? "",
            options: [
              { value: "sent", label: "Sent" },
              { value: "failed", label: "Failed" },
              { value: "skipped", label: "Skipped" },
            ],
          },
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
          { header: "Outcome", cell: (row) => <EmailDeliveryPill status={row.status} error={row.error} /> },
          { header: "When", cell: (row) => formatDateTime(row.sentAt), className: "text-right whitespace-nowrap" },
          { header: "", className: "text-right", cell: (row) => <ResendEmailButton id={row.id} failed={row.status === "failed"} /> },
        ]}
        rows={rows}
        getRowKey={(row) => row.id}
        emptyMessage={search || template || status ? "No emails match those filters." : "No emails sent yet."}
      />

      <Pagination basePath="/admin/emails" params={{ q: search, template, status }} page={page} pageCount={pageCount} total={total} pageSize={pageSize} label="emails" />
    </div>
  );
}
