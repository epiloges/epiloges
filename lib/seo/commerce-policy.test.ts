import { describe, expect, it } from "vitest";
import type { ShippingSettings } from "@/types";
import { deliveryPolicy, deliveryPriceFor } from "./commerce-policy";

const settings: ShippingSettings = {
  freeShippingThreshold: 150,
  rates: [
    { id: "standard", label: "Παράδοση στον χώρο σας", description: "", estimatedDelivery: "1–3 εργάσιμες ημέρες", amount: 2.95, enabled: true, freeShippingEligible: true },
    { id: "pickup", label: "Παραλαβή από το κατάστημα", description: "", estimatedDelivery: "1–2 εργάσιμες ημέρες", amount: 0, enabled: true, freeShippingEligible: false },
    { id: "express", label: "Ταχεία", description: "", estimatedDelivery: "1–2 εργάσιμες ημέρες", amount: 14.95, enabled: true, freeShippingEligible: false },
    { id: "eu-standard", label: "Εξωτερικό", description: "", estimatedDelivery: "5–8 εργάσιμες ημέρες", amount: 14.95, enabled: true, freeShippingEligible: false, scope: "international" },
  ],
};

describe("deliveryPolicy", () => {
  it("picks the cheapest courier rate inside Greece — not free pickup, not the international rate", () => {
    const policy = deliveryPolicy(settings);
    expect(policy.price).toBe(2.95);
    expect(policy.transitDays).toEqual({ min: 1, max: 3 });
    expect(policy.freeAbove).toBe(150);
    expect(policy.country).toBe("GR");
  });

  it("has no free threshold when the chosen rate is not eligible for it", () => {
    const policy = deliveryPolicy({ ...settings, rates: settings.rates.map((rate) => ({ ...rate, freeShippingEligible: false })) });
    expect(policy.freeAbove).toBeNull();
    expect(deliveryPriceFor(policy, 999)).toBe(2.95);
  });

  it("prices an order at or over the threshold at zero", () => {
    const policy = deliveryPolicy(settings);
    expect(deliveryPriceFor(policy, 149.99)).toBe(2.95);
    expect(deliveryPriceFor(policy, 150)).toBe(0);
  });

  it("copes with a disabled or missing courier rate", () => {
    const policy = deliveryPolicy({ freeShippingThreshold: null, rates: [] });
    expect(policy.price).toBe(0);
    expect(policy.transitDays).toEqual({ min: 1, max: 3 });
  });
});
