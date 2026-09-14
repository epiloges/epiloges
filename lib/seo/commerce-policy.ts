import type { ShippingSettings } from "@/types";

/**
 * The shop's delivery and return terms, as the product feeds and the structured data
 * state them — read from the same shipping settings the checkout charges, so a rate the
 * admin changes on Monday is what Google shows under the result on Tuesday.
 *
 * "Delivery" means a courier to the door inside Greece: store pickup (free, but not a
 * delivery) and the international rate are excluded from the cheapest-rate calculation.
 */
export interface DeliveryPolicy {
  price: number;
  currency: string;
  /** Order value at or above which delivery is free; null when free shipping is off. */
  freeAbove: number | null;
  /** Working days quoted for the rate, parsed from its label ("1–3 εργάσιμες ημέρες"). */
  transitDays: { min: number; max: number };
  country: string;
}

export const RETURN_WINDOW_DAYS = 14;

export function deliveryPolicy(settings: ShippingSettings, country = "GR", currency = "EUR"): DeliveryPolicy {
  const candidates = settings.rates.filter((rate) => rate.enabled && rate.scope !== "international" && rate.id !== "pickup");
  const cheapest = candidates.length ? candidates.reduce((best, rate) => (rate.amount < best.amount ? rate : best)) : undefined;
  const digits = (cheapest?.estimatedDelivery ?? "").match(/\d+/g)?.map(Number) ?? [];
  const min = digits[0] ?? 1;
  const max = digits[1] ?? Math.max(min, 3);
  return {
    price: cheapest?.amount ?? 0,
    currency,
    freeAbove: cheapest?.freeShippingEligible ? settings.freeShippingThreshold : null,
    transitDays: { min, max },
    country,
  };
}

/** What one order actually pays for delivery under the policy. */
export function deliveryPriceFor(policy: DeliveryPolicy, orderValue: number): number {
  return policy.freeAbove !== null && orderValue >= policy.freeAbove ? 0 : policy.price;
}
