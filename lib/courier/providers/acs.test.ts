import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createAcsCourierProvider, splitStreetNumber } from "@/lib/courier/providers/acs";
import { CourierError } from "@/lib/courier/types";

/**
 * Pinned to the request/response examples in ACS's own guide (*ACS Rest API Web Services*,
 * June 2024), which is the only ground truth until the account is live. `fetch` is stubbed;
 * the assertions are about what this adapter sends and how it reads ACS's envelope — the
 * misspelt `ACSOutputResponce`, per-row `Error_Message`, PDF bytes buried in the output.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const creds = {
  apiKey: "key",
  companyId: "co",
  companyPassword: "co-pw",
  userId: "user",
  userPassword: "user-pw",
  billingCode: "2ΑΘ999999",
};

const address = {
  firstName: "Άρης",
  lastName: "Χαλκιαδάκης",
  address1: "Μίνωος 98",
  city: "Ηράκλειο",
  region: "Ηρακλείου",
  postalCode: "71304",
  countryCode: "GR",
  phone: "6970228865",
};

function acsResponse(valueOutput: Record<string, unknown>[], tableData: Record<string, unknown>[] = [], hasError = false) {
  return new Response(
    JSON.stringify({
      ACSExecution_HasError: hasError,
      ACSExecutionErrorMessage: hasError ? "Λάθος κωδικοί" : "",
      ACSOutputResponce: { ACSValueOutput: valueOutput, ACSTableOutput: { Table_Data: tableData } },
    }),
    { status: 200 }
  );
}

function stubFetch(response: Response) {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sentBody(spy: ReturnType<typeof vi.fn>): { ACSAlias: string; ACSInputParameters: Record<string, unknown> } {
  return JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
}

describe("createShipment", () => {
  it("sends the documented envelope, header and a COD voucher for a cash-on-delivery order", async () => {
    const spy = stubFetch(acsResponse([{ Voucher_No: " 7227889174", Voucher_No_Return: null, Error_Message: "" }]));
    const provider = createAcsCourierProvider(creds);

    const result = await provider.createShipment({
      orderId: "order-1",
      recipientName: "Άρης Χαλκιαδάκης",
      address,
      weightGrams: 1000,
      itemQuantity: 1,
      codAmount: 83.05,
      deliveryNotes: "Παράδοση μετά τις 5",
      senderName: "ALEXANDRIS",
    });

    expect(result.trackingNumber).toBe("7227889174");
    expect(result.carrier).toBe("ACS Courier");

    const init = spy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).AcsApiKey).toBe("key");
    const body = sentBody(spy);
    expect(body.ACSAlias).toBe("ACS_Create_Voucher");
    expect(body.ACSInputParameters).toMatchObject({
      Company_ID: "co",
      User_ID: "user",
      Billing_Code: "2ΑΘ999999",
      Sender: "ALEXANDRIS",
      Recipient_Address: "Μίνωος",
      Recipient_Address_Number: "98",
      Recipient_Zipcode: "71304",
      Recipient_Region: "Ηράκλειο",
      Recipient_Cell_Phone: "6970228865",
      Charge_Type: 2,
      Item_Quantity: 1,
      Weight: 1,
      Cod_Ammount: 83.05,
      Cod_Payment_Way: 0,
      Acs_Delivery_Products: "COD",
      Delivery_Notes: "Παράδοση μετά τις 5",
      Reference_Key1: "order-1",
    });
  });

  it("sends the parcel count through and collects the piece vouchers a multi-parcel response carries", async () => {
    const spy = stubFetch(
      acsResponse([{ Voucher_No: "9807525324", Voucher_No_Return: null, Item_Voucher_No: "8807525325", Error_Message: "" }])
    );
    const provider = createAcsCourierProvider(creds);
    const result = await provider.createShipment({ orderId: "o", recipientName: "X", address, weightGrams: 2000, itemQuantity: 2 });

    expect(sentBody(spy).ACSInputParameters).toMatchObject({ Item_Quantity: 2, Weight: 2 });
    expect(result.trackingNumber).toBe("9807525324");
    expect(result.pieceTrackingNumbers).toEqual(["8807525325"]);
    expect(result.responseKeys).toContain("Voucher_No");
  });

  it("sends no COD fields at all for a prepaid order, and never a weight under ACS's 0.5 kg floor", async () => {
    const spy = stubFetch(acsResponse([{ Voucher_No: "1", Error_Message: "" }]));
    await createAcsCourierProvider(creds).createShipment({
      orderId: "order-2",
      recipientName: "X",
      address,
      weightGrams: 200,
      itemQuantity: 1,
    });
    const params = sentBody(spy).ACSInputParameters;
    expect(params.Cod_Ammount).toBeNull();
    expect(params.Cod_Payment_Way).toBeNull();
    expect(params.Acs_Delivery_Products).toBeNull();
    expect(params.Weight).toBe(0.5);
  });

  it("surfaces a per-row rejection as a CourierError with ACS's wording", async () => {
    stubFetch(acsResponse([{ Voucher_No: null, Error_Message: "Ανύπαρκτος επί πιστώσει κωδικός χρέωσης" }]));
    await expect(
      createAcsCourierProvider(creds).createShipment({ orderId: "o", recipientName: "X", address, weightGrams: 500, itemQuantity: 1 })
    ).rejects.toThrow(/Ανύπαρκτος επί πιστώσει κωδικός χρέωσης/);
  });

  it("treats ACSExecution_HasError as failure even though the HTTP status is 200", async () => {
    stubFetch(acsResponse([], [], true));
    await expect(
      createAcsCourierProvider(creds).createShipment({ orderId: "o", recipientName: "X", address, weightGrams: 500, itemQuantity: 1 })
    ).rejects.toThrow(CourierError);
  });

  it("names the API key on a 403 rather than dumping the body", async () => {
    stubFetch(new Response("Forbidden", { status: 403 }));
    await expect(
      createAcsCourierProvider(creds).createShipment({ orderId: "o", recipientName: "X", address, weightGrams: 500, itemQuantity: 1 })
    ).rejects.toThrow(/API key/);
  });
});

describe("printLabels", () => {
  /** A one-page PDF with a marker string, so an overlaid sheet can be checked for which labels it carries. */
  async function labelPdf(marker: string): Promise<string> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawText(marker, { x: 20, y: 800 });
    return Buffer.from(await doc.save()).toString("base64");
  }

  /** The live response shape: one entry per voucher, PDF as base64 under PDFData, voucher key misspelt. */
  function printResponse(entries: { voucher: string; pdf: string }[]) {
    return new Response(
      JSON.stringify({
        ACSExecution_HasError: false,
        ACSExecutionErrorMessage: "",
        ACSOutputResponce: {
          ACSValueOutput: [{ ACSObjectOutput: entries.map((e) => ({ Voucber_No: e.voucher, PDFData: e.pdf, ACSExecution_HasError: false })) }],
          ACSTableOutput: {},
        },
      })
    );
  }

  it("returns ACS's page as-is for a single voucher and asks for the requested slot", async () => {
    const pdf = await labelPdf("ONE");
    const spy = stubFetch(printResponse([{ voucher: "7401638565", pdf }]));
    const bytes = await createAcsCourierProvider(creds).printLabels!(["7401638565"], "laser", 3);
    expect(Buffer.from(bytes).toString("base64")).toBe(pdf);
    expect(sentBody(spy).ACSInputParameters).toMatchObject({ Voucher_No: "7401638565", Print_Type: 2, Start_Position: 3 });
  });

  it("lays three A4 vouchers onto one sheet by fetching each slot separately and overlaying", async () => {
    const pdfs = { A: await labelPdf("A"), B: await labelPdf("B"), C: await labelPdf("C") };
    const spy = vi.fn(async (_url: string, init: RequestInit) => {
      const params = JSON.parse(init.body as string).ACSInputParameters as { Voucher_No: string };
      const vouchers = params.Voucher_No.split(",");
      return printResponse(vouchers.map((v) => ({ voucher: v, pdf: pdfs[v as keyof typeof pdfs] })));
    });
    vi.stubGlobal("fetch", spy);

    const bytes = await createAcsCourierProvider(creds).printLabels!(["A", "B", "C"], "laser", 1);

    const slots = spy.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).ACSInputParameters).map((p) => [p.Voucher_No, p.Start_Position]);
    expect(slots).toEqual([["A", 1], ["B", 2], ["C", 3]]);
    const sheet = await PDFDocument.load(bytes);
    expect(sheet.getPageCount()).toBe(1);
  });

  it("starts on the given slot and spills onto a second sheet — two vouchers from slot 3 is two sheets", async () => {
    const pdfs = { A: await labelPdf("A"), B: await labelPdf("B") };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const v = (JSON.parse(init.body as string).ACSInputParameters as { Voucher_No: string }).Voucher_No;
        return printResponse([{ voucher: v, pdf: pdfs[v as keyof typeof pdfs] }]);
      })
    );
    const bytes = await createAcsCourierProvider(creds).printLabels!(["A", "B"], "laser", 3);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("prints thermal labels one per page, in one call", async () => {
    const pdfs = { A: await labelPdf("A"), B: await labelPdf("B") };
    const spy = stubFetch(printResponse([{ voucher: "A", pdf: pdfs.A }, { voucher: "B", pdf: pdfs.B }]));
    const bytes = await createAcsCourierProvider(creds).printLabels!(["A", "B"], "thermal");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(sentBody(spy).ACSInputParameters).toMatchObject({ Voucher_No: "A,B", Print_Type: 1 });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});

describe("issuePickupList", () => {
  it("returns the list number on success", async () => {
    stubFetch(acsResponse([{ PickupList_No: "7227889830", Unprinted_Found: 0, Error_Message: "" }]));
    await expect(createAcsCourierProvider(creds).issuePickupList!("2026-09-14")).resolves.toEqual({
      pickupListNo: "7227889830",
      unprintedVouchers: [],
    });
  });

  it("reports the unprinted vouchers instead of throwing when ACS refuses to close the day", async () => {
    stubFetch(
      acsResponse(
        [{ PickupList_No: null, Unprinted_Found: 2, Error_Message: "Αδύνατη η έκδοση λίστας παραλαβής. Βρέθηκαν 2 ατύπωτες αποστολές." }],
        [{ Unprinted_Vouchers: "7227889841" }, { Unprinted_Vouchers: "7227889874" }]
      )
    );
    await expect(createAcsCourierProvider(creds).issuePickupList!("2026-09-14")).resolves.toEqual({
      pickupListNo: null,
      unprintedVouchers: ["7227889841", "7227889874"],
    });
  });
});

describe("listPickupLists", () => {
  it("maps the documented table rows", async () => {
    stubFetch(
      acsResponse(
        [{ Error_Message: null }],
        [{ Pickup_date: "2019-01-15T00:00:00", Pickup_List_DateTime: "2019-01-15T11:05:03.943", User_ID: "demo", PickupList_No: "7227890935", List_Vouchers_Count: 2 }]
      )
    );
    await expect(createAcsCourierProvider(creds).listPickupLists!("2019-01-15")).resolves.toEqual([
      { pickupListNo: "7227890935", issuedAt: "2019-01-15T11:05:03.943", voucherCount: 2 },
    ]);
  });
});

describe("splitStreetNumber", () => {
  it("separates a trailing number, with or without a letter, and leaves the rest whole", () => {
    expect(splitStreetNumber("Μίνωος 98")).toEqual({ street: "Μίνωος", number: "98" });
    expect(splitStreetNumber("Λεωφ. Κνωσού 12Α")).toEqual({ street: "Λεωφ. Κνωσού", number: "12Α" });
    expect(splitStreetNumber("EVANS 9")).toEqual({ street: "EVANS", number: "9" });
    expect(splitStreetNumber("Πλατεία Ελευθερίας")).toEqual({ street: "Πλατεία Ελευθερίας", number: null });
  });
});
