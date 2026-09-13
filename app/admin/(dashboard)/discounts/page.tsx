import Link from "next/link";
import type { ReactNode } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { DataTable } from "@/components/admin/DataTable";
import { ActiveToggle } from "@/components/admin/ActiveToggle";
import { DeleteRowButton } from "@/components/admin/DeleteRowButton";
import { formatDate, formatMoney } from "@/lib/format";
import { getAllDiscounts } from "@/services/discounts";
import { getAllGiftCards } from "@/services/gift-cards";
import { getCodeUsageReport, type CodeUsage } from "@/services/code-usage";
import { toggleDiscountActive, deleteDiscount } from "@/app/admin/(dashboard)/discounts/actions";
import { toggleGiftCardActive, deleteGiftCard } from "@/app/admin/(dashboard)/gift-cards/actions";
import type { Discount, GiftCard } from "@/types";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** The deploy that started snapshotting codes onto orders — see prisma/migrations/20260913090000_order_applied_codes. */
const CODE_TRACKING_SINCE = "2026-09-13";

function UsageCell({ usage }: { usage: CodeUsage | undefined }) {
  if (!usage) return <span className="text-luxe-gray-dark">Never</span>;
  return (
    <span>
      {usage.orders} {usage.orders === 1 ? "order" : "orders"}
      <span className="ml-1 text-xs text-luxe-gray-dark">· {formatMoney({ amount: usage.amount, currencyCode: "EUR" })} off</span>
    </span>
  );
}

function NewButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-9 items-center bg-luxe-black px-4 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase"
    >
      {children}
    </Link>
  );
}

function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium tracking-[0.05em] uppercase">{title}</h2>
          <p className="mt-1 text-xs text-luxe-gray-dark">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Discounts and gift cards are both codes typed at checkout, so they share one admin page.
// /admin/gift-cards still exists for the "new gift card" form and redirects its list here.
export default async function AdminDiscountsPage() {
  await requireCapabilityOrRedirect("catalog:discounts");
  const [discounts, giftCards, usage] = await Promise.all([getAllDiscounts(), getAllGiftCards(), getCodeUsageReport()]);
  const usageCaveat =
    usage.untracked > 0
      ? ` Uses are counted from ${formatDate(CODE_TRACKING_SINCE)} onward — ${usage.untracked} earlier ${usage.untracked === 1 ? "order" : "orders"} used a code that was not recorded.`
      : "";

  return (
    <div>
      <AdminPageHeader
        title="Discounts & Gift Cards"
        description={`Codes a customer can enter at checkout — percentage or fixed-amount discounts, and prepaid gift cards.${usageCaveat}`}
      />

      <div className="space-y-10">
        <Section
          id="discounts"
          title="Discounts"
          description={`${discounts.length} discount codes.`}
          action={<NewButton href="/admin/discounts/new">New Discount</NewButton>}
        >
          <DataTable<Discount>
            columns={[
              {
                header: "Code",
                cell: (row) => (
                  <Link href={`/admin/discounts/${row.id}`} className="font-mono underline-offset-4 hover:underline">
                    {row.code}
                  </Link>
                ),
              },
              {
                header: "Value",
                cell: (row) => (row.type === "percentage" ? `${row.value}%` : `€${row.value.toFixed(2)}`),
              },
              { header: "Expires", cell: (row) => (row.expiresAt ? formatDate(row.expiresAt) : "No expiry") },
              { header: "Used", cell: (row) => <UsageCell usage={usage.discounts.get(row.code.toUpperCase())} /> },
              {
                header: "Status",
                cell: (row) => <ActiveToggle id={row.id} defaultActive={row.active} onToggle={toggleDiscountActive} />,
              },
              {
                header: "",
                cell: (row) => (
                  <DeleteRowButton id={row.id} onDelete={deleteDiscount} confirmMessage={`Delete ${row.code}?`} />
                ),
                className: "text-right",
              },
            ]}
            rows={discounts}
            getRowKey={(row) => row.id}
          />
        </Section>

        <Section
          id="gift-cards"
          title="Gift Cards"
          description={`${giftCards.length} gift card codes.`}
          action={<NewButton href="/admin/gift-cards/new">New Gift Card</NewButton>}
        >
          <DataTable<GiftCard>
            columns={[
              { header: "Code", cell: (row) => <span className="font-mono">{row.code}</span> },
              { header: "Balance", cell: (row) => formatMoney(row.balance) },
              { header: "Used", cell: (row) => <UsageCell usage={usage.giftCards.get(row.code.toUpperCase())} /> },
              {
                header: "Status",
                cell: (row) => <ActiveToggle id={row.id} defaultActive={row.active} onToggle={toggleGiftCardActive} />,
              },
              {
                header: "",
                cell: (row) => (
                  <DeleteRowButton id={row.id} onDelete={deleteGiftCard} confirmMessage={`Delete ${row.code}?`} />
                ),
                className: "text-right",
              },
            ]}
            rows={giftCards}
            getRowKey={(row) => row.id}
          />
        </Section>
      </div>
    </div>
  );
}
