import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CACHE_CONTROL_PUBLIC_LISTINGS } from "@/lib/http-cache-headers";

/**
 * GET /api/dashboard/organizer/booking-behavior
 *
 * Returns booking lead-time distribution for HCM pickleball sessions.
 * Uses session_rosters.scraped_at as a proxy for when a player was first
 * seen on a roster, relative to the session's start time.
 *
 * The 4 scrape windows (UTC): ~23:00, ~01:00, ~05:00, ~14:00
 * Buckets: >48h | 24–48h | 12–24h | <12h (before session start)
 *
 * Also returns a per-date breakdown so the client can show a trend.
 */
export async function GET() {
  try {
    // Raw query: for each roster entry, compute hours_before = session start UTC - scraped_at
    // and classify into buckets. Uses last 60 days of sessions.
    const rows = await prisma.$queryRaw<
      { bucket: string; count: bigint }[]
    >`
      SELECT
        CASE
          WHEN hours_before >= 48 THEN '>48h'
          WHEN hours_before >= 24 THEN '24-48h'
          WHEN hours_before >= 12 THEN '12-24h'
          ELSE '<12h'
        END AS bucket,
        COUNT(*) AS count
      FROM (
        SELECT
          GREATEST(0,
            EXTRACT(EPOCH FROM (
              (s.scraped_date || ' ' || s.start_time)::timestamp
              - INTERVAL '7 hours'
              - sr.scraped_at
            )) / 3600
          ) AS hours_before
        FROM session_rosters sr
        JOIN sessions s ON s.id = sr.session_id
        WHERE s.scraped_date >= (CURRENT_DATE - INTERVAL '60 days')::text
          AND s.scraped_date <= CURRENT_DATE::text
          -- Only count entries scraped BEFORE the session started (positive lead time)
          AND sr.scraped_at < (s.scraped_date || ' ' || s.start_time)::timestamp - INTERVAL '7 hours'
      ) sub
      GROUP BY bucket
    `;

    // Per-date breakdown: how many players appeared in each lead-time bucket per day
    const trend = await prisma.$queryRaw<
      { date: string; gt48: bigint; h2448: bigint; h1224: bigint; lt12: bigint; total: bigint }[]
    >`
      SELECT
        sub.scraped_date AS date,
        COUNT(CASE WHEN sub.hours_before >= 48 THEN 1 END) AS gt48,
        COUNT(CASE WHEN sub.hours_before >= 24 AND sub.hours_before < 48 THEN 1 END) AS h2448,
        COUNT(CASE WHEN sub.hours_before >= 12 AND sub.hours_before < 24 THEN 1 END) AS h1224,
        COUNT(CASE WHEN sub.hours_before >= 0 AND sub.hours_before < 12 THEN 1 END) AS lt12,
        COUNT(*) AS total
      FROM (
        SELECT
          s.scraped_date,
          GREATEST(0,
            EXTRACT(EPOCH FROM (
              (s.scraped_date || ' ' || s.start_time)::timestamp
              - INTERVAL '7 hours'
              - sr.scraped_at
            )) / 3600
          ) AS hours_before
        FROM session_rosters sr
        JOIN sessions s ON s.id = sr.session_id
        WHERE s.scraped_date >= (CURRENT_DATE - INTERVAL '30 days')::text
          AND s.scraped_date <= CURRENT_DATE::text
          AND sr.scraped_at < (s.scraped_date || ' ' || s.start_time)::timestamp - INTERVAL '7 hours'
      ) sub
      GROUP BY sub.scraped_date
      ORDER BY sub.scraped_date ASC
    `;

    const bucketOrder = [">48h", "24-48h", "12-24h", "<12h"];
    const bucketLabels: Record<string, string> = {
      ">48h": ">48h",
      "24-48h": "24–48h",
      "12-24h": "12–24h",
      "<12h": "<12h",
    };

    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    const distribution = bucketOrder.map((b) => {
      const found = rows.find((r) => r.bucket === b);
      const count = found ? Number(found.count) : 0;
      return {
        bucket: bucketLabels[b],
        count,
        pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      };
    });

    const trendData = trend.map((r) => ({
      date: r.date,
      gt48: Number(r.gt48),
      h2448: Number(r.h2448),
      h1224: Number(r.h1224),
      lt12: Number(r.lt12),
      total: Number(r.total),
    }));

    return NextResponse.json(
      { distribution, trend: trendData },
      { headers: { "Cache-Control": CACHE_CONTROL_PUBLIC_LISTINGS } }
    );
  } catch (error) {
    console.error("Error fetching booking behavior:", error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
