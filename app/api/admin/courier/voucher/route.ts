import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";
import { getCourierProvider, CourierError, ACS_CARRIER_NAME, type LabelFormat } from "@/lib/courier";
import { getOrderById, markVouchersPrinted } from "@/services/orders";

/**
 * ACS voucher labels as one PDF to print.
 *
 *   ?order=<id>                      one order
 *   ?orders=<id>,<id>,…              up to ten, three to an A4 sheet in the order given
 *   &format=laser|thermal            default laser
 *   &start=1|2|3                     first A4 slot to use, for finishing a half-used sheet
 *
 * A route rather than a Server Action because the result is a file the browser opens in
 * a tab and sends to the printer. Fetched from ACS on every request — they keep the
 * voucher and re-render it — and each order is stamped as printed afterwards, which is
 * what the courier page's "still to print" list runs on.
 */
export async function GET(request: Request) {
  try {
    await requireCapability("orders:manage");

    const url = new URL(request.url);
    const single = url.searchParams.get("order")?.trim();
    const many = url.searchParams.get("orders")?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
    const orderIds = single ? [single] : many;
    const format: LabelFormat = url.searchParams.get("format") === "thermal" ? "thermal" : "laser";
    const startRaw = Number(url.searchParams.get("start") ?? "1");
    const start = (startRaw === 2 || startRaw === 3 ? startRaw : 1) as 1 | 2 | 3;

    if (orderIds.length === 0) return NextResponse.json({ error: "Missing order." }, { status: 400 });
    if (orderIds.length > 10) return NextResponse.json({ error: "ACS prints at most ten vouchers at once." }, { status: 400 });

    const orders = await Promise.all(orderIds.map((id) => getOrderById(id)));
    const missing = orders.findIndex((order) => !order);
    if (missing !== -1) return NextResponse.json({ error: `Order ${orderIds[missing]} not found.` }, { status: 404 });
    const withoutVoucher = orders.find((order) => !order!.trackingNumber || order!.carrier !== ACS_CARRIER_NAME);
    if (withoutVoucher) {
      return NextResponse.json({ error: `Order ${withoutVoucher.id} has no ACS voucher.` }, { status: 409 });
    }

    const provider = getCourierProvider();
    if (!provider.printLabels) return NextResponse.json({ error: "Voucher printing needs COURIER_PROVIDER=acs." }, { status: 409 });

    const trackingNumbers = orders.map((order) => order!.trackingNumber!);
    const pdf = await provider.printLabels(trackingNumbers, format, start);
    await markVouchersPrinted(orders.map((order) => order!.id));

    const name = trackingNumbers.length === 1 ? `acs-voucher-${trackingNumbers[0]}` : `acs-vouchers-${trackingNumbers.length}`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}-${format}.pdf"`,
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
