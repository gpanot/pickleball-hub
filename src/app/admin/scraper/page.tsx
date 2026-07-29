import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ScraperDashboard } from "./ScraperDashboard";

export const metadata: Metadata = { title: "Scraper Health" };
export const dynamic = "force-dynamic";

// ─── Market metadata ──────────────────────────────────────────────────────────

export const MARKET_META: Record<string, { label: string; flag: string; country: string }> = {
  hcm:      { label: "Ho Chi Minh",  flag: "🇻🇳", country: "Vietnam"      },
  hanoi:    { label: "Hanoi",         flag: "🇻🇳", country: "Vietnam"      },
  danang:   { label: "Da Nang",       flag: "🇻🇳", country: "Vietnam"      },
  nhatrang: { label: "Nha Trang",     flag: "🇻🇳", country: "Vietnam"      },
  dalat:    { label: "Da Lat",        flag: "🇻🇳", country: "Vietnam"      },
  cantho:   { label: "Can Tho",       flag: "🇻🇳", country: "Vietnam"      },
  kl:       { label: "Kuala Lumpur",  flag: "🇲🇾", country: "Malaysia"     },
  penang:   { label: "Penang",        flag: "🇲🇾", country: "Malaysia"     },
  manila:   { label: "Manila",        flag: "🇵🇭", country: "Philippines"  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type MarketRosterHealth = {
  market: string;
  sessionsToday: number;
  sessionsWithRoster: number;
  rosterCoveragePct: number;
  playersRostered: number;
  lastRosterScrape: string | null;
  lastClubScan: string | null;
  todaySessions: number;
  tomorrowSessions: number;
};

export type RosterRun = {
  market: string;
  vnDate: string;
  sessionsRostered: number;
  playersSeen: number;
  firstRoster: string;
  lastRoster: string;
  scrapeSlots: number;
};

export type ScraperData = {
  fetchedAt: string;
  health: MarketRosterHealth[];
  rosterRuns: RosterRun[];
  totalRosteredToday: number;
  totalPlayersToday: number;
  cronSchedule: { utcHour: number; vnHour: number; label: string }[];
};

// VN cron schedule: 23 UTC (6am VN), 5 UTC (12pm VN), 14 UTC (9pm VN)
const CRON_SLOTS = [
  { utcHour: 23, vnHour: 6,  label: "6 AM VN"  },
  { utcHour: 5,  vnHour: 12, label: "12 PM VN" },
  { utcHour: 14, vnHour: 21, label: "9 PM VN"  },
];

export default async function AdminScraperPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/scraper");
  }

  const [healthRows, rosterRunRows] = await Promise.all([
    // Per-market roster coverage for today
    prisma.$queryRaw<{
      market: string;
      sessions_today: bigint;
      sessions_with_roster: bigint;
      players_rostered: bigint;
      roster_coverage_pct: number | null;
      last_roster_scrape: Date | null;
      last_club_scan: Date | null;
      tomorrow_sessions: bigint;
    }[]>`
      SELECT
        c.market,
        COUNT(DISTINCT s.id) FILTER (WHERE s.scraped_date = CURRENT_DATE::text)                         AS sessions_today,
        COUNT(DISTINCT sr.session_id) FILTER (WHERE s.scraped_date = CURRENT_DATE::text)                AS sessions_with_roster,
        COUNT(DISTINCT sr.user_id)    FILTER (WHERE s.scraped_date = CURRENT_DATE::text)                AS players_rostered,
        ROUND(
          COUNT(DISTINCT sr.session_id) FILTER (WHERE s.scraped_date = CURRENT_DATE::text)::numeric
          / NULLIF(COUNT(DISTINCT s.id) FILTER (WHERE s.scraped_date = CURRENT_DATE::text), 0) * 100, 1
        )                                                                                                AS roster_coverage_pct,
        MAX(sr.scraped_at)                                                                              AS last_roster_scrape,
        MAX(c.updated_at)                                                                               AS last_club_scan,
        COUNT(DISTINCT s.id) FILTER (WHERE s.scraped_date = (CURRENT_DATE + 1)::text)                  AS tomorrow_sessions
      FROM clubs c
      LEFT JOIN sessions s  ON s.club_id = c.id
      LEFT JOIN session_rosters sr ON sr.session_id = s.id
      GROUP BY c.market
      ORDER BY sessions_today DESC
    `,

    // Roster runs per market, last 7 days
    prisma.$queryRaw<{
      market: string;
      vn_date: Date;
      sessions_rostered: bigint;
      players_seen: bigint;
      first_roster: Date;
      last_roster: Date;
      scrape_slots: bigint;
    }[]>`
      SELECT
        c.market,
        DATE(sr.scraped_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') AS vn_date,
        COUNT(DISTINCT sr.session_id)                                           AS sessions_rostered,
        COUNT(DISTINCT sr.user_id)                                              AS players_seen,
        MIN(sr.scraped_at)                                                      AS first_roster,
        MAX(sr.scraped_at)                                                      AS last_roster,
        COUNT(DISTINCT DATE_TRUNC('hour', sr.scraped_at))                       AS scrape_slots
      FROM session_rosters sr
      JOIN sessions s ON s.id = sr.session_id
      JOIN clubs c    ON c.id = s.club_id
      WHERE sr.scraped_at >= NOW() - INTERVAL '7 days'
      GROUP BY c.market, DATE(sr.scraped_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')
      ORDER BY vn_date DESC, sessions_rostered DESC
    `,
  ]);

  const health: MarketRosterHealth[] = healthRows.map((r) => ({
    market:             r.market,
    sessionsToday:      Number(r.sessions_today),
    sessionsWithRoster: Number(r.sessions_with_roster),
    playersRostered:    Number(r.players_rostered),
    rosterCoveragePct:  r.roster_coverage_pct != null ? Number(r.roster_coverage_pct) : 0,
    lastRosterScrape:   r.last_roster_scrape?.toISOString() ?? null,
    lastClubScan:       r.last_club_scan?.toISOString() ?? null,
    todaySessions:      Number(r.sessions_today),
    tomorrowSessions:   Number(r.tomorrow_sessions),
  }));

  // Add configured markets with no data yet
  for (const mk of Object.keys(MARKET_META)) {
    if (!health.find((h) => h.market === mk)) {
      health.push({
        market: mk, sessionsToday: 0, sessionsWithRoster: 0,
        playersRostered: 0, rosterCoveragePct: 0,
        lastRosterScrape: null, lastClubScan: null,
        todaySessions: 0, tomorrowSessions: 0,
      });
    }
  }

  const rosterRuns: RosterRun[] = rosterRunRows.map((r) => ({
    market:           r.market,
    vnDate:           r.vn_date instanceof Date ? r.vn_date.toISOString().slice(0, 10) : String(r.vn_date),
    sessionsRostered: Number(r.sessions_rostered),
    playersSeen:      Number(r.players_seen),
    firstRoster:      r.first_roster instanceof Date ? r.first_roster.toISOString() : String(r.first_roster),
    lastRoster:       r.last_roster  instanceof Date ? r.last_roster.toISOString()  : String(r.last_roster),
    scrapeSlots:      Number(r.scrape_slots),
  }));

  const totalRosteredToday = health.reduce((s, h) => s + h.sessionsWithRoster, 0);
  const totalPlayersToday  = health.reduce((s, h) => s + h.playersRostered, 0);

  const data: ScraperData = {
    fetchedAt: new Date().toISOString(),
    health,
    rosterRuns,
    totalRosteredToday,
    totalPlayersToday,
    cronSchedule: CRON_SLOTS,
  };

  return <ScraperDashboard data={data} meta={MARKET_META} />;
}
