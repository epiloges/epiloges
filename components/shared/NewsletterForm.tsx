"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NewsletterFormValues } from "@/lib/validation/newsletter";

/**
 * One field, so no form library. This form is on every storefront page (the footer) and
 * it used to pull react-hook-form and zod — with zod's locale tables — into the homepage
 * bundle: ~300 KB of script, 62 KB over the wire, a third of everything the homepage
 * loaded, to check that one string has an @. The API route still validates with the real
 * schema; the browser only needs a plausibility check before it asks.
 */
const LOOKS_LIKE_EMAIL = /^[^s@]+@[^s@]+.[^s@]+$/;

interface NewsletterFormProps {
  ctaLabel?: string;
  compact?: boolean;
  /** Set when the form sits on a dark section background (e.g. the homepage Newsletter section). */
  onDark?: boolean;
  className?: string;
  /** Which surface this instance sits on — recorded with the signup. */
  source?: string;
  /** Escape hatch for pointing a given instance at a different destination (e.g. an ESP). */
  onSubscribe?: (values: NewsletterFormValues) => Promise<void>;
}

export function NewsletterForm({
  ctaLabel,
  compact = false,
  onDark = false,
  className,
  source,
  onSubscribe,
}: NewsletterFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const t = useTranslations("Newsletter");
  // The homepage renders this form twice (section + footer); a fixed id made two elements
  // share it, so the label and any browser autofill pointed at whichever came first.
  const inputId = useId();
  // The footer renders this with no ctaLabel; the homepage passes one from editable
  // section data. The fallback has to be translated, not a hardcoded "Subscribe".
  const label = ctaLabel ?? t("subscribe");
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  // Previously this awaited a 500ms timer and then reported success unconditionally,
  // discarding the address — so the confirmation below was a lie on every submission.
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError(t("emailRequired"));
      return;
    }
    if (!LOOKS_LIKE_EMAIL.test(trimmed)) {
      setFieldError(t("emailInvalid"));
      return;
    }
    setFieldError(null);
    const values: NewsletterFormValues = { email: trimmed };
    setSubmitting(true);
    try {
      if (onSubscribe) {
        await onSubscribe(values);
      } else {
        const response = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, source }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message ?? t("failed"));
        }
      }
      setSubmitted(true);
      setEmail("");
    } catch (error) {
      // Staying on the form with the address intact is the point — showing the success
      // state here would repeat the original bug in a subtler form.
      setSubmitError(error instanceof Error ? error.message : t("failed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <p className={cn("flex items-center gap-2 text-sm", className)}>
        <Check className="size-4" strokeWidth={1.5} />
        {t("thanks")}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      <div
        className={cn(
          "flex items-center border-b",
          onDark ? "border-luxe-white/30" : compact ? "border-luxe-gray-dark/40" : "border-luxe-black/30"
        )}
      >
        <label htmlFor={inputId} className="sr-only">
          {t("emailLabel")}
        </label>
        <input
          id={inputId}
          type="email"
          placeholder={t("emailPlaceholder")}
          className={cn(
            "w-full bg-transparent py-3 text-sm outline-none placeholder:text-current placeholder:opacity-50",
            compact ? "" : "text-base"
          )}
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (fieldError) setFieldError(null);
          }}
          aria-invalid={fieldError ? true : undefined}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          aria-label={label}
          className="flex shrink-0 items-center gap-1 py-3 pl-3 text-xs font-medium tracking-[0.1em] uppercase disabled:opacity-50"
        >
          {label}
          <ArrowRight className="size-4" strokeWidth={1.5} />
        </button>
      </div>
      {fieldError || submitError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {fieldError ?? submitError}
        </p>
      ) : null}
    </form>
  );
}
