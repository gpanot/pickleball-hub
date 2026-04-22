/**
 * Copy sessions + latest snapshot + club_daily_stats for one scraped_date
 * from SOURCE_DATABASE_URL (e.g. local) into TARGET_DATABASE_URL (e.g. production).
 *
 * Matches rows by (reference_code, scraped_date). Maps clubs via reclub_id and
 * venues by coordinates (±0.0001°), creating a venue on target if missing.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://...local..." \
 *   TARGET_DATABASE_URL="postgresql://...prod..." \
 *   npx tsx scripts/migrate-scrape-day.ts --date=2026-04-23
 *
 * Omit --date to use Vietnam "tomorrow" (same logic as the web app).
 *
 *   --dry-run   Log counts only, no writes.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { vnCalendarDateString } from "../src/lib/utils";

function parseArgs() {
  const dryRun = process.argv.includes("--dry-run");
  let date: string | null = null;
  for (const a of process.argv) {
    if (a.startsWith("--date=")) date = a.slice("--date=".length);
    else if (a === "--date") {
      const i = process.argv.indexOf(a);
      if (i >= 0 && process.argv[i + 1]) date = process.argv[i + 1];
    }
  }
  return { dryRun, date };
}

function makeClient(url: string) {
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.DEBUG_PRISMA ? ["query", "error"] : ["error"],
  });
}

async function findVenueIdOnTarget(
  target: PrismaClient,
  v: { name: string; address: string; latitude: number; longitude: number },
): Promise<number> {
  const rows = await target.$queryRaw<{ id: number }[]>`
    SELECT id FROM venues
    WHERE ABS(latitude - ${v.latitude}) < 0.00015
      AND ABS(longitude - ${v.longitude}) < 0.00015
    LIMIT 1
  `;
  if (rows[0]) return rows[0].id;
  const created = await target.venue.create({
    data: {
      name: v.name,
      address: v.address,
      latitude: v.latitude,
      longitude: v.longitude,
    },
  });
  return created.id;
}

async function refreshClubDailyStats(target: PrismaClient, date: string) {
  await target.$executeRaw`
    INSERT INTO club_daily_stats (club_id, date, total_sessions, total_capacity, total_joined, avg_fill_rate, avg_fee, revenue_estimate)
    SELECT
      s.club_id,
      s.scraped_date AS date,
      COUNT(*)::int AS total_sessions,
      COALESCE(SUM(s.max_players), 0)::int AS total_capacity,
      COALESCE(SUM(ds.joined), 0)::int AS total_joined,
      CASE WHEN COALESCE(SUM(s.max_players), 0) > 0
           THEN ROUND((COALESCE(SUM(ds.joined), 0)::numeric / SUM(s.max_players)), 3)
           ELSE 0 END AS avg_fill_rate,
      ROUND(AVG(s.fee_amount)) AS avg_fee,
      COALESCE(SUM(ds.joined * s.fee_amount), 0)::float AS revenue_estimate
    FROM sessions s
    LEFT JOIN LATERAL (
      SELECT joined FROM daily_snapshots
      WHERE session_id = s.id ORDER BY scraped_at DESC LIMIT 1
    ) ds ON true
    WHERE s.scraped_date = ${date}
    GROUP BY s.club_id, s.scraped_date
    ON CONFLICT (club_id, date) DO UPDATE SET
      total_sessions = EXCLUDED.total_sessions,
      total_capacity = EXCLUDED.total_capacity,
      total_joined = EXCLUDED.total_joined,
      avg_fill_rate = EXCLUDED.avg_fill_rate,
      avg_fee = EXCLUDED.avg_fee,
      revenue_estimate = EXCLUDED.revenue_estimate
  `;
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL?.trim();
  const targetUrl =
    process.env.TARGET_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!sourceUrl) {
    console.error("Set SOURCE_DATABASE_URL (usually your local DB with the fresh scrape).");
    process.exit(1);
  }
  if (!targetUrl) {
    console.error("Set TARGET_DATABASE_URL or DATABASE_URL for the production database.");
    process.exit(1);
  }
  if (sourceUrl === targetUrl) {
    console.error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL must differ.");
    process.exit(1);
  }

  const { dryRun, date: dateArg } = parseArgs();
  const date = dateArg ?? vnCalendarDateString(1);

  const source = makeClient(sourceUrl);
  const target = makeClient(targetUrl);

  try {
    const countSource = await source.session.count({ where: { scrapedDate: date } });
    const countTargetBefore = await target.session.count({ where: { scrapedDate: date } });

    console.log(`Date (scraped_date): ${date}`);
    console.log(`Source sessions: ${countSource} | Target before: ${countTargetBefore}`);
    if (countSource === 0) {
      console.error("No sessions on source for this date. Nothing to migrate.");
      process.exit(1);
    }

    if (dryRun) {
      console.log("--dry-run: no changes made.");
      return;
    }

    const targetClubs = await target.club.findMany({ select: { id: true, reclubId: true } });
    const reclubToTargetId = new Map(targetClubs.map((c) => [c.reclubId, c.id]));

    const sessions = await source.session.findMany({
      where: { scrapedDate: date },
      include: {
        club: {
          select: {
            reclubId: true,
            name: true,
            slug: true,
            sportId: true,
            communityId: true,
            numMembers: true,
          },
        },
        venue: true,
        snapshots: { orderBy: { scrapedAt: "desc" }, take: 1 },
      },
    });

    const sourceClubs = new Map<number, {
      reclubId: number;
      name: string;
      slug: string;
      sportId: number | null;
      communityId: number | null;
      numMembers: number;
    }>();
    for (const s of sessions) {
      if (!sourceClubs.has(s.club.reclubId)) {
        sourceClubs.set(s.club.reclubId, s.club);
      }
    }
    let createdClubs = 0;
    for (const c of sourceClubs.values()) {
      if (reclubToTargetId.has(c.reclubId)) continue;
      const upsertedClub = await target.club.upsert({
        where: { reclubId: c.reclubId },
        create: {
          reclubId: c.reclubId,
          name: c.name,
          slug: c.slug || `club-${c.reclubId}`,
          sportId: c.sportId,
          communityId: c.communityId,
          numMembers: c.numMembers,
        },
        update: {
          name: c.name,
          slug: c.slug || `club-${c.reclubId}`,
          sportId: c.sportId,
          communityId: c.communityId,
          numMembers: c.numMembers,
        },
      });
      reclubToTargetId.set(c.reclubId, upsertedClub.id);
      createdClubs++;
    }
    let upserted = 0;
    let skippedClub = 0;
    let snapshots = 0;

    for (const s of sessions) {
      const targetClubId = reclubToTargetId.get(s.club.reclubId);
      if (targetClubId == null) {
        skippedClub++;
        continue;
      }

      let venueId: number | null = null;
      if (s.venue) {
        venueId = await findVenueIdOnTarget(target, s.venue);
      }

      await target.session.upsert({
        where: {
          referenceCode_scrapedDate: {
            referenceCode: s.referenceCode,
            scrapedDate: s.scrapedDate,
          },
        },
        create: {
          referenceCode: s.referenceCode,
          name: s.name,
          clubId: targetClubId,
          venueId,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMin: s.durationMin,
          maxPlayers: s.maxPlayers,
          feeAmount: s.feeAmount,
          feeCurrency: s.feeCurrency,
          costPerHour: s.costPerHour,
          privacy: s.privacy,
          status: s.status,
          skillLevelMin: s.skillLevelMin,
          skillLevelMax: s.skillLevelMax,
          perks: s.perks,
          eventUrl: s.eventUrl,
          scrapedDate: s.scrapedDate,
        },
        update: {
          name: s.name,
          clubId: targetClubId,
          venueId,
          startTime: s.startTime,
          endTime: s.endTime,
          durationMin: s.durationMin,
          maxPlayers: s.maxPlayers,
          feeAmount: s.feeAmount,
          feeCurrency: s.feeCurrency,
          costPerHour: s.costPerHour,
          privacy: s.privacy,
          status: s.status,
          skillLevelMin: s.skillLevelMin,
          skillLevelMax: s.skillLevelMax,
          perks: s.perks,
          eventUrl: s.eventUrl,
        },
      });
      upserted++;

      const snap = s.snapshots[0];
      if (snap) {
        const row = await target.session.findUniqueOrThrow({
          where: {
            referenceCode_scrapedDate: {
              referenceCode: s.referenceCode,
              scrapedDate: s.scrapedDate,
            },
          },
          select: { id: true },
        });
        await target.dailySnapshot.create({
          data: {
            sessionId: row.id,
            scrapedAt: snap.scrapedAt,
            joined: snap.joined,
            waitlisted: snap.waitlisted,
          },
        });
        snapshots++;
      }
    }

    await refreshClubDailyStats(target, date);

    const countTargetAfter = await target.session.count({ where: { scrapedDate: date } });
    const joinedAgg = await target.dailySnapshot.groupBy({
      by: ["sessionId"],
      where: { session: { scrapedDate: date } },
      _max: { scrapedAt: true },
    });
    // simpler: sum joined from latest snapshot per session via raw
    const [{ total_players }] = await target.$queryRaw<[{ total_players: bigint }]>`
      SELECT COALESCE(SUM(ds.joined), 0)::bigint AS total_players
      FROM sessions s
      JOIN LATERAL (
        SELECT joined FROM daily_snapshots
        WHERE session_id = s.id ORDER BY scraped_at DESC LIMIT 1
      ) ds ON true
      WHERE s.scraped_date = ${date}
    `;

    console.log(`Clubs synced on target: +${createdClubs}`);
    console.log(`Upserted sessions: ${upserted} (skipped missing club on target: ${skippedClub})`);
    console.log(`Inserted snapshots: ${snapshots}`);
    console.log(`Target sessions for ${date}: ${countTargetAfter}`);
    console.log(`Target players (sum joined, latest snapshot per session): ${total_players}`);
    console.log("Done. club_daily_stats refreshed for this date on target.");
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
