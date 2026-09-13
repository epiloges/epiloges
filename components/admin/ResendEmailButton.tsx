"use client";

import { useState, useTransition } from "react";
import { resendLoggedEmail } from "@/app/admin/(dashboard)/emails/actions";

export function ResendEmailButton({ id, failed }: { id: string; failed: boolean }) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(failed ? "Try sending this email again?" : "Send this email to the recipient again?")) return;
          startTransition(async () => {
            const result = await resendLoggedEmail(id);
            setMessage(result.error ? { tone: "error", text: result.error } : { tone: "ok", text: result.success ?? "Sent." });
          });
        }}
        className={`h-8 border px-3 text-xs tracking-[0.05em] uppercase disabled:opacity-50 ${failed ? "border-luxe-black" : "border-border text-luxe-gray-dark hover:border-luxe-black"}`}
      >
        {pending ? "Sending…" : failed ? "Retry" : "Send again"}
      </button>
      {message ? <span className={`max-w-[18rem] text-right text-xs ${message.tone === "error" ? "text-destructive" : "text-green-700"}`}>{message.text}</span> : null}
    </span>
  );
}
