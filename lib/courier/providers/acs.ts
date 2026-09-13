import "server-only";
import {
  CourierError,
  type CourierProvider,
  type CreateShipmentInput,
  type CreateShipmentResult,
  type LabelFormat,
  type PickupListResult,
  type PickupListSummary,
} from "@/lib/courier/types";
import { ACS_CARRIER_NAME, buildTrackingUrl } from "@/lib/courier/tracking-url";

/**
 * One URL for test and production accounts alike: ACS hands out test credentials on the
 * same endpoint and the numbers they produce are simply not real. Overridable for the day
 * that changes.
 */
const ACS_BASE_URL = process.env.ACS_BASE_URL || "https://webservices.acscourier.net/ACSRestServices/api/ACSAutoRest";

/**
 * REL-001. Tighter than the Stripe ceiling because nothing a shopper is waiting on depends
 * on it — a voucher is created after the order exists, so failing fast here delays a label,
 * not a purchase.
 */
const ACS_TIMEOUT_MS = 10_000;

export interface AcsCredentials {
  apiKey: string;
  companyId: string;
  companyPassword: string;
  userId: string;
  userPassword: string;
  billingCode: string;
}

/**
 * Real ACS Courier REST API integration — `ACSAlias`/`ACSInputParameters` envelope,
 * `AcsApiKey` header — covering the whole daily cycle ACS describes: create a voucher,
 * print it, close the day with a pickup list, print the list. A voucher that is created
 * but never printed and listed is not a shipment; its barcode will not scan.
 *
 * Request and response shapes follow *ACS Rest API Web Services* (June 2024 edition,
 * distributed by ACS in September 2026). Every response is
 *
 *     { ACSExecution_HasError, ACSExecutionErrorMessage,
 *       ACSOutputResponce: { ACSValueOutput: [ {…} ], ACSTableOutput: { Table_Data: […] } } }
 *
 * — note the spelling of `ACSOutputResponce`, which is what ACS actually sends; the
 * correctly spelt key is accepted too in case they ever fix it. ACS also always answers
 * HTTP 200: a wrong key is 403, too many calls is 406, and everything else — including a
 * rejected voucher — is a 200 with `ACSExecution_HasError` or a per-row `Error_Message`.
 *
 * Label PDFs come back as bytes inside the JSON. The guide says only that each row is "a
 * dictionary keyed by voucher whose value is the PDF byte array", so `extractPdf` searches
 * the output for anything PDF-shaped (a byte array or base64 text beginning `%PDF-`)
 * rather than depending on the key name.
 */
export function createAcsCourierProvider(creds: AcsCredentials): CourierProvider {
  async function call(alias: string, params: Record<string, unknown>): Promise<AcsOutput> {
    let res: Response;
    try {
      res = await fetch(ACS_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          AcsApiKey: creds.apiKey,
        },
        body: JSON.stringify({
          ACSAlias: alias,
          ACSInputParameters: {
            Company_ID: creds.companyId,
            Company_Password: creds.companyPassword,
            User_ID: creds.userId,
            User_Password: creds.userPassword,
            ...params,
          },
        }),
        signal: AbortSignal.timeout(ACS_TIMEOUT_MS),
      });
    } catch (error) {
      /**
       * REL-001. Unlike the Stripe path there is no idempotency key here, so a timed-out
       * `ACS_Create_Voucher` may have produced a voucher we never saw the number for. That
       * is the safer direction to fail in — a duplicate voucher costs a courier label, a
       * hung request costs the whole checkout invocation — but it does mean a timeout wants
       * a human to check ACS before retrying, which is what the message says.
       */
      if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new CourierError(
          `ACS did not respond within ${ACS_TIMEOUT_MS}ms (${alias}). The request may still have been processed — check the ACS portal before retrying.`
        );
      }
      throw new CourierError(`ACS request failed (${alias}): ${error instanceof Error ? error.message : String(error)}`);
    }

    const text = await res.text();
    if (res.status === 403) throw new CourierError("ACS rejected the API key (403). Check ACS_API_KEY.");
    if (res.status === 406) throw new CourierError("ACS rate limit hit (406) — more than 10 calls in a second.");
    if (!res.ok) throw new CourierError(`ACS API returned ${res.status}: ${text.slice(0, 500)}`);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new CourierError(`ACS API returned a non-JSON response: ${text.slice(0, 500)}`);
    }

    if (body.ACSExecution_HasError === true) {
      throw new CourierError(`ACS ${alias}: ${String(body.ACSExecutionErrorMessage || "execution failed")}`);
    }
    const output = (body.ACSOutputResponce ?? body.ACSOutputResponse ?? {}) as Record<string, unknown>;
    const values = Array.isArray(output.ACSValueOutput) ? (output.ACSValueOutput as Record<string, unknown>[]) : [];
    const table = (output.ACSTableOutput ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(table.Table_Data) ? (table.Table_Data as Record<string, unknown>[]) : [];
    return { alias, output, first: values[0] ?? {}, rows, raw: body };
  }

  /** Per-row errors ride inside a successful execution — a rejected voucher is one of these. */
  function rowError(out: AcsOutput): string | null {
    const message = out.first.Error_Message;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  }

  return {
    async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
      const { address, recipientName, weightGrams, itemQuantity, codAmount } = input;
      const { street, number } = splitStreetNumber(address.address1);
      const out = await call("ACS_Create_Voucher", {
        Pickup_Date: todayInAthens(),
        Sender: input.senderName ?? null,
        Recipient_Name: recipientName,
        Recipient_Address: [street, address.address2].filter(Boolean).join(", "),
        Recipient_Address_Number: number,
        Recipient_Zipcode: address.postalCode.replace(/\s+/g, ""),
        Recipient_Region: address.city,
        Recipient_Phone: null,
        // ACS texts the recipient from this number (absent notes, rescheduling), so the
        // one phone the checkout collects goes here rather than in the landline slot.
        Recipient_Cell_Phone: address.phone ?? null,
        Recipient_Floor: null,
        Recipient_Company_Name: address.company || null,
        Recipient_Country: address.countryCode,
        Acs_Station_Destination: null,
        Acs_Station_Branch_Destination: null,
        Billing_Code: creds.billingCode,
        // 2 = the sender pays the shipping; 4 would bill the recipient.
        Charge_Type: 2,
        Cost_Center_Code: null,
        Item_Quantity: itemQuantity,
        // ACS's floor is 0.5 kg; anything lighter is rejected outright.
        Weight: Math.max(0.5, Math.round((weightGrams / 1000) * 100) / 100),
        Dimension_X_In_Cm: null,
        Dimension_Y_in_Cm: null,
        Dimension_Z_in_Cm: null,
        /**
         * Αντικαταβολή. Without these three the courier delivers the parcel and collects
         * nothing — the order would be paid by nobody. 0 = cash (1 would be a cheque).
         */
        Cod_Ammount: codAmount && codAmount > 0 ? Math.round(codAmount * 100) / 100 : null,
        Cod_Payment_Way: codAmount && codAmount > 0 ? 0 : null,
        Acs_Delivery_Products: codAmount && codAmount > 0 ? "COD" : null,
        Insurance_Ammount: null,
        Delivery_Notes: input.deliveryNotes?.trim() || null,
        Appointment_Until_Time: null,
        // Deliberately not sent: it would have ACS email the customer directly, which is
        // a customer-communication decision, not a field to switch on quietly.
        Recipient_Email: null,
        /**
         * Our own order id, carried into ACS's records. It is what makes
         * `ACS_POD_FROM_REFERENCE_NO` usable and lets a voucher in the ACS portal be traced
         * back to an order here. Free to send now, impossible to add retroactively.
         */
        Reference_Key1: input.orderId,
        Reference_Key2: null,
        With_Return_Voucher: null,
        Content_Type_ID: null,
        Language: null,
      });

      const error = rowError(out);
      if (error) throw new CourierError(`ACS refused the voucher: ${error}`);

      const voucher = out.first.Voucher_No;
      const trackingNumber = typeof voucher === "string" || typeof voucher === "number" ? String(voucher).trim() : "";
      if (!trackingNumber) {
        throw new CourierError(
          `ACS_Create_Voucher succeeded but no voucher number was found in the response: ${JSON.stringify(out.raw).slice(0, 500)}`
        );
      }

      return {
        trackingNumber,
        carrier: ACS_CARRIER_NAME,
        trackingUrl: buildTrackingUrl(ACS_CARRIER_NAME) ?? "https://www.acscourier.net/en/track-and-trace",
      };
    },

    async printLabels(trackingNumbers: string[], format: LabelFormat): Promise<Uint8Array> {
      if (trackingNumbers.length === 0 || trackingNumbers.length > 10) {
        throw new CourierError("ACS prints between 1 and 10 vouchers per call.");
      }
      const out = await call("ACS_Print_Voucher", {
        Language: "GR",
        Voucher_No: trackingNumbers.join(","),
        // 2 = laser (A4, three labels a sheet), 1 = thermal roll. Start_Position only
        // matters for laser: which of the three label slots to begin on.
        Print_Type: format === "thermal" ? 1 : 2,
        Start_Position: 1,
      });
      const error = rowError(out);
      if (error) throw new CourierError(`ACS could not print the voucher: ${error}`);
      const pdf = extractPdf(out.output);
      if (!pdf) {
        throw new CourierError(`ACS_Print_Voucher returned no PDF: ${JSON.stringify(out.raw).slice(0, 500)}`);
      }
      return pdf;
    },

    async deleteShipment(trackingNumber: string): Promise<void> {
      const out = await call("ACS_Delete_Voucher", { Language: null, Voucher_No: trackingNumber });
      const error = rowError(out);
      if (error) throw new CourierError(`ACS would not delete the voucher: ${error}`);
    },

    async issuePickupList(date: string): Promise<PickupListResult> {
      // MyData null closes every user's vouchers on the account, which is what a shop
      // with one login wants; 1 would restrict it to this user's own.
      const out = await call("ACS_Issue_Pickup_List", { Language: "GR", Pickup_Date: date, MyData: null });
      const unprinted = out.rows
        .map((row) => row.Unprinted_Vouchers)
        .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
        .map(String);
      const listNo = out.first.PickupList_No;
      const pickupListNo = typeof listNo === "string" || typeof listNo === "number" ? String(listNo).trim() : "";
      if (!pickupListNo) {
        // "Unprinted vouchers found" is the documented refusal and the caller handles it;
        // anything else is a real failure.
        if (unprinted.length > 0) return { pickupListNo: null, unprintedVouchers: unprinted };
        const error = rowError(out);
        throw new CourierError(
          error ? `ACS could not issue the pickup list: ${error}` : `ACS_Issue_Pickup_List returned no list number: ${JSON.stringify(out.raw).slice(0, 500)}`
        );
      }
      return { pickupListNo, unprintedVouchers: unprinted };
    },

    async printPickupList(pickupListNo: string, date: string): Promise<Uint8Array> {
      const out = await call("ACS_Print_Pickup_List", { Language: "GR", Mass_Number: pickupListNo, Pickup_Date: date });
      const error = rowError(out);
      if (error) throw new CourierError(`ACS could not print the pickup list: ${error}`);
      const pdf = extractPdf(out.output);
      if (!pdf) {
        throw new CourierError(`ACS_Print_Pickup_List returned no PDF: ${JSON.stringify(out.raw).slice(0, 500)}`);
      }
      return pdf;
    },

    async listPickupLists(date: string): Promise<PickupListSummary[]> {
      const out = await call("ACS_Get_Pickup_Lists", { Language: null, Pickup_Date: date });
      const error = rowError(out);
      if (error) throw new CourierError(`ACS could not list pickup lists: ${error}`);
      return out.rows
        .filter((row) => row.PickupList_No !== null && row.PickupList_No !== undefined)
        .map((row) => ({
          pickupListNo: String(row.PickupList_No),
          issuedAt: String(row.Pickup_List_DateTime ?? row.Pickup_date ?? date),
          voucherCount: Number(row.List_Vouchers_Count ?? 0),
        }));
    },
  };
}

interface AcsOutput {
  alias: string;
  output: Record<string, unknown>;
  first: Record<string, unknown>;
  rows: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

/** YYYY-MM-DD in the shop's own timezone — ACS refuses a pickup date in the past. */
export function todayInAthens(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

/**
 * ACS wants the street and the number in separate fields. Greek addresses are typed
 * "Μίνωος 98" or "Λεωφ. Κνωσού 12Α"; a trailing number (with an optional letter) is
 * split off, and anything else is sent whole with the number left null — the guide's
 * own example does that and ACS still routes it.
 */
export function splitStreetNumber(address1: string): { street: string; number: string | null } {
  const match = address1.trim().match(/^(.*?)[\s,]+(\d+[A-Za-zΑ-Ωα-ω]?)$/u);
  if (!match) return { street: address1.trim(), number: null };
  return { street: match[1].trim(), number: match[2] };
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const PDF_BASE64_PREFIX = "JVBERi"; // base64 of "%PDF"

/** Depth-first search of the output for the first PDF-shaped value. */
function extractPdf(value: unknown, depth = 0): Uint8Array | null {
  if (depth > 6 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith(PDF_BASE64_PREFIX)) return Uint8Array.from(Buffer.from(trimmed, "base64"));
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length > 4 && PDF_MAGIC.every((byte, i) => value[i] === byte)) return Uint8Array.from(value as number[]);
    for (const item of value) {
      const found = extractPdf(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = extractPdf(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
