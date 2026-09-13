import { NextResponse, type NextRequest } from "next/server";
import { readEmailVerificationToken } from "@/lib/email-verification";
import { verifyCustomerEmail } from "@/services/customers";

/**
 * The link in the welcome email lands here. A GET with a side effect, like every
 * verification link ever mailed — the token is the authorisation, and stamping the same
 * address twice changes nothing. Always ends on /account/verify-email, which explains
 * the outcome and knows whether the visitor is signed in; a raw JSON body on a link
 * someone tapped on their phone would be the wrong answer either way.
 */
export async function GET(request: NextRequest) {
  const claim = await readEmailVerificationToken(request.nextUrl.searchParams.get("token"));
  const ok = claim ? await verifyCustomerEmail(claim.customerId, claim.email) : false;
  const destination = new URL("/account/verify-email", request.nextUrl.origin);
  destination.searchParams.set("status", ok ? "verified" : "invalid");
  return NextResponse.redirect(destination);
}
