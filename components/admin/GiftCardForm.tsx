"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { giftCardFormSchema, type GiftCardFormValues } from "@/lib/validation/gift-card";
import { generateGiftCardCode, looksGenerated } from "@/lib/gift-card-code";
import type { GiftCardActionState } from "@/app/admin/(dashboard)/gift-cards/actions";

const inputClass =
  "h-10 w-full border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black aria-invalid:border-destructive";
const labelClass = "mb-1.5 block text-eyebrow";
const errorClass = "mt-1.5 text-xs text-destructive";
const sectionClass = "space-y-4 border border-border bg-luxe-white p-6";

interface GiftCardFormProps {
  defaultValues: GiftCardFormValues;
  onSubmit: (values: GiftCardFormValues) => Promise<GiftCardActionState>;
  submitLabel?: string;
}

export function GiftCardForm({ defaultValues, onSubmit, submitLabel = "Save Gift Card" }: GiftCardFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GiftCardFormValues>({
    resolver: zodResolver(giftCardFormSchema),
    // A fresh card starts with a generated code. Typing one over it still works (a card
    // printed in advance), but the default is the unguessable one.
    defaultValues: { ...defaultValues, code: defaultValues.code || generateGiftCardCode() },
  });
  const code = watch("code");

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    const result = await onSubmit(values);
    if (result?.error) setServerError(result.error);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {serverError ? (
        <p className="border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{serverError}</p>
      ) : null}

      <div className={sectionClass}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="gcf-code">
              Code
            </label>
            <div className="flex gap-2">
              <input id="gcf-code" className={`${inputClass} font-mono`} aria-invalid={Boolean(errors.code)} {...register("code")} />
              <button
                type="button"
                onClick={() => setValue("code", generateGiftCardCode(), { shouldDirty: true })}
                className="h-10 shrink-0 border border-border px-3 text-xs tracking-[0.05em] uppercase hover:border-luxe-black"
              >
                Generate
              </button>
            </div>
            {errors.code ? (
              <p className={errorClass}>{errors.code.message}</p>
            ) : code && !looksGenerated(code) ? (
              <p className="mt-1.5 text-xs text-amber-700">
                A code someone can guess (&ldquo;GIFT50&rdquo;) is a balance anyone can spend. Prefer a generated one unless the
                card is already printed.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-luxe-gray-dark">Give this exact code to the buyer; it can&apos;t be recovered later.</p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="gcf-balance">
              Balance (€)
            </label>
            <Controller
              name="balanceAmount"
              control={control}
              render={({ field }) => (
                <input
                  id="gcf-balance"
                  type="number"
                  step="0.01"
                  className={inputClass}
                  aria-invalid={Boolean(errors.balanceAmount)}
                  value={field.value ?? ""}
                  onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                />
              )}
            />
            {errors.balanceAmount ? <p className={errorClass}>{errors.balanceAmount.message}</p> : null}
          </div>
        </div>

        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
              Active
            </label>
          )}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 items-center justify-center bg-luxe-black px-8 text-sm font-medium tracking-[0.05em] text-luxe-white uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
