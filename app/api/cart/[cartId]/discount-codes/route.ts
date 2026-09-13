import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { applyDiscountCode, removeDiscountCode } from "@/services/carts";
import { codeBodySchema } from "@/lib/validation/commerce";
import { commerceErrorResponse, invalidInputResponse } from "@/lib/commerce/http-errors";

type RouteParams = { params: Promise<{ cartId: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // A discount code is a secret that spends money, and this was the one cart write with no
    // limit — a script could guess codes as fast as the database answered. Twenty attempts in
    // ten minutes is more than a person mistyping needs and useless for a brute force.
    const limited = await enforceRateLimit(request, { name: "discount-redeem", limit: 20, windowMs: 600000 });
    if (limited) return limited;

    const { cartId } = await params;
    const parsed = codeBodySchema.safeParse(await request.json());
    if (!parsed.success) return invalidInputResponse("A discount code is required.");
    const cart = await applyDiscountCode(cartId, parsed.data.code);
    return NextResponse.json({ cart });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { cartId } = await params;
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return invalidInputResponse("A discount code is required.");
    const cart = await removeDiscountCode(cartId, code);
    return NextResponse.json({ cart });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
