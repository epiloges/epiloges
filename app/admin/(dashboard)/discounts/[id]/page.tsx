import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { updateDiscount } from "@/app/admin/(dashboard)/discounts/actions";
import { getDiscountById } from "@/services/discounts";
import { SHOP_TIME_ZONE, calendarDateIn } from "@/lib/dates";
import type { DiscountFormValues } from "@/lib/validation/discount";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface EditDiscountPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDiscountPage({ params }: EditDiscountPageProps) {
  // The list page redirects an editor away; this form used to render for them in full and
  // fail silently on submit.
  await requireCapabilityOrRedirect("catalog:discounts");
  const { id } = await params;
  await connection();
  const discount = await getDiscountById(id);
  if (!discount) notFound();

  const defaultValues: DiscountFormValues = {
    code: discount.code,
    type: discount.type,
    value: discount.value,
    active: discount.active,
    // Back to the calendar date the admin chose, in the shop's zone — the stored instant is
    // the end of that day, which read back in UTC would show the same day, but only by luck.
    expiresAt: discount.expiresAt ? calendarDateIn(new Date(discount.expiresAt), SHOP_TIME_ZONE) : undefined,
  };
  const boundUpdate = updateDiscount.bind(null, discount.id);

  return (
    <div>
      <AdminPageHeader title={`Discount ${discount.code}`} description="Change the value, expiry or code without losing its usage history." />
      <DiscountForm defaultValues={defaultValues} onSubmit={boundUpdate} submitLabel="Save Changes" />
    </div>
  );
}
