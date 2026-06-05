import { NextRequest, NextResponse } from "next/server";
import { runPushNotificationsCron } from "@/lib/notifications/push-cron";

/** @deprecated Use GET /api/cron/push-notifications — kept for backwards compatibility. */
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
  return NextResponse.json({ ...result, deprecated: true });
}
