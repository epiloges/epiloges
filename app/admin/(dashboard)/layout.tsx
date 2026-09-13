import { connection } from "next/server";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { requireAdminSessionOrRedirect } from "@/lib/admin-session";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  /**
   * Verifying the session token compares its expiry against the clock, and Cache
   * Components refuses to prerender a clock read — even under `instant = false` — which
   * showed up as a permanent "1 Issue" badge on every admin page in development. An admin
   * page can never be prerendered anyway: who is signed in is only known per request.
   */
  await connection();
  const session = await requireAdminSessionOrRedirect();

  return (
    <div className="flex min-h-screen bg-luxe-gray-light">
      <AdminSidebar role={session.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* `role` was hardcoded to "admin" here, so an editor was shown "admin" in the topbar. */}
        <AdminTopbar session={{ name: session.name, email: session.email, role: session.role }} />
        <main id="main" className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
