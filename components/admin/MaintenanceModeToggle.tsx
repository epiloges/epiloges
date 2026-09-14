"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/providers/ToastProvider";

interface MaintenanceModeToggleProps {
  defaultEnabled: boolean;
  onToggle: (enabled: boolean) => Promise<{ error?: string }>;
}

/**
 * The dashboard's shop-open / shop-closed switch. Optimistic like `ActiveToggle`, but with the
 * server's answer honoured: closing the shop is not something to appear to have happened.
 */
export function MaintenanceModeToggle({ defaultEnabled, onToggle }: MaintenanceModeToggleProps) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleChange = (next: boolean) => {
    setEnabled(next);
    startTransition(async () => {
      const result = await onToggle(next).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Something went wrong." }));
      if (result.error) {
        setEnabled(!next);
        toast({ title: "Could not change the store status", description: result.error, tone: "error" });
        return;
      }
      toast({ title: next ? "The shop is closed for maintenance" : "The shop is open again" });
    });
  };

  return (
    <label className="flex items-center gap-3">
      <Switch checked={enabled} onCheckedChange={handleChange} disabled={isPending} aria-label="Maintenance mode" />
      <span className="text-sm">{enabled ? "Maintenance mode is on" : "Maintenance mode is off"}</span>
    </label>
  );
}
