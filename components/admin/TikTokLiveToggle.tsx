"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/providers/ToastProvider";

interface TikTokLiveToggleProps {
  defaultEnabled: boolean;
  onToggle: (enabled: boolean) => Promise<{ error?: string }>;
}

/** The dashboard's quick switch for the "We're Live on TikTok" storefront popup — same
 * optimistic-with-rollback pattern as MaintenanceModeToggle, so it's one click from the
 * page merchants already have open right before they go live, not buried in Site Settings. */
export function TikTokLiveToggle({ defaultEnabled, onToggle }: TikTokLiveToggleProps) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleChange = (next: boolean) => {
    setEnabled(next);
    startTransition(async () => {
      const result = await onToggle(next).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Something went wrong." }));
      if (result.error) {
        setEnabled(!next);
        toast({ title: "Could not change the TikTok Live popup", description: result.error, tone: "error" });
        return;
      }
      toast({ title: next ? "TikTok Live popup is on" : "TikTok Live popup is off" });
    });
  };

  return (
    <label className="flex items-center gap-3">
      <Switch checked={enabled} onCheckedChange={handleChange} disabled={isPending} aria-label="We're Live on TikTok popup" />
      <span className="text-sm">{enabled ? "TikTok Live popup is on" : "TikTok Live popup is off"}</span>
    </label>
  );
}
