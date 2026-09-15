import { cn } from "@/lib/utils";

/**
 * The official marks from epay's merchant kit (section 8 of the Redirection manual), served
 * from /public/payments — the epay logotype, the card schemes, IRIS, and the two 3-D Secure
 * programme marks. Plain <img>: static files under our own origin, nothing to optimise, and
 * a brand mark must never be recompressed or recoloured. Google Pay is not in the kit; its
 * mark stays drawn inline until Google's own asset is added.
 */
export const MARKS: Record<"epay" | "visa" | "mastercard" | "maestro" | "iris" | "visa-secure" | "mastercard-idcheck", { src: string; alt: string; className: string }> = {
  epay: { src: "/payments/epay.png", alt: "epay", className: "h-5" },
  visa: { src: "/payments/visa.svg", alt: "Visa", className: "h-3.5" },
  mastercard: { src: "/payments/mastercard.svg", alt: "Mastercard", className: "h-6" },
  maestro: { src: "/payments/maestro.svg", alt: "Maestro", className: "h-5" },
  iris: { src: "/payments/iris.png", alt: "IRIS online payments", className: "h-5" },
  "visa-secure": { src: "/payments/visa-secure.jpg", alt: "Visa Secure", className: "h-7" },
  "mastercard-idcheck": { src: "/payments/mastercard-idcheck.png", alt: "Mastercard ID Check", className: "h-6" },
};

export function Mark({ id, boxed = true }: { id: keyof typeof MARKS; boxed?: boolean }) {
  const mark = MARKS[id];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- a brand mark from /public; see MARKS.
    <img src={mark.src} alt={mark.alt} title={mark.alt} className={cn("w-auto", mark.className)} />
  );
  return boxed ? <span className="inline-flex h-8 min-w-11 items-center justify-center border border-border bg-luxe-white px-1.5">{img}</span> : img;
}

export function SchemeMark({ scheme }: { scheme: "visa" | "mastercard" | "maestro" | "iris" | "google-pay" }) {
  if (scheme !== "google-pay") return <Mark id={scheme} />;
  return (
    <span className="inline-flex h-8 min-w-11 items-center justify-center border border-border bg-luxe-white px-1.5" aria-label="Google Pay" title="Google Pay">
      <svg viewBox="0 0 40 14" className="h-3.5 w-9" aria-hidden>
        <text x="3" y="11.5" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="12" fill="#4285F4">G</text>
        <text x="13" y="11.5" fontFamily="Arial, Helvetica, sans-serif" fontWeight="500" fontSize="11" fill="#3C4043">Pay</text>
      </svg>
    </span>
  );
}
