"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { capabilityDenied, requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { SHOP_TIME_ZONE, endOfDayIn } from "@/lib/dates";
import { discountFormSchema, type DiscountFormValues } from "@/lib/validation/discount";

export interface DiscountActionState {
  error?: string;
}

function revalidateStorefront() {
  revalidatePath("/", "layout");
}

export async function createDiscount(values: DiscountFormValues): Promise<DiscountActionState> {
  const denied = await capabilityDenied("catalog:discounts");
  if (denied) return { error: denied };
  const parsed = discountFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const existing = await prisma.discount.findUnique({ where: { code: data.code } });
  if (existing) return { error: "A discount with this code already exists." };

  const created = await prisma.discount.create({
    data: {
      code: data.code,
      type: data.type,
      value: data.value,
      active: data.active,
      // The whole of the chosen day, in the shop's zone — not midnight UTC, which is 02:00 in
      // Athens and used to cut the last day off every expiry.
      expiresAt: data.expiresAt ? endOfDayIn(data.expiresAt, SHOP_TIME_ZONE) : null,
    },
  });

  // OBS-003. A discount code changes what every future order is worth — the closest thing
  // in the catalogue to moving money directly.
  await recordAdminAction({
    action: "discount.created",
    targetType: "discount",
    targetId: created.id,
    summary: `Created discount ${data.code} (${data.type}, ${data.value})`,
    metadata: { code: data.code, type: data.type, value: data.value, active: data.active, expiresAt: data.expiresAt ?? null },
  });

  revalidateStorefront();
  redirect("/admin/discounts");
}

/**
 * Edits a code in place. Until now a discount could only be created, toggled or deleted —
 * changing its expiry or value meant deleting it and recreating it, and losing the usage
 * count with it. The code itself is editable too, but colliding with another discount's
 * code is refused rather than reported by the database.
 */
export async function updateDiscount(id: string, values: DiscountFormValues): Promise<DiscountActionState> {
  const denied = await capabilityDenied("catalog:discounts");
  if (denied) return { error: denied };
  const parsed = discountFormSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const before = await prisma.discount.findUnique({ where: { id } });
  if (!before) return { error: "That discount no longer exists." };
  const clash = await prisma.discount.findUnique({ where: { code: data.code }, select: { id: true } });
  if (clash && clash.id !== id) return { error: "A discount with this code already exists." };

  await prisma.discount.update({
    where: { id },
    data: {
      code: data.code,
      type: data.type,
      value: data.value,
      active: data.active,
      expiresAt: data.expiresAt ? endOfDayIn(data.expiresAt, SHOP_TIME_ZONE) : null,
    },
  });

  await recordAdminAction({
    action: "discount.updated",
    targetType: "discount",
    targetId: id,
    summary: `Edited discount ${before.code}${before.code !== data.code ? ` (now ${data.code})` : ""}: ${data.type} ${data.value}`,
    metadata: {
      before: { code: before.code, type: before.type, value: Number(before.value), active: before.active, expiresAt: before.expiresAt },
      after: { code: data.code, type: data.type, value: data.value, active: data.active, expiresAt: data.expiresAt ?? null },
    },
  });

  revalidateStorefront();
  redirect("/admin/discounts");
}

/** No redirect — called from the list page itself, not a detail page. */
export async function toggleDiscountActive(id: string, active: boolean): Promise<void> {
  await requireCapability("catalog:discounts");
  const discount = await prisma.discount.update({ where: { id }, data: { active } });
  await recordAdminAction({
    action: "discount.updated",
    targetType: "discount",
    targetId: id,
    summary: `${active ? "Activated" : "Deactivated"} discount ${discount.code}`,
    metadata: { code: discount.code, active },
  });
  revalidateStorefront();
}

export async function deleteDiscount(id: string): Promise<void> {
  await requireCapability("catalog:discounts");
  const discount = await prisma.discount.findUnique({
    where: { id },
    select: { code: true, type: true, value: true },
  });
  await prisma.discount.delete({ where: { id } });
  await recordAdminAction({
    action: "discount.deleted",
    targetType: "discount",
    targetId: id,
    summary: `Deleted discount ${discount?.code ?? id}`,
    metadata: { code: discount?.code, type: discount?.type, value: discount?.value },
  });
  revalidateStorefront();
}
