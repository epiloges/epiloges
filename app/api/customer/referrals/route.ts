import { connection, NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/customer-session";
import { getOrCreateReferralCode, getReferralsForCustomer } from "@/services/referrals";
import { commerceErrorResponse } from "@/lib/commerce/http-errors";

export async function GET() {
  // A GET is attempted as a prerender at build; the session cookie is only readable per
  // request. Mark the route dynamic before touching it (same as newsletter/export).
  await connection();
  try {
    const session = await requireCustomerSession();
    const [referralCode, referrals] = await Promise.all([
      getOrCreateReferralCode(session.sub),
      getReferralsForCustomer(session.sub),
    ]);
    return NextResponse.json({ referralCode, referrals });
  } catch (error) {
    return commerceErrorResponse(error);
  }
}
