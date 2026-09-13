const STYLES: Record<"sent" | "failed" | "skipped", string> = {
  sent: "bg-green-50 text-green-800 border-green-200",
  failed: "bg-red-50 text-red-800 border-red-200",
  skipped: "bg-luxe-gray-light text-luxe-gray-dark border-border",
};

/** Sent / Failed / Skipped, with the provider's reason on hover — the row's whole point after the delivery-status change. */
export function EmailDeliveryPill({ status, error }: { status: "sent" | "failed" | "skipped"; error: string | null }) {
  return (
    <span
      title={error ?? undefined}
      className={`inline-block border px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
