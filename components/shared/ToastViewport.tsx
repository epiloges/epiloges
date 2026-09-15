"use client";
import { useTranslations } from "next-intl";

import { X } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { useCart } from "@/components/providers/CartProvider";
import { cn } from "@/lib/utils";

export function ToastViewport() {
  const tA11y = useTranslations("A11y");
  const { toasts, dismiss } = useToast();
  // Drives the offset rule in globals.css so a toast never lands on the drawer.
  const { isDrawerOpen } = useCart();

  return (
    <div
      data-toast-viewport
      data-cart-drawer-open={isDrawerOpen}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-200 flex flex-col items-center gap-2 p-4 sm:items-end"
      style={{ transition: "padding 300ms cubic-bezier(0.32, 0.72, 0, 1)" }}
    >
      {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-in fade-in slide-in-from-bottom-4 pointer-events-auto flex w-full max-w-sm items-start gap-3 border p-4 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.25)] duration-250",
              t.tone === "error" ? "border-destructive bg-luxe-white" : "border-luxe-black bg-luxe-white"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-xs text-luxe-gray-dark">{t.description}</p> : null}
              {t.action ? (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-xs font-medium tracking-[0.05em] uppercase underline underline-offset-4"
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
            <button type="button" aria-label={tA11y("dismiss")} onClick={() => dismiss(t.id)} className="shrink-0">
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        ))}
    </div>
  );
}
