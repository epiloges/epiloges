"use client";

import { usePathname } from "next/navigation";

/**
 * True inside /admin. The root layout wraps every route in the storefront's cart, wishlist
 * and customer-session providers and its cookie banner, so each admin page view used to
 * fire /api/cart, /api/wishlist and /api/auth/session (twice each), create an anonymous
 * cart and wishlist row for the admin's browser, and show the shopper's cookie notice on
 * the dashboard. The admin has none of those things; the providers skip their bootstrap
 * and the banner and drawer render nothing there.
 */
export function useIsAdminRoute(): boolean {
  const pathname = usePathname();
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
