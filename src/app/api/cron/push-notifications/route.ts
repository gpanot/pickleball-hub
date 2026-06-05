import { NextRequest, NextResponse } from "next/server";
import { runPushNotificationsCron } from "@/lib/notifications/push-cron";

/**
 * GET /api/cron/push-notifications
 *
 * Unified PN6 + PN7 cron. Runs on Railway mobile API (`pickleball-hub-mobile`).
 * Railway scraper calls this every 30 min (7am–9pm ICT) and after each ingest.
 *
 * Protected by CRON_SECRET (x-cron-secret header or ?secret= query param).
 */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (
    secret !== process.env.CRON_SECRET &&
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPushNotificationsCron();
  console.log("[cron/push-notifications]", JSON.stringify(result));
  return NextResponse.json(result);
}
