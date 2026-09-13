import { ORDER_STATUS_LABEL } from "@/constants/order-status";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/commerce/types";

/** Amber = still on us to act; green = out the door; grey/red = nothing left to do. */
const STATUS_CLASS: Record<Order["status"], string> = {
  confirmed: "bg-amber-100 text-amber-800",
  processing: "bg-amber-100 text-amber-800",
  shipped: "bg-green-100 text-green-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-luxe-gray-light text-luxe-gray-dark",
  refunded: "bg-red-100 text-red-800",
};

export function OrderStatusBadge({ status }: { status: Order["status"] }) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 text-[11px] font-medium tracking-[0.05em] uppercase",
        STATUS_CLASS[status]
      )}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
