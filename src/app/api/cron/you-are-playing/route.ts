import { NextRequest, NextResponse } from "next/server";
import { sendYouArePlayingNotifications } from "@/lib/notifications/pn7-you-are-playing";

/**
 * GET /api/cron/you-are-playing
 *
 * PN7: Fires when the user's session starts — nudges them to check and connect
 * with players on the court.
 *
 * Railway cron schedule (UTC): every 30 min 00:00–14:00 — "* /30 0-14 * * *"
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

  const result = await sendYouArePlayingNotifications();
  console.log("[cron/you-are-playing]", result);
  return NextResponse.json({ ok: true, ...result });
}
