import type { Address } from "@/lib/commerce/types";

export interface CreateShipmentInput {
  orderId: string;
  recipientName: string;
  address: Address;
  weightGrams: number;
  itemQuantity: number;
  /** Cash the courier must collect on delivery — set only for a Cash-on-Delivery order. */
  codAmount?: number;
  /** The shopper's own delivery instruction, printed on the label for the driver. */
  deliveryNotes?: string;
  /** Shop name as it should appear on the label. */
  senderName?: string;
}

export interface CreateShipmentResult {
  trackingNumber: string;
  carrier: string;
  trackingUrl: string;
}

/** Laser = A4 sheet with three labels; thermal = label roll. */
export type LabelFormat = "laser" | "thermal";

export interface PickupListResult {
  /** Null when the courier refused to close the day — see `unprintedVouchers`. */
  pickupListNo: string | null;
  /** Vouchers that must be printed (or deleted) before the day can be closed. */
  unprintedVouchers: string[];
}

export interface PickupListSummary {
  pickupListNo: string;
  issuedAt: string;
  voucherCount: number;
}

/**
 * Vendor-neutral seam for real courier integrations — same single-factory pattern as
 * `lib/commerce/index.ts`/`lib/email/index.ts`. `createShipment` is the one required
 * concern; a manually-entered tracking number (no live API call) is handled entirely in
 * the admin UI/Server Action, not through this interface.
 *
 * The rest is optional because it only means something for a courier that prints its
 * own labels and closes its day with a pickup list — which is ACS's model: a voucher is
 * not a shipment until it has been printed AND included in that day's pickup list.
 */
export interface CourierProvider {
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  /** The label(s) as a PDF. Up to ten tracking numbers at once. */
  printLabels?(trackingNumbers: string[], format: LabelFormat): Promise<Uint8Array>;
  /** Cancels a voucher that has not yet been closed into a pickup list. */
  deleteShipment?(trackingNumber: string): Promise<void>;
  /** Closes the day: every printed voucher for `date` (YYYY-MM-DD) becomes a real shipment. */
  issuePickupList?(date: string): Promise<PickupListResult>;
  printPickupList?(pickupListNo: string, date: string): Promise<Uint8Array>;
  listPickupLists?(date: string): Promise<PickupListSummary[]>;
}

export class CourierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourierError";
  }
}
