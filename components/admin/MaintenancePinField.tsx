"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/providers/ToastProvider";

interface MaintenancePinFieldProps {
  defaultPin: string;
  onSave: (pin: string) => Promise<{ error?: string }>;
}

/** The tester PIN shown beside the maintenance switch; four digits, saved on demand. */
export function MaintenancePinField({ defaultPin, onSave }: MaintenancePinFieldProps) {
  const [pin, setPin] = useState(defaultPin);
  const [savedPin, setSavedPin] = useState(defaultPin);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const save = () => {
    startTransition(async () => {
      const result = await onSave(pin).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Something went wrong." }));
      if (result.error) {
        toast({ title: "Could not change the PIN", description: result.error, tone: "error" });
        return;
      }
      setSavedPin(pin);
      toast({ title: `Tester PIN is now ${pin}`, description: "Anyone who used the old PIN will have to enter the new one." });
    });
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="maintenance-pin" className="text-xs text-luxe-gray-dark uppercase">
        Tester PIN
      </label>
      <input
        id="maintenance-pin"
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        maxLength={4}
        className="h-9 w-20 border border-border px-2 text-center font-mono text-sm tracking-[0.3em] outline-none focus:border-luxe-black"
      />
      {pin !== savedPin ? (
        <button
          type="button"
          onClick={save}
          disabled={pin.length !== 4 || isPending}
          className="h-9 border border-luxe-black px-3 text-xs font-medium tracking-[0.05em] uppercase disabled:opacity-40"
        >
          Save
        </button>
      ) : null}
    </div>
  );
}
