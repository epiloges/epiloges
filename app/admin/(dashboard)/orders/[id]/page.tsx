import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { OrderTrackingForm } from "@/components/admin/OrderTrackingForm";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import Link from "next/link";
import Image from "next/image";
import { getOrderById } from "@/services/orders";
import { getPaymentsForOrder } from "@/services/payments";
import { paymentProviderRegistry } from "@/lib/payments/registry";
import { isSettled } from "@/lib/payments/status";
import { PaymentStatusPill } from "@/components/admin/PaymentStatusPill";
import {
  updateOrderStatusAction,
  updateOrderTrackingAction,
  createAcsShipmentAction,
  cancelAcsShipmentAction,
} from "@/app/admin/(dashboard)/orders/actions";
import { isAcsCourierConfigured, ACS_CARRIER_NAME } from "@/lib/courier";
import { AcsVoucherActions } from "@/components/admin/AcsVoucherActions";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

function addressLines(address: { firstName: string; lastName: string; company?: string; address1: string; address2?: string; city: string; region?: string; postalCode: string; countryCode: string; phone?: string }) {
  return [
    `${address.firstName} ${address.lastName}`,
    address.company,
    address.address1,
    address.address2,
    `${address.city}${address.region ? `, ${address.region}` : ""} ${address.postalCode}`,
    address.countryCode,
    address.phone,
  ].filter(Boolean);
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
  // Binding a Server Action to this record encrypts the bound id with a fresh random IV,
  // which Cache Components flags during prerender ("1 Issue" in dev). The page is
  // per-request by nature — it edits one record — so render it that way.
  await connection();
  const order = await getOrderById(id);
  if (!order) notFound();

  // Payment status is shown alongside the order status, never merged into it — a
  // Cash-on-Delivery order is legitimately "processing" while its payment is still
  // pending, and this page is where that distinction actually matters to someone
  // deciding whether to dispatch.
  const payments = await getPaymentsForOrder(order.id);

  const boundUpdateTracking = updateOrderTrackingAction.bind(null, order.id);
  const boundCreateAcsShipment = createAcsShipmentAction.bind(null, order.id);
  const boundCancelAcsShipment = cancelAcsShipmentAction.bind(null, order.id);
  const acsConfigured = isAcsCourierConfigured();
  const hasAcsVoucher = acsConfigured && order.carrier === ACS_CARRIER_NAME && Boolean(order.trackingNumber);

  return (
    <div>
      <AdminPageHeader
        title={`Order #${order.id.slice(-8).toUpperCase()}`}
        description={`Placed ${formatDate(order.createdAt)} by ${order.customerEmail}`}
        actions={<OrderStatusSelect orderId={order.id} defaultStatus={order.status} hasTracking={Boolean(order.trackingNumber)} onChange={updateOrderStatusAction} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="border border-border bg-luxe-white">
            <h3 className="border-b border-border p-4 text-sm font-medium tracking-[0.05em] uppercase">
              Items ({order.lineItems.length})
            </h3>
            <div className="divide-y divide-border">
              {order.lineItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                  <div className="flex min-w-0 items-center gap-4">
                    {/* The photo is what the person picking the box actually recognises the shoe by. */}
                    <Link
                      href={`/products/${item.slug}`}
                      target="_blank"
                      className="relative size-20 shrink-0 overflow-hidden bg-luxe-gray-light"
                    >
                      <Image src={item.image.src} alt={item.image.alt} fill sizes="80px" className="object-cover" />
                    </Link>
                    <div className="min-w-0">
                      <p>{item.name}</p>
                      <p className="text-xs text-luxe-gray-dark">
                        {item.color} · {item.size} · Qty {item.quantity}
                      </p>
                      <p className="mt-1 text-xs">
                        <Link href={`/admin/products/${item.productId}`} className="underline underline-offset-4">
                          Open in Products
                        </Link>
                      </p>
                    </div>
                  </div>
                  <p>{formatMoney({ amount: item.unitPrice.amount * item.quantity, currencyCode: item.unitPrice.currencyCode })}</p>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 border-t border-border p-4 text-sm">
              <div className="flex justify-between text-luxe-gray-dark">
                <span>Subtotal</span>
                <span>{formatMoney(order.totals.subtotal)}</span>
              </div>
              {order.totals.discountTotal.amount > 0 ? (
                <div className="flex justify-between gap-4 text-luxe-gray-dark">
                  <span>
                    Discount
                    {order.discounts.length > 0 ? (
                      <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                        {order.discounts.map((discount) => (
                          <span key={discount.code} className="bg-amber-100 px-1.5 py-px font-mono text-xs text-amber-800">
                            {discount.code} · {discount.type === "percentage" ? `${discount.value}%` : formatMoney(discount.amount)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs">(code not recorded — order predates code tracking)</span>
                    )}
                  </span>
                  <span>-{formatMoney(order.totals.discountTotal)}</span>
                </div>
              ) : null}
              {order.totals.giftCardTotal.amount > 0 ? (
                <div className="flex justify-between gap-4 text-luxe-gray-dark">
                  <span>
                    Gift Card
                    {order.giftCards.length > 0 ? (
                      <span className="ml-2 inline-flex flex-wrap gap-1.5 align-middle">
                        {order.giftCards.map((giftCard) => (
                          <span key={giftCard.code} className="bg-luxe-gray-light px-1.5 py-px font-mono text-xs">
                            {giftCard.code}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span>-{formatMoney(order.totals.giftCardTotal)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-luxe-gray-dark">
                <span>Shipping ({order.shippingRate.label})</span>
                <span>{formatMoney(order.totals.shippingTotal)}</span>
              </div>
              {order.totals.giftWrapTotal.amount > 0 ? (
                <div className="flex justify-between text-luxe-gray-dark">
                  <span>Gift Wrapping</span>
                  <span>{formatMoney(order.totals.giftWrapTotal)}</span>
                </div>
              ) : null}
              {order.totals.paymentFeeTotal.amount > 0 ? (
                <div className="flex justify-between text-luxe-gray-dark">
                  <span>Payment Fee</span>
                  <span>{formatMoney(order.totals.paymentFeeTotal)}</span>
                </div>
              ) : null}
              <div className="flex justify-between pt-1.5 text-sm font-medium">
                <span>Total</span>
                <span>{formatMoney(order.totals.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-luxe-gray-dark">
                <span>Includes VAT</span>
                <span>{formatMoney(order.totals.taxTotal)}</span>
              </div>
            </div>
          </div>

          <div>
            <OrderTrackingForm
              defaultCarrier={order.carrier}
              defaultTrackingNumber={order.trackingNumber}
              defaultTrackingUrl={order.trackingUrl}
              // Once a voucher exists the create button gives way to print/cancel below.
              courierProviderIsAcs={acsConfigured && !hasAcsVoucher}
              onSave={boundUpdateTracking}
              onCreateAcsShipment={boundCreateAcsShipment}
            />
            {hasAcsVoucher && order.trackingNumber ? (
              <AcsVoucherActions
                orderId={order.id}
                trackingNumber={order.trackingNumber}
                printedAt={order.voucherPrintedAt ? formatDateTime(order.voucherPrintedAt) : null}
                pickupListNo={order.pickupListNo ?? null}
                onCancel={boundCancelAcsShipment}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-border bg-luxe-white p-4">
            <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Payment</h3>
            {payments.length === 0 ? (
              <p className="text-sm text-luxe-gray-dark">
                No payment record — this order was placed before a payment method was selected.
              </p>
            ) : (
              <ul className="space-y-3">
                {payments.map((payment) => {
                  const definition = paymentProviderRegistry.getMethod(payment.methodId);
                  return (
                    <li key={payment.id} className="text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/admin/payments/${payment.id}`} className="hover:underline">
                          {definition?.defaultDisplayName ?? payment.methodId}
                        </Link>
                        <PaymentStatusPill status={payment.status} />
                      </div>
                      <p className="mt-1 text-xs text-luxe-gray-dark">
                        {formatMoney(payment.amount)}
                        {payment.refundedAmount.amount > 0 ? ` · ${formatMoney(payment.refundedAmount)} refunded` : ""}
                      </p>
                      {/*
                        A delivered Cash-on-Delivery (or bank-transfer) order whose payment
                        is still pending is the one state that is almost always a forgotten
                        click rather than a real fact: the courier collected at the door.
                        Point at the place to record it, rather than merging the two statuses.
                      */}
                      {order.status === "delivered" && definition?.requiresManualConfirmation && !isSettled(payment.status) ? (
                        <p className="mt-2 border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                          Delivered, but this payment is still {payment.status.replace(/_/g, " ")}. If the money was collected,{" "}
                          <Link href={`/admin/payments/${payment.id}`} className="underline">
                            mark it as received
                          </Link>
                          .
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {order.giftWrap ? (
            <div className="border border-border bg-luxe-white p-4">
              <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Gift Wrapping</h3>
              <p className="text-sm">{order.giftMessage ? `"${order.giftMessage}"` : "No message added"}</p>
            </div>
          ) : null}
          {/*
            The shopper's delivery note, above the addresses for the same reason as the
            invoice: it changes what the person packing the box has to do. "Παράδοση μετά τις
            5" is useless discovered after the courier has already been given the parcel.
          */}
          {order.customerNote ? (
            <div className="border-2 border-luxe-black bg-luxe-white p-4">
              <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase">Σημείωση πελάτη</h3>
              {/* whitespace-pre-line: the shopper may have typed line breaks, and collapsing
                  them can run two separate instructions into one sentence. */}
              <p className="text-sm whitespace-pre-line">{order.customerNote}</p>
            </div>
          ) : null}
          {/*
            Τιμολόγιο, shown FIRST and outlined, because it is the one thing on this page that
            changes what the merchant has to do: an order carrying invoice details cannot be
            closed with an ordinary receipt. Buried among the addresses it would be read after
            the decision it should inform.
          */}
          {order.shippingAddress.invoice ? (
            <div className="border-2 border-luxe-black bg-luxe-white p-4">
              <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase">Τιμολόγιο — issue an invoice, not a receipt</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-luxe-gray-dark">Επωνυμία</dt>
                  <dd className="text-right">{order.shippingAddress.invoice.companyName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-luxe-gray-dark">ΑΦΜ</dt>
                  <dd className="text-right font-mono">{order.shippingAddress.invoice.vatNumber}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-luxe-gray-dark">ΔΟΥ</dt>
                  <dd className="text-right">{order.shippingAddress.invoice.taxOffice}</dd>
                </div>
                {order.shippingAddress.invoice.activity ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-luxe-gray-dark">Δραστηριότητα</dt>
                    <dd className="text-right">{order.shippingAddress.invoice.activity}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
          <div className="border border-border bg-luxe-white p-4">
            <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Shipping Address</h3>
            <p className="mb-2 text-xs">
              <Link
                href={`/admin/customers/${encodeURIComponent(`email:${order.customerEmail.toLowerCase()}`)}`}
                className="underline underline-offset-4"
              >
                Customer history
              </Link>
            </p>
            <div className="text-sm">
              {addressLines(order.shippingAddress).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
          <div className="border border-border bg-luxe-white p-4">
            <h3 className="mb-3 text-xs font-medium tracking-[0.05em] uppercase text-luxe-gray-dark">Billing Address</h3>
            <div className="text-sm">
              {addressLines(order.billingAddress).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
