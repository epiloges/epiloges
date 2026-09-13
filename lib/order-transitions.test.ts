import { describe, expect, it } from "vitest";
import {
  ORDER_TRANSITIONS,
  RETURN_TRANSITIONS,
  canTransitionOrder,
  canTransitionReturn,
  paymentBlocksTransition,
} from "@/lib/order-transitions";

describe("order transitions", () => {
  it("follows the fulfilment flow", () => {
    expect(canTransitionOrder("confirmed", "shipped")).toBe(true);
    expect(canTransitionOrder("shipped", "delivered")).toBe(true);
    expect(canTransitionOrder("delivered", "refunded")).toBe(true);
  });

  it("refuses the jumps the audit found", () => {
    // Delivered → Confirmed → Delivered was the sequence that left restocked units on the
    // shelf for an order that had been delivered.
    expect(canTransitionOrder("delivered", "confirmed")).toBe(false);
    expect(canTransitionOrder("refunded", "confirmed")).toBe(false);
    expect(canTransitionOrder("refunded", "delivered")).toBe(false);
    expect(canTransitionOrder("cancelled", "shipped")).toBe(false);
  });

  it("keeps refunded terminal", () => {
    expect(ORDER_TRANSITIONS.refunded).toEqual([]);
  });

  it("allows the single-step undos", () => {
    expect(canTransitionOrder("cancelled", "confirmed")).toBe(true);
    expect(canTransitionOrder("delivered", "shipped")).toBe(true);
    expect(canTransitionOrder("shipped", "processing")).toBe(true);
  });

  it("treats a no-op as allowed", () => {
    expect(canTransitionOrder("shipped", "shipped")).toBe(true);
  });
});

describe("paymentBlocksTransition", () => {
  const paid = { status: "paid" as const, amountHeld: 39.85, currencyCode: "EUR" };

  it("blocks refunded and cancelled while the shop still holds the money", () => {
    expect(paymentBlocksTransition("refunded", paid)).toMatch(/39\.85 EUR/);
    expect(paymentBlocksTransition("cancelled", paid)).toMatch(/Refund the payment first/);
    expect(paymentBlocksTransition("cancelled", { ...paid, status: "partially_refunded" })).not.toBeNull();
  });

  it("does not block fulfilment steps, cancelling an uncollected order, or refunding a refunded one", () => {
    expect(paymentBlocksTransition("shipped", paid)).toBeNull();
    expect(paymentBlocksTransition("refunded", { ...paid, status: "pending" })).toMatch(/cancel it instead/);
    expect(paymentBlocksTransition("cancelled", { ...paid, status: "awaiting_bank_transfer" })).toBeNull();
    expect(paymentBlocksTransition("refunded", { ...paid, status: "refunded" })).toBeNull();
    expect(paymentBlocksTransition("refunded", null)).toBeNull();
  });
});

describe("return transitions", () => {
  it("cannot walk back from a restocked state", () => {
    expect(canTransitionReturn("received", "approved")).toBe(false);
    expect(canTransitionReturn("refunded", "requested")).toBe(false);
    expect(RETURN_TRANSITIONS.refunded).toEqual([]);
  });

  it("allows the normal path and the undo of a decision", () => {
    expect(canTransitionReturn("requested", "approved")).toBe(true);
    expect(canTransitionReturn("approved", "received")).toBe(true);
    expect(canTransitionReturn("rejected", "requested")).toBe(true);
  });
});
