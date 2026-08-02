import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { materializeSeries } from "@/lib/club-sessions/materialize-series";

/**
 * GET /api/cron/materialize-series
 *
 * Nightly cron endpoint — called from cron/scripts/conquest-cron.sh at 02:00 UTC.
 * Ensures every active SessionSeries has 8 future ClubSession occurrences.
 * Auth: CRON_SECRET via x-cron-secret header or ?secret= query param.
 */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allActiveSeries = await prisma.sessionSeries.findMany({
    where: { lifecycleState: "active" },
    select: { id: true },
  });

  let occurrencesCreated = 0;

  for (const series of allActiveSeries) {
    try {
      const result = await materializeSeries(series.id, 8);
      occurrencesCreated += result.created;
    } catch (err) {
      console.error(`[cron/materialize-series] Error for series ${series.id}:`, err);
    }
  }

  console.log(
    `[cron/materialize-series] processed=${allActiveSeries.length} occurrencesCreated=${occurrencesCreated}`,
  );

  return NextResponse.json({
    processed: allActiveSeries.length,
    occurrencesCreated,
  });
}
