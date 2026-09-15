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
  /** YYYY-MM-DD the courier should collect; defaults to the next working day. */
  pickupDate?: string;
}

export interface CreateShipmentResult {
  trackingNumber: string;
  carrier: string;
  trackingUrl: string;
  /**
   * For a shipment of several parcels: every voucher number the courier returned besides
   * the main one, in the order it returned them. ACS issues one label per parcel (the
   * owner's words: "one starting with 9, the other with 8"). Empty for a single parcel.
   */
  pieceTrackingNumbers?: string[];
  /** The raw keys of the courier's first response row — kept once so a new response shape is visible in the activity log rather than guessed at. */
  responseKeys?: string[];
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
  /**
   * The label(s) as a PDF. Up to ten tracking numbers at once; on A4 they flow three to
   * a sheet, and `startPosition` (1–3) picks the first slot so a half-used sheet can be
   * finished. Ignored for thermal.
   */
  printLabels?(trackingNumbers: string[], format: LabelFormat, startPosition?: 1 | 2 | 3): Promise<Uint8Array>;
  /** Cancels a voucher that has not yet been closed into a pickup list. */
  deleteShipment?(trackingNumber: string): Promise<void>;
  /** Closes the day: every printed voucher for `date` (YYYY-MM-DD) becomes a real shipment. */
  issuePickupList?(date: string): Promise<PickupListResult>;
  printPickupList?(pickupListNo: string, date: string): Promise<Uint8Array>;
  listPickupLists?(date: string): Promise<PickupListSummary[]>;
  /** The tracking numbers a pickup list closed. */
  listPickupListVouchers?(pickupListNo: string, date: string): Promise<string[]>;
  /** Where a parcel is, from the courier's tracking service. */
  trackShipment?(trackingNumber: string): Promise<TrackingStatus>;
}

/** One line of a parcel's history, newest last. */
export interface TrackingEvent {
  /** ISO timestamp when the courier gave one, else the raw text. */
  at?: string;
  status: string;
  location?: string;
}

export interface TrackingStatus {
  trackingNumber: string;
  /** True once the courier has scanned the parcel in — before that ACS knows nothing of it. */
  known: boolean;
  delivered: boolean;
  /** ISO timestamp of the delivery, when reported. */
  deliveredAt?: string;
  events: TrackingEvent[];
  /** The courier's own rows, untouched — kept until the response shape is known for sure. */
  raw: Record<string, unknown>[];
}

export class CourierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourierError";
  }
}
