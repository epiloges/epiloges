import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";
import { getCourierProvider, CourierError, ACS_CARRIER_NAME, type LabelFormat } from "@/lib/courier";
import { getOrderById } from "@/services/orders";

/**
 * The ACS voucher for an order, as a PDF to print. `?order=<id>&format=laser|thermal`.
 *
 * A route rather than a Server Action because the result is a file the browser should
 * open in a tab and send to the printer, not state for a component. Fetched from ACS on
 * every request — ACS keeps the voucher and re-renders it on demand, so there is nothing
 * to store here. Only the ACS provider can do this; in manual mode the link is not shown.
 */
export async function GET(request: Request) {
  try {
    await requireCapability("orders:manage");

    const url = new URL(request.url);
    const orderId = url.searchParams.get("order")?.trim();
    const format: LabelFormat = url.searchParams.get("format") === "thermal" ? "thermal" : "laser";
    if (!orderId) return NextResponse.json({ error: "Missing order." }, { status: 400 });

    const order = await getOrderById(orderId);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (!order.trackingNumber || order.carrier !== ACS_CARRIER_NAME) {
      return NextResponse.json({ error: "This order has no ACS voucher." }, { status: 409 });
    }

    const provider = getCourierProvider();
    if (!provider.printLabels) return NextResponse.json({ error: "Voucher printing needs COURIER_PROVIDER=acs." }, { status: 409 });

    const pdf = await provider.printLabels([order.trackingNumber], format);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="acs-voucher-${order.trackingNumber}-${format}.pdf"`,
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
