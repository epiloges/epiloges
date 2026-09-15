import { NextResponse } from "next/server";
import { runAcsDeliverySync } from "@/services/courier-sync";
import { cronTriggerFromRequest, runCron } from "@/services/cron-runs";

/** Same gate as the other crons: Vercel sends the CRON_SECRET, nobody else can trigger it. */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const summary = await runCron("acs-delivery", cronTriggerFromRequest(request), runAcsDeliverySync);
  return NextResponse.json(summary);
}
