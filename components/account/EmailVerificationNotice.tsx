"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * Shown at the top of every account page until the address is verified. Deliberately a
 * notice and not a wall: nothing is locked, it just says the one thing worth knowing —
 * if this address is wrong, no order email will ever arrive — and offers the link again.
 */
export function EmailVerificationNotice() {
  const t = useTranslations("Account");
  const { customer } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!customer || customer.emailVerified) return null;

  async function resend() {
    setSending(true);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      setSent(true);
      toast({ title: t("verifyEmailSent", { email: customer!.email }) });
    } catch {
      toast({ title: t("verifyEmailSendFailed"), tone: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-8 flex flex-col gap-3 border border-border bg-luxe-white p-5 text-sm md:flex-row md:items-center md:justify-between" role="status">
      <div>
        <p className="font-medium">{t("verifyEmailNoticeTitle")}</p>
        <p className="mt-1 text-luxe-gray-dark">{t("verifyEmailNoticeBody", { email: customer.email })}</p>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={sending || sent}
        className="h-10 shrink-0 border border-luxe-black px-5 text-xs font-medium tracking-[0.08em] uppercase transition-colors hover:bg-luxe-black hover:text-luxe-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-inherit"
      >
        {sent ? t("verifyEmailResent") : t("verifyEmailResend")}
      </button>
    </div>
  );
}
