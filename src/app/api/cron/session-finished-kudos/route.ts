import { NextRequest, NextResponse } from "next/server";
import { sendSessionFinishedKudosNotifications } from "@/lib/notifications/pn6-session-finished";

/**
 * GET /api/cron/session-finished-kudos
 *
 * PN6: Fires when a followed player finishes a session — prompts the follower to give kudos.
 * Runs every hour between 7am–9pm ICT via Railway cron.
 *
 * Called hourly by the scraper entrypoint (trigger_session_finished_cron) between 7am–9pm ICT.
 * Railway cron schedule (UTC): every hour 00:00–14:00 — triggered via HTTP from scraper
 *   "0 0-14 * * *"
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

  const result = await sendSessionFinishedKudosNotifications();
  console.log("[cron/session-finished-kudos] result:", JSON.stringify(result));
  return NextResponse.json({ ok: true, ...result });
}
