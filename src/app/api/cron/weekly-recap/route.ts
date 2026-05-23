import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyRecaps } from "@/lib/notifications/pn5-weekly-recap";

/**
 * GET /api/cron/weekly-recap
 * Triggered weekly (Sunday 7pm ICT) via Railway cron or external scheduler.
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendWeeklyRecaps();
  return NextResponse.json({ ok: true, ...result });
}
