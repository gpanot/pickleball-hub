import { NextRequest, NextResponse } from "next/server";
import { railwayRedeployScraper } from "@/lib/railway-redeploy-scraper";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/trigger-scraper
 * Secured with SCRAPER_TRIGGER_SECRET (Authorization: Bearer <secret>).
 * Calls Railway API to redeploy the scraper service so a new run starts
 * without waiting for the next cron tick (same image; fresh container run).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SCRAPER_TRIGGER_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "SCRAPER_TRIGGER_SECRET is not configured on this app." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await railwayRedeployScraper();
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, details: result.details },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Scraper service redeploy triggered. Check Railway deploy logs for the scraper.",
    railway: result.data,
  });
}
