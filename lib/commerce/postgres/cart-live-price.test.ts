import { describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toCart, type CartRow } from "./mappers";

const d = (n: number) => new Prisma.Decimal(n);

function cartWith(product: { priceAmount: number; salePriceAmount: number | null; status?: string; availableForSale?: boolean }): CartRow {
  const now = new Date("2026-09-27T10:00:00Z");
  return {
    id: "cart1",
    customerId: null,
    currencyCode: "EUR",
    createdAt: now,
    updatedAt: now,
    discounts: [],
    giftCards: [],
    lineItems: [
      {
        id: "li1",
        cartId: "cart1",
        productId: "p1",
        slug: "shoe",
        name: "Shoe",
        imageSrc: "/x.jpg",
        imageAlt: "Shoe",
        color: "",
        size: "38",
        // The price when it went in the cart — a sale that has since ended.
        unitPriceAmount: d(59),
        quantity: 1,
        maxQuantity: 1,
        savedForLater: false,
        addedAt: now,
        product: {
          priceAmount: d(product.priceAmount),
          salePriceAmount: product.salePriceAmount == null ? null : d(product.salePriceAmount),
          status: product.status ?? "active",
          availableForSale: product.availableForSale ?? true,
        },
      },
    ],
  } as unknown as CartRow;
}

/**
 * The cart used to charge the price stored when the item was added. Carts live for weeks, so
 * an ended sale or a corrected price typo kept being charged at checkout.
 */
describe("toCart prices line items live", () => {
  it("charges today's price, not the price at add-to-cart", () => {
    const cart = toCart(cartWith({ priceAmount: 89, salePriceAmount: null }), undefined);
    expect(cart.lineItems[0].unitPrice.amount).toBe(89);
    expect(cart.totals.subtotal.amount).toBe(89);
  });

  it("uses the sale price while a sale is on", () => {
    const cart = toCart(cartWith({ priceAmount: 89, salePriceAmount: 49 }), undefined);
    expect(cart.lineItems[0].unitPrice.amount).toBe(49);
  });

  it("flags a product that has been archived or switched off for sale", () => {
    expect(toCart(cartWith({ priceAmount: 89, salePriceAmount: null, status: "archived" }), undefined).lineItems[0].unavailable).toBe(true);
    expect(toCart(cartWith({ priceAmount: 89, salePriceAmount: null, availableForSale: false }), undefined).lineItems[0].unavailable).toBe(true);
    expect(toCart(cartWith({ priceAmount: 89, salePriceAmount: null }), undefined).lineItems[0].unavailable).toBeUndefined();
  });
});
