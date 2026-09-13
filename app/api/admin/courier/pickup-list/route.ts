import { connection, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";
import { getCourierProvider, CourierError } from "@/lib/courier";

/** A pickup list as a PDF: `?no=<PickupList_No>&date=YYYY-MM-DD`. Same reasoning as the voucher route. */
export async function GET(request: Request) {
  // A GET is attempted as a prerender at build; the session cookie is only readable per
  // request. Mark the route dynamic before touching it (same as newsletter/export).
  await connection();
  try {
    await requireCapability("orders:manage");

    const url = new URL(request.url);
    const pickupListNo = url.searchParams.get("no")?.trim();
    const date = url.searchParams.get("date")?.trim();
    if (!pickupListNo || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Missing pickup list number or date." }, { status: 400 });
    }

    const provider = getCourierProvider();
    if (!provider.printPickupList) return NextResponse.json({ error: "Pickup lists need COURIER_PROVIDER=acs." }, { status: 409 });

    const pdf = await provider.printPickupList(pickupListNo, date);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="acs-pickup-list-${pickupListNo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // Admin-only, so ACS's own wording is more useful than a generic 500 — it says
    // whether the voucher is already in a pickup list, the key is wrong, and so on.
    if (error instanceof CourierError) return NextResponse.json({ error: { code: "COURIER", message: error.message } }, { status: 502 });
    return commerceErrorResponse(error);
  }
}
