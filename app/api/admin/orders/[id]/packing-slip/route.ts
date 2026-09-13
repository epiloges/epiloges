import { requireCapability } from "@/lib/admin-session";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";
import { formatDate, formatMoney } from "@/lib/format";
import { getOrderById } from "@/services/orders";
import { getSiteSettings } from "@/services/settings";

type RouteParams = { params: Promise<{ id: string }> };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}

/**
 * A printable packing slip (δελτίο συσκευασίας) for one order: what goes in the box, where
 * it goes, what the customer asked. Plain HTML that prints on A4 — the order page had no
 * way to put anything on paper, so the picker worked from the screen or from memory.
 *
 * This is NOT an invoice or receipt: those carry tax details and are issued by the shop's
 * accounting software, not from here.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireCapability("orders:view");
    const { id } = await params;
    const [order, settings] = await Promise.all([getOrderById(id), getSiteSettings()]);
    if (!order) return new Response("Order not found", { status: 404 });

    const reference = order.id.slice(-8).toUpperCase();
    const address = order.shippingAddress;
    const lines = [
      `${address.firstName} ${address.lastName}`,
      address.company,
      address.address1,
      address.address2,
      `${address.city} ${address.postalCode}`,
      address.countryCode,
      address.phone,
    ].filter(Boolean) as string[];

    const rows = order.lineItems
      .map(
        (item) => `<tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.color ?? "")}</td>
          <td>${escapeHtml(item.size)}</td>
          <td class="num">${item.quantity}</td>
          <td class="check">☐</td>
        </tr>`
      )
      .join("");

    const html = `<!doctype html>
<html lang="el">
<head>
<meta charset="utf-8">
<title>Packing slip #${reference}</title>
<style>
  body { font: 13px/1.45 system-ui, sans-serif; color: #111; margin: 24mm 18mm; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: .08em; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #555; margin: 22px 0 6px; }
  .meta { color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  .num { text-align: right; }
  .check { text-align: center; font-size: 16px; width: 40px; }
  .note { border: 2px solid #111; padding: 8px 10px; white-space: pre-line; }
  .cod { border: 2px solid #111; padding: 8px 10px; font-weight: 600; }
  @media print { button { display: none; } }
</style>
</head>
<body>
  <button onclick="window.print()">Print</button>
  <h1>${escapeHtml(settings.siteName)}</h1>
  <p class="meta">Packing slip · Order #${reference} · ${escapeHtml(formatDate(order.createdAt))} · ${order.status}</p>

  <h2>Deliver to</h2>
  <p>${lines.map(escapeHtml).join("<br>")}</p>
  <p class="meta">${escapeHtml(order.shippingRate.label)}${order.shippingRate.description ? ` · ${escapeHtml(order.shippingRate.description)}` : ""}</p>

  ${order.customerNote ? `<h2>Customer note</h2><p class="note">${escapeHtml(order.customerNote)}</p>` : ""}
  ${order.giftWrap ? `<h2>Gift wrapping</h2><p class="note">${escapeHtml(order.giftMessage ? `"${order.giftMessage}"` : "Gift wrap, no message")}</p>` : ""}
  ${order.internalNote ? `<h2>Internal note</h2><p class="note">${escapeHtml(order.internalNote)}</p>` : ""}

  <h2>Items (${order.lineItems.reduce((sum, item) => sum + item.quantity, 0)})</h2>
  <table>
    <thead><tr><th>Product</th><th>Colour</th><th>Size</th><th class="num">Qty</th><th class="check">✓</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <h2>Totals</h2>
  <table>
    <tr><td>Subtotal</td><td class="num">${escapeHtml(formatMoney(order.totals.subtotal))}</td></tr>
    ${order.totals.discountTotal.amount > 0 ? `<tr><td>Discount</td><td class="num">-${escapeHtml(formatMoney(order.totals.discountTotal))}</td></tr>` : ""}
    <tr><td>Shipping</td><td class="num">${escapeHtml(formatMoney(order.totals.shippingTotal))}</td></tr>
    <tr><td><strong>Total</strong></td><td class="num"><strong>${escapeHtml(formatMoney(order.totals.total))}</strong></td></tr>
  </table>
</body>
</html>`;

    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
