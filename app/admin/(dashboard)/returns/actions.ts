"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/admin-session";
import { recordAdminAction } from "@/services/audit-log";
import { getReturnById, updateReturnStatus } from "@/services/returns";
import { canTransitionReturn } from "@/lib/order-transitions";
import type { Return } from "@/lib/commerce/types";

export interface ReturnStatusActionState {
  error?: string;
}

/**
 * Returns `{ error }` for a step the returns graph (lib/order-transitions.ts) does not
 * allow, rather than writing it. Every status but "requested" emails the customer and two
 * of them restock, so an arbitrary jump — refunded straight back to requested — was never
 * a harmless edit.
 */
export async function updateReturnStatusAction(returnId: string, status: Return["status"]): Promise<ReturnStatusActionState> {
  await requireCapability("orders:returns");

  const current = await getReturnById(returnId);
  if (!current) return { error: "Return not found." };
  if (!canTransitionReturn(current.status, status)) {
    return { error: `A return can't go from ${current.status} to ${status}.` };
  }
  if (current.status === status) return {};

  await updateReturnStatus(returnId, status);
  // OBS-003. Approving a return is the decision a refund follows from, so the trail would
  // otherwise show money going back with no record of who authorised it.
  await recordAdminAction({
    action: "return.status_changed",
    targetType: "return",
    targetId: returnId,
    summary: `Set return status to ${status}`,
    metadata: { status, previousStatus: current.status },
  });
  revalidatePath("/", "layout");
  return {};
}
