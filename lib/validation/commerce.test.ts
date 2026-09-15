import { describe, expect, it } from "vitest";
import { shippingRateSchema } from "@/lib/validation/commerce";
import { computeShippingChargeForRate } from "@/lib/shipping";

describe("shippingRateSchema", () => {
  /**
   * The regression behind order #BGOYC6D7 (2026-09-15): a 118 € basket over a 100 € free-
   * shipping line was charged 2,95 €, because the stored rate came back without its
   * threshold and the checkout re-priced delivery from it.
   */
  it("keeps the free-shipping threshold on a stored rate, so re-pricing it still gives free delivery", () => {
    const stored = shippingRateSchema.parse({
      id: "standard",
      label: "Παράδοση στον χώρο σας",
      description: "ACS Courier · 1–3 εργάσιμες ημέρες",
      estimatedDelivery: "1–3 εργάσιμες ημέρες",
      price: { amount: 2.95, currencyCode: "EUR" },
      freeOverAmount: 100,
    });
    expect(stored.freeOverAmount).toBe(100);
    expect(computeShippingChargeForRate(stored, 106.2, true)).toBe(0);
    expect(computeShippingChargeForRate(stored, 99.99, true)).toBe(2.95);
  });

  it("still reads a rate stored before the threshold existed", () => {
    const stored = shippingRateSchema.parse({
      id: "standard",
      label: "x",
      description: "y",
      estimatedDelivery: "z",
      price: { amount: 2.95, currencyCode: "EUR" },
    });
    expect(stored.freeOverAmount).toBeUndefined();
    expect(computeShippingChargeForRate(stored, 500, true)).toBe(2.95);
  });
});
