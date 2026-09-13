import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";

interface CheckoutHeaderProps {
  siteName: string;
}

export function CheckoutHeader({ siteName }: CheckoutHeaderProps) {
  const t = useTranslations("Checkout");
  return (
    <header className="border-b border-border bg-luxe-white">
      <div className="container-luxe flex h-16 items-center justify-between">
        <Link href="/" className="shrink-0 font-heading text-lg tracking-[0.1em] uppercase">
          {siteName}
        </Link>
        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap text-luxe-gray-dark" title={t("secureCheckout")}>
          <Lock className="size-3.5" strokeWidth={1.5} aria-hidden />
          <span className="hidden sm:inline">{t("secureCheckout")}</span>
          <span className="sr-only sm:hidden">{t("secureCheckout")}</span>
        </div>
        <Link href="/cart" className="shrink-0 text-xs font-medium tracking-[0.05em] uppercase underline underline-offset-4">
          {t("backToBag")}
        </Link>
      </div>
    </header>
  );
}
