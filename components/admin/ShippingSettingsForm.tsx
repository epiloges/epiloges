"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { ShippingSettings } from "@/types";

interface ShippingSettingsFormProps {
  initialSettings: ShippingSettings;
  onSave: (settings: ShippingSettings) => Promise<{ error?: string } | void>;
}

const inputClass = "h-10 w-full border border-border px-3 text-sm outline-none focus:border-luxe-black";
const labelClass = "mb-1 block text-xs font-medium text-luxe-gray-dark uppercase";

export function ShippingSettingsForm({ initialSettings, onSave }: ShippingSettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [remoteDrafts, setRemoteDrafts] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const freeShippingOn = settings.freeShippingThreshold !== null;

  const patchRate = (id: string, patch: Partial<ShippingSettings["rates"][number]>) => {
    setSettings((prev) => ({
      ...prev,
      rates: prev.rates.map((rate) => (rate.id === id ? { ...rate, ...patch } : rate)),
    }));
    setSaved("idle");
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const result = await onSave(settings);
        if (result?.error) {
          setSaveError(result.error);
          setSaved("error");
          return;
        }
        setSaveError(null);
        setSaved("saved");
      } catch {
        setSaveError(null);
        setSaved("error");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="border border-border bg-luxe-white p-4">
        <h3 className="mb-1 text-sm font-medium">Free shipping</h3>
        <p className="mb-4 text-xs text-luxe-gray-dark">
          Applies to rates marked eligible below, on the order value after any discount and before
          shipping. Turning it off charges every rate its listed price at any basket size.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={freeShippingOn}
            onChange={(event) => {
              setSettings((prev) => ({
                ...prev,
                // Remembers 150 as the value to come back to rather than 0, which would make
                // every order free the moment someone re-enabled it.
                freeShippingThreshold: event.target.checked ? (prev.freeShippingThreshold ?? 150) : null,
              }));
              setSaved("idle");
            }}
          />
          Offer free shipping over a threshold
        </label>

        {freeShippingOn ? (
          <div className="mt-3 max-w-48">
            <label className={labelClass} htmlFor="free-shipping-threshold">
              Threshold (EUR)
            </label>
            <input
              id="free-shipping-threshold"
              type="number"
              min={0}
              step="0.01"
              value={settings.freeShippingThreshold ?? 0}
              onChange={(event) => {
                setSettings((prev) => ({ ...prev, freeShippingThreshold: Number(event.target.value) }));
                setSaved("idle");
              }}
              className={inputClass}
            />
          </div>
        ) : null}
      </div>

      <div className="border border-border bg-luxe-white">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-medium">Delivery methods</h3>
          <p className="mt-1 text-xs text-luxe-gray-dark">
            Prices include VAT, like every other amount shown to a customer. A disabled method
            disappears from checkout but stays readable on orders that already used it.
          </p>
        </div>

        <div className="divide-y divide-border">
          {settings.rates.map((rate) => (
            <div key={rate.id} className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                {/* The id is persisted on every checkout and order row, so it is shown but never
                    editable — renaming one would orphan the rate on historical orders. */}
                <span className="font-mono text-xs text-luxe-gray-dark">{rate.id}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rate.enabled}
                    onChange={(event) => patchRate(rate.id, { enabled: event.target.checked })}
                  />
                  Available at checkout
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Name shown to customers</label>
                  <input
                    value={rate.label}
                    onChange={(event) => patchRate(rate.id, { label: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Price (EUR, incl. VAT)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={rate.amount}
                    onChange={(event) => patchRate(rate.id, { amount: Number(event.target.value) })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <input
                    value={rate.description}
                    onChange={(event) => patchRate(rate.id, { description: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Delivery estimate</label>
                  <input
                    value={rate.estimatedDelivery}
                    onChange={(event) => patchRate(rate.id, { estimatedDelivery: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rate.freeShippingEligible}
                  onChange={(event) => patchRate(rate.id, { freeShippingEligible: event.target.checked })}
                />
                Free over the threshold
                {!freeShippingOn ? (
                  <span className="text-xs text-luxe-gray-dark">(free shipping is currently off)</span>
                ) : null}
              </label>

              {/*
                The remote-area surcharge (δυσπρόσιτες περιοχές) was applied at checkout
                (lib/shipping.ts) from data nobody could see or change here — a rate could
                quietly charge a different price for hundreds of postal codes with no trace
                of it on this page. Shown only for domestic rates, since it never applies to
                international ones.
              */}
              {rate.scope !== "international" ? (
                <details className="text-sm" open={Boolean(rate.remoteAreas)}>
                  <summary className="cursor-pointer text-xs text-luxe-gray-dark">
                    Remote-area surcharge
                    {rate.remoteAreas
                      ? ` — ${rate.remoteAreas.amount} € for ${rate.remoteAreas.postalCodes.length} postal codes`
                      : " — none"}
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                    <div>
                      <label className={labelClass}>Price in these areas (EUR)</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={rate.remoteAreas?.amount ?? ""}
                        placeholder="Same as above"
                        onChange={(event) => {
                          const value = event.target.value;
                          patchRate(rate.id, {
                            remoteAreas:
                              value === ""
                                ? undefined
                                : { amount: Number(value), postalCodes: rate.remoteAreas?.postalCodes ?? [] },
                          });
                        }}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Postal codes (comma or line separated)</label>
                      {/* Typed into a draft and parsed on blur — parsing on every keystroke
                          would eat the comma the moment it was typed. */}
                      <textarea
                        rows={3}
                        value={remoteDrafts[rate.id] ?? (rate.remoteAreas?.postalCodes ?? []).join(", ")}
                        disabled={!rate.remoteAreas}
                        onChange={(event) => setRemoteDrafts((prev) => ({ ...prev, [rate.id]: event.target.value }))}
                        onBlur={(event) => {
                          const postalCodes = event.target.value
                            .split(/[\s,;]+/)
                            .map((code) => code.trim())
                            .filter(Boolean);
                          setRemoteDrafts((prev) => {
                            const next = { ...prev };
                            delete next[rate.id];
                            return next;
                          });
                          patchRate(rate.id, {
                            remoteAreas: { amount: rate.remoteAreas?.amount ?? rate.amount, postalCodes },
                          });
                        }}
                        className={inputClass.replace("h-10", "h-auto py-2")}
                      />
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border p-4">
          {saved === "saved" ? (
            <span className="flex items-center gap-1 text-xs text-green-700">
              <Check className="size-3.5" strokeWidth={1.5} />
              Saved
            </span>
          ) : saved === "error" ? (
            <span role="alert" className="text-xs text-destructive">{saveError ?? "Couldn't save. Try again."}</span>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="h-9 bg-luxe-black px-5 text-xs font-medium tracking-[0.05em] text-luxe-white uppercase disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
