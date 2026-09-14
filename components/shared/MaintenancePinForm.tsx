"use client";

import { useState, type FormEvent } from "react";

interface MaintenancePinFormProps {
  labels: { legend: string; placeholder: string; submit: string; wrong: string; tooMany: string; failed: string };
}

/**
 * The four-digit door in the "back soon" page. On the right PIN the API sets the cookie the
 * proxy honours and the page reloads — a full reload rather than a router push, because the
 * proxy has to see the cookie before any page is served, and the URL the visitor asked for
 * (this page is a rewrite of it) is then the one they get.
 */
export function MaintenancePinForm({ labels }: MaintenancePinFormProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/maintenance/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      setError(res.status === 429 ? labels.tooMany : res.status === 401 ? labels.wrong : labels.failed);
      setPin("");
    } catch {
      setError(labels.failed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-14 flex flex-col items-center gap-3" aria-describedby={error ? "pin-error" : undefined}>
      <label htmlFor="maintenance-pin" className="text-xs tracking-[0.05em] text-luxe-gray-dark uppercase">
        {labels.legend}
      </label>
      <div className="flex gap-2">
        <input
          id="maintenance-pin"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4}"
          maxLength={4}
          placeholder={labels.placeholder}
          aria-invalid={error ? true : undefined}
          className="h-12 w-32 border border-border bg-luxe-white text-center font-mono text-lg tracking-[0.4em] outline-none placeholder:tracking-normal placeholder:text-luxe-gray-dark/60 focus:border-luxe-black"
        />
        <button
          type="submit"
          disabled={pin.length !== 4 || submitting}
          className="h-12 bg-luxe-black px-6 text-xs font-medium tracking-[0.08em] text-luxe-white uppercase disabled:opacity-40"
        >
          {labels.submit}
        </button>
      </div>
      {error ? (
        <p id="pin-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
