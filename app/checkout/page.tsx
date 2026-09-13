"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCart } from "@/components/providers/CartProvider";
import { useCheckout } from "@/components/providers/CheckoutProvider";
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { ShippingAddressStep } from "@/components/checkout/steps/ShippingAddressStep";
import { ShippingMethodStep } from "@/components/checkout/steps/ShippingMethodStep";
import { PaymentStep } from "@/components/checkout/steps/PaymentStep";
import { ReviewStep } from "@/components/checkout/steps/ReviewStep";

const STEP_COMPONENTS = {
  shipping: ShippingAddressStep,
  delivery: ShippingMethodStep,
  payment: PaymentStep,
  review: ReviewStep,
};

export default function CheckoutPage() {
  const t = useTranslations("Checkout");
  const router = useRouter();
  const { cart, isLoading: isCartLoading } = useCart();
  const { step, isReady, orderPlaced } = useCheckout();

  useEffect(() => {
    if (isCartLoading || orderPlaced) return;
    if (!cart || cart.lineItems.filter((item) => !item.savedForLater).length === 0) {
      router.replace("/cart");
    }
  }, [isCartLoading, cart, orderPlaced, router]);

  if (isCartLoading || !isReady) {
    return <div className="container-luxe py-24 text-center text-sm text-luxe-gray-dark">{t("loading")}</div>;
  }

  const StepComponent = STEP_COMPONENTS[step];

  return (
    <div className="container-luxe py-10 md:py-14">
      {/* On a phone the collapsed summary sits ABOVE the form: a shopper should see what they
          are paying before typing an address, not after the continue button. On desktop it is
          the right-hand column as before. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
        <div className="order-1 lg:order-2 lg:col-span-1">
          <OrderSummary />
        </div>
        <div className="order-2 lg:order-1 lg:col-span-2">
          <CheckoutSteps />
          <StepComponent />
        </div>
      </div>
    </div>
  );
}
