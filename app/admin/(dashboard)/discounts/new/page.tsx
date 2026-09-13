import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import { DiscountForm } from "@/components/admin/DiscountForm";
import { createDiscount } from "@/app/admin/(dashboard)/discounts/actions";
import { emptyDiscountFormValues } from "@/lib/validation/discount";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NewDiscountPage() {
  // The list page redirects an editor away; this form used to render for them in full and
  // fail silently on submit.
  await requireCapabilityOrRedirect("catalog:discounts");
  return (
    <div>
      <AdminPageHeader title="New Discount" description="Add a new discount code." />
      <DiscountForm defaultValues={emptyDiscountFormValues} onSubmit={createDiscount} submitLabel="Create Discount" />
    </div>
  );
}
