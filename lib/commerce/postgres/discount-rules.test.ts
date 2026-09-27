import { describe, expect, it } from "vitest";
import { resolveCartAmounts } from "./cart-totals";

const base = { giftCards: [], currencyCode: "EUR", selectedShippingRate: undefined };
const lineItems = [{ unitPriceAmount: 100, quantity: 1, savedForLater: false }];

describe("discount rules in resolveCartAmounts", () => {
  /**
   * Two percentage codes used to add up — two 50% codes made the goods free. A cart that
   * picked up two before the one-per-order rule existed must still only get one.
   */
  it("applies only the first code when a cart carries two", () => {
    const result = resolveCartAmounts({
      ...base,
      lineItems,
      discounts: [
        { code: "HALF", type: "percentage", value: 50 },
        { code: "HALFAGAIN", type: "percentage", value: 50 },
      ],
    });
    expect(result.discounts.map((d) => d.code)).toEqual(["HALF"]);
    expect(result.totals.discountTotal.amount).toBe(50);
    expect(result.totals.total.amount).toBe(50);
  });

  it("drops a code whose minimum the subtotal no longer meets", () => {
    const result = resolveCartAmounts({
      ...base,
      lineItems,
      discounts: [{ code: "OVER150", type: "fixed", value: 20, minimumSubtotal: 150 }],
    });
    expect(result.discounts).toEqual([]);
    expect(result.totals.total.amount).toBe(100);
  });

  it("applies a code whose minimum is met exactly", () => {
    const result = resolveCartAmounts({
      ...base,
      lineItems,
      discounts: [{ code: "OVER100", type: "fixed", value: 20, minimumSubtotal: 100 }],
    });
    expect(result.totals.discountTotal.amount).toBe(20);
  });

  it("falls through to a later code when the first one's minimum isn't met", () => {
    const result = resolveCartAmounts({
      ...base,
      lineItems,
      discounts: [
        { code: "OVER150", type: "fixed", value: 30, minimumSubtotal: 150 },
        { code: "TEN", type: "fixed", value: 10 },
      ],
    });
    expect(result.discounts.map((d) => d.code)).toEqual(["TEN"]);
  });
});
