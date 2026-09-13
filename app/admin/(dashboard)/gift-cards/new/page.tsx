import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import { GiftCardForm } from "@/components/admin/GiftCardForm";
import { createGiftCard } from "@/app/admin/(dashboard)/gift-cards/actions";
import { emptyGiftCardFormValues } from "@/lib/validation/gift-card";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NewGiftCardPage() {
  // The list page redirects an editor away; this form used to render for them in full and
  // fail silently on submit.
  await requireCapabilityOrRedirect("catalog:discounts");
  return (
    <div>
      <AdminPageHeader title="New Gift Card" description="Issue a new gift card." />
      <GiftCardForm defaultValues={emptyGiftCardFormValues} onSubmit={createGiftCard} submitLabel="Create Gift Card" />
    </div>
  );
}
