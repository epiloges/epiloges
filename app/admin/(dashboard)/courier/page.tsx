import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { PickupListPanel } from "@/components/admin/PickupListPanel";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";
import { getCourierProvider, isAcsCourierConfigured, type PickupListSummary } from "@/lib/courier";
import { nextPickupDateInAthens } from "@/lib/courier/providers/acs";
import { issuePickupListAction } from "@/app/admin/(dashboard)/courier/actions";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * The end-of-day half of shipping with ACS. Vouchers are created and printed from each
 * order; this is where the day is closed so the courier actually collects them.
 */
export default async function AdminCourierPage() {
  await requireCapabilityOrRedirect("orders:manage");
  // Reads the clock for "today", which Cache Components refuses to prerender — see the dashboard.
  await connection();

  if (!isAcsCourierConfigured()) {
    return (
      <div>
        <AdminPageHeader title="ACS Courier" description="Pickup lists for the day's vouchers." />
        <div className="border border-border bg-luxe-white p-6 text-sm text-luxe-gray-dark">
          ACS is not the active courier on this deployment (<code>COURIER_PROVIDER</code> is not <code>acs</code>).
          Tracking numbers are entered by hand on each order.
        </div>
      </div>
    );
  }

  // Sunday shows Monday: ACS refuses a Sunday pickup, and the vouchers created on a Sunday
  // are dated Monday too, so that is the list to close.
  const today = nextPickupDateInAthens();
  const provider = getCourierProvider();
  let existing: PickupListSummary[] = [];
  let existingError: string | null = null;
  try {
    existing = provider.listPickupLists ? await provider.listPickupLists(today) : [];
  } catch (error) {
    existingError = error instanceof Error ? error.message : "Couldn't reach ACS.";
  }

  return (
    <div>
      <AdminPageHeader
        title="ACS Courier"
        description="Create and print each order's voucher from the order page; close the day here so the courier collects them."
      />
      <PickupListPanel today={today} existing={existing} existingError={existingError} onIssue={issuePickupListAction} />
    </div>
  );
}
