import type { LucideIcon } from "lucide-react";
import type { Capability } from "@/constants/permissions";
import {
  LayoutDashboard,
  Package,
  Layers,
  Tags,
  Percent,
  LayoutTemplate,
  Image as ImageIcon,
  GalleryHorizontal,
  Menu as MenuIcon,
  Newspaper,
  ShoppingBag,
  Users,
  Mail,
  Search,
  Settings,
  Truck,
  Palette,
  UserCog,
  Boxes,
  PackageOpen,
  BarChart3,
  ShieldCheck,
  ClipboardCheck,
  Send,
  MessageSquare,
  Sparkles,
  ScrollText,
  Star,
  Users2,
  Upload,
  CreditCard,
  Wallet,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hides the link when the signed-in role lacks it. UX only — the page/action guards
   * are the real gate; a hidden link is still reachable by typing the URL. */
  capability?: Capability;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/admin/products", icon: Package, capability: "catalog:view" },
      { label: "Import Products", href: "/admin/products/import", icon: Upload, capability: "catalog:view" },
      { label: "Inventory", href: "/admin/inventory", icon: Boxes, capability: "catalog:view" },
      { label: "Collections", href: "/admin/collections", icon: Layers, capability: "catalog:view" },
      { label: "Categories", href: "/admin/categories", icon: Tags, capability: "catalog:view" },
      { label: "Discounts & Gift Cards", href: "/admin/discounts", icon: Percent, capability: "catalog:discounts" },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Homepage Sections", href: "/admin/homepage", icon: LayoutTemplate, capability: "content:publish" },
      { label: "Hero Management", href: "/admin/homepage/hero", icon: ImageIcon, capability: "content:publish" },
      { label: "Media Library", href: "/admin/media", icon: GalleryHorizontal, capability: "content:media" },
      { label: "Navigation Menu", href: "/admin/navigation", icon: MenuIcon, capability: "content:navigation" },
      { label: "Blog Posts", href: "/admin/blog", icon: Newspaper, capability: "content:blog" },
      { label: "Reviews", href: "/admin/reviews", icon: Star, capability: "content:reviews" },
    ],
  },
  {
    title: "Customers",
    items: [
      { label: "Orders", href: "/admin/orders", icon: ShoppingBag, capability: "orders:view" },
      { label: "Payments", href: "/admin/payments", icon: CreditCard, capability: "payments:view" },
      // Reuses orders:view rather than a dedicated capability: this app has no standalone
      // "view customers" concept, and anyone who can see order history already sees the
      // same names/addresses on every order. Keeping it off product_manager (and any future
      // catalog-only role) is the point — customer PII has nothing to do with the catalogue.
      { label: "Customers", href: "/admin/customers", icon: Users, capability: "orders:view" },
      { label: "Returns", href: "/admin/returns", icon: PackageOpen, capability: "orders:returns" },
      { label: "ACS Courier", href: "/admin/courier", icon: Truck, capability: "orders:manage" },
      { label: "Newsletter", href: "/admin/newsletter", icon: Mail },
      { label: "Contact Messages", href: "/admin/messages", icon: MessageSquare },
      { label: "Ask a Stylist", href: "/admin/concierge", icon: Sparkles },
      { label: "Referrals", href: "/admin/referrals", icon: Users2 },
    ],
  },
  {
    title: "Insights",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Activity", href: "/admin/activity", icon: ScrollText, capability: "admin:activity" },
      { label: "Emails", href: "/admin/emails", icon: Send },
    ],
  },
  {
    title: "Configuration",
    items: [
      { label: "Payment Settings", href: "/admin/settings/payments", icon: Wallet, capability: "payments:configure" },
      { label: "Shipping", href: "/admin/settings/shipping", icon: Truck, capability: "admin:settings" },
      { label: "SEO Settings", href: "/admin/seo", icon: Search, capability: "admin:settings" },
      { label: "SEO Audit", href: "/admin/seo/audit", icon: ClipboardCheck, capability: "admin:settings" },
      { label: "Site Settings", href: "/admin/settings", icon: Settings, capability: "admin:settings" },
      // No capability: a read-only list of design tokens, with no data or actions to protect.
      { label: "Appearance", href: "/admin/appearance", icon: Palette },
      { label: "Users", href: "/admin/users", icon: UserCog, capability: "admin:users" },
      { label: "Roles & Permissions", href: "/admin/roles", icon: ShieldCheck },
    ],
  },
];
