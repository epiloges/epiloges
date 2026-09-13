import { NextResponse, type NextRequest } from "next/server";
import { readUnsubscribeToken, recordUnsubscribe } from "@/lib/email/unsubscribe";
import { getSiteUrl } from "@/lib/site-url";

/**
 * The link in every marketing email, and the target of the List-Unsubscribe header.
 *
 * GET is what a person clicks: it records the opt-out and shows a plain confirmation.
 * POST is the RFC 8058 one-click form mail clients send when the user presses their
 * built-in Unsubscribe button; it must succeed without any page, so it answers 200 and
 * nothing else. Both take the same signed token — see lib/email/unsubscribe.ts.
 */
async function handle(request: NextRequest): Promise<{ email: string | null }> {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const email = token ? await readUnsubscribeToken(token) : null;
  if (email) await recordUnsubscribe(email, "link");
  return { email };
}

export async function GET(request: NextRequest) {
  const { email } = await handle(request);
  const home = getSiteUrl().replace(/\/$/, "");
  const body = email
    ? `<h1>Διαγραφήκατε από τη λίστα</h1><p>Δεν θα λαμβάνετε ξανά ενημερωτικά μηνύματα στη διεύθυνση <strong>${escapeHtml(email)}</strong>. Τα μηνύματα για τις παραγγελίες σας δεν επηρεάζονται.</p>`
    : `<h1>Ο σύνδεσμος δεν ισχύει</h1><p>Ο σύνδεσμος διαγραφής έχει λήξει ή δεν είναι έγκυρος. Γράψτε μας από τη σελίδα επικοινωνίας και θα σας αφαιρέσουμε από τη λίστα.</p>`;
  return new NextResponse(
    `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Διαγραφή από τη λίστα</title>
<style>body{font-family:system-ui,sans-serif;color:#111;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.6}h1{font-weight:400;font-size:1.5rem}a{color:#111}</style></head>
<body>${body}<p><a href="${home}">Επιστροφή στο κατάστημα</a></p></body></html>`,
    { status: email ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function POST(request: NextRequest) {
  const { email } = await handle(request);
  return new NextResponse(null, { status: email ? 200 : 400 });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
