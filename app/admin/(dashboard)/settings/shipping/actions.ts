"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { SHIPPING_CACHE_TAG, getShippingSettings, saveShippingSettings } from "@/services/shipping";
import { firstIssueMessage, shippingSettingsSchema } from "@/lib/validation/site-content";
import type { ShippingSettings } from "@/types";

export interface SiteContentActionState {
  error?: string;
}

/**
 * Validated server-side (lib/validation/site-content.ts) before it is written — the
 * form's `min={0}` was the only thing between an admin and a delivery rate of −5 €, which
 * the storefront would have subtracted from every order total.
 */
export async function saveShippingSettingsAction(settings: ShippingSettings): Promise<SiteContentActionState> {
  await requireCapability("admin:settings");
  const parsed = shippingSettingsSchema.safeParse(settings);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };

  const before = await getShippingSettings();
  await saveShippingSettings(parsed.data);

  // A delivery price is a number every customer pays; the trail should say who changed it
  // and from what, the same way product.updated records a price change.
  const changedRates = parsed.data.rates
    .filter((rate) => {
      const previous = before.rates.find((r) => r.id === rate.id);
      return !previous || previous.amount !== rate.amount || previous.enabled !== rate.enabled || previous.label !== rate.label;
    })
    .map((rate) => `${rate.id}: ${rate.amount} (${rate.enabled ? "on" : "off"})`);
  await recordAdminAction({
    action: "settings.updated",
    targetType: "settings",
    targetId: "shipping",
    summary:
      changedRates.length > 0
        ? `Updated shipping — ${changedRates.join(", ")}`
        : `Updated shipping settings (free shipping over ${parsed.data.freeShippingThreshold ?? "—"})`,
    metadata: {
      thresholdBefore: before.freeShippingThreshold,
      thresholdAfter: parsed.data.freeShippingThreshold,
      ratesBefore: before.rates.map((r) => ({ id: r.id, amount: r.amount, enabled: r.enabled })),
      ratesAfter: parsed.data.rates.map((r) => ({ id: r.id, amount: r.amount, enabled: r.enabled })),
    },
  });

  // Shipping shows up in cart totals and at checkout on every page that renders a cart, so
  // this invalidates the whole tree rather than a single route.
  revalidatePath("/", "layout");
  updateTag(SHIPPING_CACHE_TAG);
  return {};
}
