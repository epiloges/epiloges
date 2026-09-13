"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { capabilityDenied } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";

export interface SizeStockActionState {
  error?: string;
  quantity?: number;
  inStock?: boolean;
}

const sizeStockSchema = z
  .object({
    quantity: z.number().int("Stock has to be a whole number").min(0, "Stock can't be negative").optional(),
    inStock: z.boolean().optional(),
  })
  .refine((value) => value.quantity !== undefined || value.inStock !== undefined, { message: "Nothing to change." });

/**
 * Sets one size's stock or sellable flag from the Inventory page.
 *
 * The Inventory page listed every size with its count and no way to change it — the count
 * had to be edited on the product form, forty fields away — while the bulk stock panel on
 * the products list pointed people here for "anything finer". This is that action: one
 * size, one write, the quantity taken as the new absolute value (this is the screen you
 * stand at with the box in your hands, so what you type is what is on the shelf).
 */
export async function updateSizeStock(sizeId: string, input: { quantity?: number; inStock?: boolean }): Promise<SizeStockActionState> {
  const denied = await capabilityDenied("catalog:edit");
  if (denied) return { error: denied };

  const parsed = sizeStockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const before = await prisma.productSize.findUnique({
    where: { id: sizeId },
    select: { name: true, quantity: true, inStock: true, product: { select: { id: true, sku: true, name: true } } },
  });
  if (!before) return { error: "That size no longer exists." };

  const updated = await prisma.productSize.update({
    where: { id: sizeId },
    data: {
      ...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
      ...(parsed.data.inStock !== undefined ? { inStock: parsed.data.inStock } : {}),
    },
    select: { quantity: true, inStock: true },
  });

  const changes: string[] = [];
  if (parsed.data.quantity !== undefined && parsed.data.quantity !== before.quantity) {
    changes.push(`stock ${before.quantity} → ${updated.quantity}`);
  }
  if (parsed.data.inStock !== undefined && parsed.data.inStock !== before.inStock) {
    changes.push(updated.inStock ? "made sellable" : "withdrawn from sale");
  }
  if (changes.length > 0) {
    await recordAdminAction({
      action: "product.updated",
      targetType: "product",
      targetId: before.product.id,
      summary: `Inventory: ${before.product.sku} size ${before.name} — ${changes.join(", ")}`,
      metadata: { sizeId, size: before.name, quantityBefore: before.quantity, quantityAfter: updated.quantity, inStock: updated.inStock },
    });
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/inventory");
  return { quantity: updated.quantity, inStock: updated.inStock };
}
