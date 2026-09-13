"use server";

import { revalidatePath } from "next/cache";
import { capabilityDenied } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import {
  getAllMethodSettings,
  isProviderEnabled,
  saveMethodSettings,
  saveProviderConfig,
  setMethodEnabled,
  setProviderEnabled,
} from "@/lib/payments/config";
import { paymentProviderRegistry } from "@/lib/payments/registry";
import { testProviderConnection } from "@/services/payments";
import type { ConfigurationTestResult, PaymentEnvironment, PaymentMethodSettings } from "@/lib/payments/types";

/**
 * Every action here is gated on `payments:configure` — the capability that grants
 * access to live payment credentials and decides what customers can pay with.
 *
 * They use `capabilityDenied` (which RETURNS the refusal) rather than
 * `requireCapability` (which throws), because a thrown error inside a Server Action
 * never reaches the caller's `if (result.error)` check — the guard would hold while
 * the button appeared to do nothing at all. That silent no-op reads as a broken app
 * rather than a permission boundary; see lib/admin-session.ts.
 */

export interface PaymentSettingsActionState {
  error?: string;
  success?: string;
}

function revalidatePayments() {
  revalidatePath("/admin/settings/payments", "layout");
  revalidatePath("/admin/payments", "layout");
}

export async function saveProviderConfigAction(
  providerId: string,
  formData: FormData
): Promise<PaymentSettingsActionState> {
  const denied = await capabilityDenied("payments:configure");
  if (denied) return { error: denied };

  const provider = paymentProviderRegistry.get(providerId);
  if (!provider) return { error: `Unknown payment provider "${providerId}".` };

  const environmentRaw = formData.get("environment");
  const environment: PaymentEnvironment | undefined =
    environmentRaw === "production" || environmentRaw === "sandbox" ? environmentRaw : undefined;

  const values: Record<string, string> = {};
  for (const field of provider.configFields) {
    const raw = formData.get(`field:${field.key}`);
    if (field.type === "boolean") {
      // An unchecked checkbox submits nothing at all, so the absence of a value is
      // meaningful here in a way it isn't for a text input.
      values[field.key] = raw === "on" || raw === "true" ? "true" : "false";
      continue;
    }
    if (typeof raw === "string") values[field.key] = raw;
  }

  const clearedSecretKeys = provider.configFields
    .filter((field) => field.secret && formData.get(`clear:${field.key}`) === "on")
    .map((field) => field.key);

  try {
    await saveProviderConfig({
      providerId,
      environment,
      enabled: formData.get("enabled") === "on",
      values,
      clearedSecretKeys,
    });
  } catch (error) {
    // Most commonly a missing PAYMENTS_CONFIG_SECRET, whose message already explains
    // the fix — surfacing it verbatim is more useful than a generic failure.
    return { error: error instanceof Error ? error.message : "Could not save the configuration." };
  }

  // The credentials themselves never go in the trail — which fields changed does. This is
  // the write that decides where card payments are routed.
  await recordAdminAction({
    action: "paymentProvider.updated",
    targetType: "paymentProvider",
    targetId: providerId,
    summary: `Updated ${provider.name} configuration (${environment ?? "current"} environment${clearedSecretKeys.length ? `, cleared ${clearedSecretKeys.join(", ")}` : ""})`,
    metadata: {
      environment: environment ?? null,
      enabled: formData.get("enabled") === "on",
      fieldsSet: Object.keys(values).filter((key) => values[key] !== ""),
      clearedSecretKeys,
    },
  });

  revalidatePayments();
  return { success: "Settings saved." };
}

export async function setProviderEnabledAction(
  providerId: string,
  enabled: boolean
): Promise<PaymentSettingsActionState> {
  const denied = await capabilityDenied("payments:configure");
  if (denied) return { error: denied };
  await setProviderEnabled(providerId, enabled);
  await recordAdminAction({
    action: "paymentProvider.updated",
    targetType: "paymentProvider",
    targetId: providerId,
    summary: `${enabled ? "Enabled" : "Disabled"} the ${paymentProviderRegistry.get(providerId)?.name ?? providerId} provider`,
    metadata: { enabled },
  });
  revalidatePayments();
  return { success: enabled ? "Provider enabled." : "Provider disabled." };
}

export async function setMethodEnabledAction(
  methodId: string,
  enabled: boolean
): Promise<PaymentSettingsActionState> {
  const denied = await capabilityDenied("payments:configure");
  if (denied) return { error: denied };

  /**
   * Refuse to switch off the last way to pay. Four toggles could quietly close the shop:
   * checkout kept rendering, offered nothing, and the admin saw four green "disabled" toasts.
   * A method counts as a way to pay only if its provider is enabled too.
   */
  if (!enabled) {
    const all = await getAllMethodSettings();
    const stillOpen = [];
    for (const setting of all) {
      if (setting.methodId === methodId || !setting.enabled) continue;
      const definition = paymentProviderRegistry.getMethod(setting.methodId);
      if (definition && (await isProviderEnabled(definition.providerId))) stillOpen.push(setting.methodId);
    }
    if (stillOpen.length === 0) {
      return { error: "This is the only way customers can pay. Enable another payment method before disabling it — with none, checkout shows no options at all." };
    }
  }

  await setMethodEnabled(methodId, enabled);
  await recordAdminAction({
    action: "paymentMethod.updated",
    targetType: "paymentMethod",
    targetId: methodId,
    summary: `${enabled ? "Enabled" : "Disabled"} the ${paymentProviderRegistry.getMethod(methodId)?.name ?? methodId} payment method`,
    metadata: { enabled },
  });
  // Availability is read live on every checkout request, so this takes effect on the
  // shopper's next page view with no deploy — §20's "changing this should immediately
  // affect checkout availability".
  revalidatePayments();
  return { success: enabled ? "Payment method enabled." : "Payment method disabled." };
}

export async function saveMethodSettingsAction(formData: FormData): Promise<PaymentSettingsActionState> {
  const denied = await capabilityDenied("payments:configure");
  if (denied) return { error: denied };

  const methodId = String(formData.get("methodId") ?? "");
  if (!paymentProviderRegistry.getMethod(methodId)) return { error: `Unknown payment method "${methodId}".` };

  const feeTypeRaw = String(formData.get("feeType") ?? "none");
  const feeType: PaymentMethodSettings["feeType"] =
    feeTypeRaw === "fixed" || feeTypeRaw === "percentage" ? feeTypeRaw : "none";

  const optionalNumber = (key: string): number | null => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const minimumAmount = optionalNumber("minimumAmount");
  const maximumAmount = optionalNumber("maximumAmount");
  if (minimumAmount !== null && maximumAmount !== null && minimumAmount > maximumAmount) {
    // Silently accepting this would make the method unavailable for every possible
    // order total, which looks exactly like a bug from the storefront side.
    return { error: "The minimum order amount can't be higher than the maximum." };
  }

  const feeValue = Number(String(formData.get("feeValue") ?? "0").replace(",", "."));
  if (feeType !== "none" && (!Number.isFinite(feeValue) || feeValue < 0)) {
    return { error: "Enter a fee of zero or more." };
  }
  if (feeType === "percentage" && feeValue > 100) {
    return { error: "A percentage fee above 100% is almost certainly a typo." };
  }

  const splitList = (key: string) =>
    String(formData.get(key) ?? "")
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);

  await saveMethodSettings({
    methodId,
    enabled: formData.get("enabled") === "on",
    sortOrder: Number(formData.get("sortOrder") ?? 0) || 0,
    displayName: String(formData.get("displayName") ?? "") || null,
    description: String(formData.get("description") ?? "") || null,
    feeType,
    feeValue: feeType === "none" ? 0 : feeValue,
    minimumAmount,
    maximumAmount,
    countries: splitList("countries"),
    shippingRateIds: formData.getAll("shippingRateIds").map(String).filter(Boolean),
  });

  await recordAdminAction({
    action: "paymentMethod.updated",
    targetType: "paymentMethod",
    targetId: methodId,
    summary: `Updated ${paymentProviderRegistry.getMethod(methodId)?.name ?? methodId}: ${feeType === "none" ? "no fee" : `fee ${feeType} ${feeValue}`}, ${formData.get("enabled") === "on" ? "enabled" : "disabled"}`,
    metadata: { feeType, feeValue, minimumAmount, maximumAmount, enabled: formData.get("enabled") === "on" },
  });

  revalidatePayments();
  return { success: "Payment method saved." };
}

export interface TestConnectionState {
  result?: ConfigurationTestResult;
  error?: string;
}

export async function testConnectionAction(providerId: string): Promise<TestConnectionState> {
  const denied = await capabilityDenied("payments:configure");
  if (denied) return { error: denied };
  try {
    const result = await testProviderConnection(providerId);
    revalidatePayments();
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The connection test failed." };
  }
}
