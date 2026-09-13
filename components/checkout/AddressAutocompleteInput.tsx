"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface AddressInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

/**
 * The street-address field. It used to be an "autocomplete" backed by fifteen hard-coded
 * foreign addresses — typing a Greek street showed nothing, typing "Erm" offered
 * Kurfürstendamm in Berlin — which reads as a broken feature, not a helpful one. A plain
 * field with a Greek placeholder is honest; a real provider (Google Places, Loqate) can
 * be wired into this same component later without touching the forms.
 */
export function AddressAutocompleteInput({ id, label, value, onChange, error, placeholder }: AddressInputProps) {
  const t = useTranslations("Address");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium tracking-[0.05em] uppercase">
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="address-line1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("streetAddressPlaceholder")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "h-11 w-full border bg-transparent px-3 text-sm outline-none placeholder:text-luxe-gray-dark/60 focus:border-luxe-black",
          error ? "border-destructive" : "border-border"
        )}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
