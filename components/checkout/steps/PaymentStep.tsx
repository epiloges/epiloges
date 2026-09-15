"use client";
import { useLocale, useTranslations } from "next-intl";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { buildAddressSchema, type AddressFormValues } from "@/lib/validation/checkout";
import { localizedCountries } from "@/constants/countries";
import { useCheckout, type CheckoutPaymentMethod } from "@/components/providers/CheckoutProvider";
import { PaymentMethodIcon } from "@/components/checkout/PaymentMethodIcon";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const inputClass =
  "h-11 w-full border border-border bg-transparent px-3 text-sm outline-none focus:border-luxe-black aria-invalid:border-destructive";

/**
 * The one client-side capability gate, read through `useSyncExternalStore` — which
 * is precisely what it is: a value that lives in an external system (the browser),
 * differs between the server and client snapshots, and would be a hydration
 * mismatch if read during render.
 *
 * It can only ever REMOVE a method the server already approved. Nothing here can
 * make an unavailable method available.
 */
function readApplePaySupport(): boolean {
  const session = (window as unknown as { ApplePaySession?: { canMakePayments?: () => boolean } }).ApplePaySession;
  try {
    return Boolean(session?.canMakePayments?.());
  } catch {
    // Safari throws from canMakePayments() on an insecure origin rather than
    // returning false — which is a "no", not an error worth surfacing.
    return false;
  }
}

/** Apple Pay availability cannot change within a page's lifetime, so there is nothing to subscribe to. */
function subscribeToNothing(): () => void {
  return () => {};
}

/**
 * The payment step, rebuilt around the abstraction.
 *
 * What this component previously was: a hardcoded card form (name / number /
 * expiry / CVC) with a "Demo checkout — no payment is charged" note and a
 * feature-flagged "Pay in 4" button that did nothing. What it is now: a renderer
 * for whatever `GET /api/payment-methods` returns.
 *
 * Two properties are worth stating explicitly, because they're the point of §21:
 *
 * - There is **no card form here and there never will be**. Card data is collected
 *   on the processor's own page (Stripe's hosted checkout today), so this
 *   application never sees a card number or a CVV and stays out of PCI scope.
 * - There is **no `if (stripe)` / `if (cod)` anywhere**. The component cannot tell
 *   which vendor is behind a method — it renders a name, a description, an icon key
 *   and a server-computed fee. Adding Viva Wallet or PayPal later changes nothing
 *   in this file.
 */
export function PaymentStep() {
  const t = useTranslations("Checkout");
  const locale = useLocale();
  const countries = useMemo(() => localizedCountries(locale), [locale]);
  // Validation messages in the shopper's language — useTranslations has exactly the resolver
  // signature the schema factory takes. Memoised so zodResolver keeps a stable identity.
  const tValidation = useTranslations("Validation");
  const addressValidation = useMemo(() => buildAddressSchema(tValidation), [tValidation]);
  const {
    shippingAddress,
    sameBillingAsShipping,
    setSameBillingAsShipping,
    setBillingAddress,
    confirmPayment,
    paymentMethods,
    isLoadingPaymentMethods,
    paymentMethodsError,
    reloadPaymentMethods,
    selectedPaymentMethodId,
    selectPaymentMethod,
  } = useCheckout();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supportsApplePay = useSyncExternalStore(subscribeToNothing, readApplePaySupport, () => false);

  const visibleMethods = paymentMethods.filter(
    (method) => method.clientCapability !== "apple-pay" || supportsApplePay
  );

  const billingForm = useForm<AddressFormValues>({
    resolver: zodResolver(addressValidation),
    defaultValues: {
      firstName: shippingAddress?.firstName ?? "",
      lastName: shippingAddress?.lastName ?? "",
      company: "",
      address1: "",
      address2: "",
      city: "",
      region: "",
      postalCode: "",
      countryCode: shippingAddress?.countryCode ?? "GR",
      phone: "",
    },
  });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!selectedPaymentMethodId) {
      setError("Please choose a payment method.");
      return;
    }
    setIsSubmitting(true);
    try {
      if (!sameBillingAsShipping) {
        const isBillingValid = await billingForm.trigger();
        if (!isBillingValid) return;
        await setBillingAddress(billingForm.getValues());
      }
      confirmPayment();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        <h2 className="font-heading text-xl">{t("paymentTitle")}</h2>
        <p className="mt-1 text-sm text-luxe-gray-dark">
          {t("paymentSubtitle")}
        </p>
      </div>

      {isLoadingPaymentMethods && paymentMethods.length === 0 ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[76px] animate-pulse border border-border bg-luxe-gray-light/60" />
          ))}
        </div>
      ) : null}

      {paymentMethodsError ? (
        <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p>{paymentMethodsError}</p>
          <button
            type="button"
            onClick={() => void reloadPaymentMethods()}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4"
          >
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
            {t("tryAgain")}
          </button>
        </div>
      ) : null}

      {!isLoadingPaymentMethods && !paymentMethodsError && visibleMethods.length === 0 ? (
        <div className="border border-border bg-luxe-gray-light p-4 text-sm">
          <p className="font-medium">{t("noPaymentMethods")}</p>
          <p className="mt-1 text-luxe-gray-dark">
            {t("noPaymentMethodsHelp")}
          </p>
        </div>
      ) : null}

      {visibleMethods.length > 0 ? (
        <div role="radiogroup" aria-label={t("paymentMethodLabel")} className="space-y-3">
          {visibleMethods.map((method) => (
            <PaymentMethodOption
              key={method.id}
              method={method}
              isSelected={selectedPaymentMethodId === method.id}
              onSelect={() => {
                setError(null);
                void selectPaymentMethod(method.id);
              }}
            />
          ))}
        </div>
      ) : null}

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={sameBillingAsShipping}
          onChange={(event) => setSameBillingAsShipping(event.target.checked)}
          className="size-4 border-border accent-luxe-black"
        />
        {t("billingSameAsShipping")}
      </label>

      {!sameBillingAsShipping ? (
        <div className="space-y-4 border-t border-border pt-6">
          <p className="text-eyebrow">{t("billingAddress")}</p>
          <div className="grid grid-cols-2 gap-4">
            <Field form={billingForm} name="firstName" id="billingFirstName" label={t("firstName")} />
            <Field form={billingForm} name="lastName" id="billingLastName" label={t("lastName")} />
          </div>
          <Field form={billingForm} name="address1" id="billingAddress1" label={t("streetAddress")} />
          <div className="grid grid-cols-2 gap-4">
            <Field form={billingForm} name="city" id="billingCity" label={t("city")} />
            <Field form={billingForm} name="postalCode" id="billingPostalCode" label={t("postalCode")} />
          </div>
          <div>
            <label htmlFor="billingCountryCode" className="mb-1.5 block text-eyebrow">
              {t("country")}
            </label>
            <select id="billingCountryCode" className={cn(inputClass, "appearance-none")} {...billingForm.register("countryCode")}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {/* Only when a card can actually be used — reassuring a shopper about card data on a
          page with no card option reads as a missing feature, not as reassurance. */}
      {visibleMethods.some((method) => method.requiresRedirect || method.icon === "card" || method.icon === "wallet") ? (
        <p className="flex items-center gap-1.5 text-xs text-luxe-gray-dark">
          <ShieldCheck className="size-3.5 shrink-0" strokeWidth={1.5} />
          {t("cardsHandledByProvider")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || !selectedPaymentMethodId}
        className="flex h-12 w-full items-center justify-center gap-2 bg-luxe-black text-sm font-medium tracking-[0.08em] text-luxe-white uppercase transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {t("reviewOrder")}
        <ArrowRight className="size-4" strokeWidth={1.5} />
      </button>
    </form>
  );
}

function PaymentMethodOption({
  method,
  isSelected,
  onSelect,
}: {
  method: CheckoutPaymentMethod;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("Checkout");
  const trust = method.trust;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 border px-4 py-3.5 text-left transition-colors",
        // No colour on the featured method: a bank-yellow panel read as "you need an account
        // with this bank". It earns its place with the badge and the marks instead.
        isSelected ? "border-luxe-black" : "border-border hover:border-luxe-black/50"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          isSelected ? "border-luxe-black" : "border-border"
        )}
      >
        {isSelected ? <span className="size-2 rounded-full bg-luxe-black" /> : null}
      </span>
      <PaymentMethodIcon icon={method.icon} className="mt-0.5 text-luxe-gray-dark" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{method.displayName}</span>
            {trust ? (
              <span className="bg-luxe-black px-1.5 py-0.5 text-[10px] font-medium tracking-[0.12em] uppercase text-luxe-white">{t("mostPopular")}</span>
            ) : null}
          </span>
          {method.fee.amount > 0 ? (
            <span className="text-sm whitespace-nowrap">+{formatMoney(method.fee)}</span>
          ) : null}
        </span>
        {trust ? (
          <>
            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-luxe-black">
              <Lock className="size-3.5" strokeWidth={2} aria-hidden />
              {t("securedBy", { institution: trust.securedByGenitive ?? trust.securedBy })}
            </span>
            <span className="mt-2.5 flex flex-wrap items-center gap-2">
              <Mark id="epay" />
              {trust.schemes?.map((scheme) => <SchemeMark key={scheme} scheme={scheme} />)}
            </span>
            <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-2">
                <Mark id="visa-secure" boxed={false} />
                <Mark id="mastercard-idcheck" boxed={false} />
              </span>
              {trust.assurances?.length ? (
                <span className="text-[11px] text-luxe-gray-dark">{trust.assurances.join(" · ")}</span>
              ) : null}
            </span>
          </>
        ) : (
          <LeadSentence text={method.description} className="mt-0.5 block text-xs text-luxe-gray-dark" />
        )}
        {method.requiresRedirect ? (
          <span className="mt-1 block text-[11px] text-luxe-gray-dark">
            {t("redirectNote")}
          </span>
        ) : null}
        {method.requiresManualConfirmation && !method.requiresRedirect ? (
          <span className="mt-1 block text-[11px] text-luxe-gray-dark">
            {t("manualConfirmNote")}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * The official marks from epay's merchant kit (section 8 of the Redirection manual), served
 * from /public/payments — the epay logotype, the card schemes, IRIS, and the two 3-D Secure
 * programme marks. Plain <img>: static files under our own origin, nothing to optimise, and
 * a brand mark must never be recompressed or recoloured. Google Pay is not in the kit; its
 * mark stays drawn inline until Google's own asset is added.
 */
const MARKS: Record<"epay" | "visa" | "mastercard" | "maestro" | "iris" | "visa-secure" | "mastercard-idcheck", { src: string; alt: string; className: string }> = {
  epay: { src: "/payments/epay.png", alt: "epay", className: "h-5" },
  visa: { src: "/payments/visa.svg", alt: "Visa", className: "h-3.5" },
  mastercard: { src: "/payments/mastercard.svg", alt: "Mastercard", className: "h-6" },
  maestro: { src: "/payments/maestro.svg", alt: "Maestro", className: "h-5" },
  iris: { src: "/payments/iris.png", alt: "IRIS online payments", className: "h-5" },
  "visa-secure": { src: "/payments/visa-secure.jpg", alt: "Visa Secure", className: "h-7" },
  "mastercard-idcheck": { src: "/payments/mastercard-idcheck.png", alt: "Mastercard ID Check", className: "h-6" },
};

function Mark({ id, boxed = true }: { id: keyof typeof MARKS; boxed?: boolean }) {
  const mark = MARKS[id];
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- a brand mark from /public; see MARKS.
    <img src={mark.src} alt={mark.alt} title={mark.alt} className={cn("w-auto", mark.className)} />
  );
  return boxed ? <span className="inline-flex h-8 min-w-11 items-center justify-center border border-border bg-luxe-white px-1.5">{img}</span> : img;
}

function SchemeMark({ scheme }: { scheme: "visa" | "mastercard" | "maestro" | "iris" | "google-pay" }) {
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

/** The first sentence carries the instruction ("pay by deposit to our IBAN"); it is set bold, the rest stays quiet. */
function LeadSentence({ text, className }: { text: string; className?: string }) {
  const match = text.match(/^(.*?[.!;])s+([sS]+)$/);
  if (!match) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      <span className="font-semibold text-luxe-black">{match[1]}</span> {match[2]}
    </span>
  );
}

/** Small local field wrapper — keeps the aria-describedby wiring identical across every input. */
function Field({
  form,
  name,
  id,
  label,
}: {
  form: ReturnType<typeof useForm<AddressFormValues>>;
  name: keyof AddressFormValues;
  id: string;
  label: string;
}) {
  const error = form.formState.errors[name];
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-eyebrow">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass}
        {...form.register(name)}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
