import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { vnCalendarDateString } from "@/lib/utils";

/**
 * GET /api/debug/heatmap
 *
 * Runs each heatmap-page query in isolation and reports timing + row counts
 * so we can identify exactly which query is failing or timing out in prod.
 *
 * DELETE THIS ENDPOINT (or add auth) before going to GA.
 */
export const dynamic = "force-dynamic";

async function runStep<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; label: string; ms: number; result: T } | { ok: false; label: string; ms: number; error: string; code?: string; meta?: unknown }> {
  const t0 = Date.now();
  try {
    const result = await fn();
    return { ok: true, label, ms: Date.now() - t0, result };
  } catch (err) {
    return {
      ok: false,
      label,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string }).code,
      meta: (err as { meta?: unknown }).meta,
    };
  }
}

export async function GET() {
  const todayStr = vnCalendarDateString(0);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const steps = await Promise.all([
    // 1. Basic DB ping
    runStep("db-ping", () => prisma.$queryRaw<[{ now: Date }]>`SELECT NOW()`),

    // 2. Venue count
    runStep("venue-count", () => prisma.venue.count()),

    // 3. Session count today
    runStep("session-count-today", () =>
      prisma.session.count({
        where: { scrapedDate: todayStr, club: { market: "hcm" } },
      }),
    ),

    // 4. SessionRoster count (90d, confirmed)
    runStep("roster-count-90d", () =>
      prisma.sessionRoster.count({
        where: {
          isConfirmed: true,
          session: {
            scrapedDate: { gte: cutoffStr },
            venue: { isNot: null },
            club: { market: "hcm" },
          },
        },
      }),
    ),

    // 5. Sample 5 roster rows with full joins (tests the big query shape)
    runStep("roster-sample", () =>
      prisma.sessionRoster.findMany({
        where: {
          isConfirmed: true,
          session: {
            scrapedDate: { gte: cutoffStr },
            venue: { isNot: null },
            club: { market: "hcm" },
          },
        },
        select: {
          userId: true,
          session: {
            select: {
              id: true,
              venueId: true,
              venue: { select: { id: true, name: true, latitude: true, longitude: true } },
              club: { select: { id: true, name: true, slug: true } },
            },
          },
          player: {
            select: { duprSingles: true, duprDoubles: true },
          },
        },
        take: 5,
      }),
    ),

    // 6. ClubDailyStat upsert table check
    runStep("hcm-median-daily-count", () =>
      prisma.hcmMarketMedianDaily.count(),
    ),

    // 7. Create performance indexes (idempotent — safe to call multiple times)
    runStep("create-indexes", () =>
      prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS session_rosters_is_confirmed_session_id_idx
          ON session_rosters (is_confirmed, session_id);
        CREATE INDEX IF NOT EXISTS sessions_scraped_date_venue_id_club_id_idx
          ON sessions (scraped_date, venue_id, club_id);
      `),
    ),
  ]);

  const allOk = steps.every((s) => s.ok);

  const summary = steps.map((s) => ({
    label: s.label,
    ok: s.ok,
    ms: s.ms,
    ...(s.ok ? {} : { error: (s as { error: string }).error, code: (s as { code?: string }).code }),
  }));

  console.log("[api/debug/heatmap]", JSON.stringify(summary));

  return NextResponse.json(
    { ok: allOk, todayStr, cutoffStr, steps: summary },
    { status: allOk ? 200 : 500 },
  );
}
