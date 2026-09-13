import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { getRawSiteSettings } from "@/services/settings";
import { saveSiteSettingsAction } from "@/app/admin/(dashboard)/settings/actions";
import { requireCapabilityOrRedirect } from "@/lib/admin-session";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminSettingsPage() {
  await requireCapabilityOrRedirect("admin:settings");
  const settings = await getRawSiteSettings();

  return (
    <div>
      <AdminPageHeader title="Site Settings" description="Core store information and announcement bar content." />
      <SiteSettingsForm initialSettings={settings} onSave={saveSiteSettingsAction} />
    </div>
  );
}
