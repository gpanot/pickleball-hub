import type { Metadata } from "next";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

// ─── Market metadata (label + country + currency) ────────────────────────────

export const MARKET_META: Record<
  string,
  { label: string; country: string; flag: string; currency: string }
> = {
  hcm:      { label: "Ho Chi Minh", country: "Vietnam",     flag: "🇻🇳", currency: "VND" },
  hanoi:    { label: "Hanoi",        country: "Vietnam",     flag: "🇻🇳", currency: "VND" },
  danang:   { label: "Da Nang",      country: "Vietnam",     flag: "🇻🇳", currency: "VND" },
  nhatrang: { label: "Nha Trang",    country: "Vietnam",     flag: "🇻🇳", currency: "VND" },
  dalat:    { label: "Da Lat",       country: "Vietnam",     flag: "🇻🇳", currency: "VND" },
  cantho:   { label: "Can Tho",      country: "Vietnam",     flag: "🇻🇳", currency: "VND" },
  kl:       { label: "Kuala Lumpur", country: "Malaysia",    flag: "🇲🇾", currency: "MYR" },
  penang:   { label: "Penang",       country: "Malaysia",    flag: "🇲🇾", currency: "MYR" },
  manila:   { label: "Manila",       country: "Philippines", flag: "🇵🇭", currency: "PHP" },
};

// ─── Type definitions ─────────────────────────────────────────────────────────

export type MarketOverview = {
  market: string;
  clubs: number;
  sessionsToday: number;
  sessions7d: number;
  sessions30d: number;
  activePlayers30d: number;
};

export type MarketPlayerStats = {
  market: string;
  totalPlayers: number;
  playersWithDupr: number;
  avgDupr: number | null;
};

export type MarketQuality = {
  market: string;
  avgFillPct: number | null;
  avgFee: number | null;
  currency: string;
};

export type DailyTrend = {
  market: string;
  date: string;
  sessions: number;
  totalJoined: number;
};

export type DuprBucket = {
  market: string;
  bucket: string;
  count: number;
};

export type TopClub = {
  market: string;
  clubName: string;
  sessions: number;
  totalPlayers: number;
};

export type AnalyticsData = {
  fetchedAt: string;
  globalClubs: number;
  globalPlayers: number;
  globalPlayersWithDupr: number;
  markets: string[];
  overview: MarketOverview[];
  playerStats: MarketPlayerStats[];
  quality: MarketQuality[];
  trend: DailyTrend[];
  duprBuckets: DuprBucket[];
  topClubs: TopClub[];
};

// ─── Server component ─────────────────────────────────────────────────────────

export default async function AdminAnalyticsPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login?next=/admin/analytics");
  }

  const [
    globalRow,
    overviewRows,
    playerRows,
    qualityRows,
    trendRows,
    duprRows,
    topClubRows,
  ] = await Promise.all([
    // Global totals
    prisma.$queryRaw<{ total_clubs: bigint; total_players: bigint; with_dupr: bigint }[]>`
      SELECT
        (SELECT COUNT(*) FROM clubs)::bigint   AS total_clubs,
        (SELECT COUNT(*) FROM players)::bigint AS total_players,
        (SELECT COUNT(*) FROM players WHERE dupr_doubles IS NOT NULL)::bigint AS with_dupr
    `,

    // Per-market overview: clubs + session counts + active players
    prisma.$queryRaw<{
      market: string;
      clubs: bigint;
      sessions_today: bigint;
      sessions_7d: bigint;
      sessions_30d: bigint;
      active_players_30d: bigint;
    }[]>`
      SELECT
        c.market,
        COUNT(DISTINCT c.id)                                                                        AS clubs,
        COUNT(DISTINCT s.id) FILTER (WHERE s.scraped_date = CURRENT_DATE::text)                   AS sessions_today,
        COUNT(DISTINCT s.id) FILTER (WHERE s.scraped_date >= (CURRENT_DATE - 7)::text)            AS sessions_7d,
        COUNT(DISTINCT s.id) FILTER (WHERE s.scraped_date >= (CURRENT_DATE - 30)::text)           AS sessions_30d,
        COUNT(DISTINCT sr.user_id) FILTER (WHERE s.scraped_date >= (CURRENT_DATE - 30)::text)     AS active_players_30d
      FROM clubs c
      LEFT JOIN sessions s  ON s.club_id   = c.id
      LEFT JOIN session_rosters sr ON sr.session_id = s.id
      GROUP BY c.market
      ORDER BY clubs DESC
    `,

    // Per-market player stats (players seen in rosters in last 30 days)
    prisma.$queryRaw<{
      market: string;
      total_players: bigint;
      players_with_dupr: bigint;
      avg_dupr: number | null;
    }[]>`
      SELECT
        c.market,
        COUNT(DISTINCT p.user_id)                                                              AS total_players,
        COUNT(DISTINCT p.user_id) FILTER (WHERE p.dupr_doubles IS NOT NULL)                   AS players_with_dupr,
        ROUND(AVG(p.dupr_doubles::float) FILTER (WHERE p.dupr_doubles IS NOT NULL)::numeric, 3)  AS avg_dupr
      FROM players p
      JOIN session_rosters sr ON sr.user_id   = p.user_id
      JOIN sessions         s  ON s.id         = sr.session_id
      JOIN clubs            c  ON c.id         = s.club_id
      WHERE s.scraped_date >= (CURRENT_DATE - 30)::text
      GROUP BY c.market
    `,

    // Per-market fill rate + avg fee (last 7 days, sessions with ≥16 capacity)
    prisma.$queryRaw<{
      market: string;
      avg_fill_pct: number | null;
      avg_fee: number | null;
      currency: string;
    }[]>`
      SELECT
        c.market,
        ROUND(
          AVG(CASE WHEN s.max_players > 0 THEN ds.joined::float / s.max_players * 100 ELSE NULL END)::numeric,
          1
        ) AS avg_fill_pct,
        ROUND(AVG(s.fee_amount)::numeric, 0) AS avg_fee,
        s.fee_currency AS currency
      FROM clubs c
      JOIN sessions s ON s.club_id = c.id
      JOIN LATERAL (
        SELECT joined FROM daily_snapshots
        WHERE session_id = s.id
        ORDER BY scraped_at DESC LIMIT 1
      ) ds ON true
      WHERE s.scraped_date >= (CURRENT_DATE - 7)::text
        AND s.max_players >= 16
        AND s.status <> 'cancelled'
      GROUP BY c.market, s.fee_currency
    `,

    // Daily session + player trend (last 14 days) per market
    prisma.$queryRaw<{
      market: string;
      scraped_date: string;
      session_count: bigint;
      total_joined: bigint;
    }[]>`
      SELECT
        c.market,
        s.scraped_date,
        COUNT(DISTINCT s.id)                                                    AS session_count,
        COALESCE(SUM(CASE WHEN ds.joined IS NOT NULL THEN ds.joined ELSE 0 END), 0) AS total_joined
      FROM clubs c
      JOIN sessions s ON s.club_id = c.id
      LEFT JOIN LATERAL (
        SELECT joined FROM daily_snapshots
        WHERE session_id = s.id
        ORDER BY scraped_at DESC LIMIT 1
      ) ds ON true
      WHERE s.scraped_date >= (CURRENT_DATE - 14)::text
      GROUP BY c.market, s.scraped_date
      ORDER BY c.market, s.scraped_date
    `,

    // DUPR skill distribution per market (active players, last 30 days)
    prisma.$queryRaw<{
      market: string;
      bucket: string;
      player_count: bigint;
    }[]>`
      SELECT
        c.market,
        CASE
          WHEN p.dupr_doubles IS NULL       THEN 'No DUPR'
          WHEN p.dupr_doubles < 2.5         THEN '< 2.5'
          WHEN p.dupr_doubles < 3.0         THEN '2.5–3.0'
          WHEN p.dupr_doubles < 3.5         THEN '3.0–3.5'
          WHEN p.dupr_doubles < 4.0         THEN '3.5–4.0'
          WHEN p.dupr_doubles < 4.5         THEN '4.0–4.5'
          WHEN p.dupr_doubles < 5.0         THEN '4.5–5.0'
          ELSE                                   '5.0+'
        END AS bucket,
        COUNT(DISTINCT p.user_id) AS player_count
      FROM players p
      JOIN session_rosters sr ON sr.user_id   = p.user_id
      JOIN sessions         s  ON s.id         = sr.session_id
      JOIN clubs            c  ON c.id         = s.club_id
      WHERE s.scraped_date >= (CURRENT_DATE - 30)::text
      GROUP BY c.market, bucket
      ORDER BY c.market, bucket
    `,

    // Top 8 clubs per market (last 30 days, by total players booked)
    prisma.$queryRaw<{
      market: string;
      club_name: string;
      session_count: bigint;
      total_players: bigint;
    }[]>`
      SELECT
        c.market,
        c.name AS club_name,
        COUNT(DISTINCT s.id)                                                    AS session_count,
        COALESCE(SUM(CASE WHEN ds.joined IS NOT NULL THEN ds.joined ELSE 0 END), 0) AS total_players
      FROM clubs c
      JOIN sessions s ON s.club_id = c.id
      LEFT JOIN LATERAL (
        SELECT joined FROM daily_snapshots
        WHERE session_id = s.id
        ORDER BY scraped_at DESC LIMIT 1
      ) ds ON true
      WHERE s.scraped_date >= (CURRENT_DATE - 30)::text
      GROUP BY c.market, c.name
      ORDER BY c.market, total_players DESC
    `,
  ]);

  // ── Serialise BigInts + sort/trim top clubs ──────────────────────────────

  const g = globalRow[0] ?? { total_clubs: BigInt(0), total_players: BigInt(0), with_dupr: BigInt(0) };

  const overview: MarketOverview[] = overviewRows.map((r) => ({
    market:           r.market,
    clubs:            Number(r.clubs),
    sessionsToday:    Number(r.sessions_today),
    sessions7d:       Number(r.sessions_7d),
    sessions30d:      Number(r.sessions_30d),
    activePlayers30d: Number(r.active_players_30d),
  }));

  const playerStats: MarketPlayerStats[] = playerRows.map((r) => ({
    market:          r.market,
    totalPlayers:    Number(r.total_players),
    playersWithDupr: Number(r.players_with_dupr),
    avgDupr:         r.avg_dupr != null ? Number(r.avg_dupr) : null,
  }));

  const quality: MarketQuality[] = qualityRows.map((r) => ({
    market:     r.market,
    avgFillPct: r.avg_fill_pct != null ? Number(r.avg_fill_pct) : null,
    avgFee:     r.avg_fee     != null ? Number(r.avg_fee)     : null,
    currency:   r.currency,
  }));

  const trend: DailyTrend[] = trendRows.map((r) => ({
    market:      r.market,
    date:        r.scraped_date,
    sessions:    Number(r.session_count),
    totalJoined: Number(r.total_joined),
  }));

  const duprBuckets: DuprBucket[] = duprRows.map((r) => ({
    market: r.market,
    bucket: r.bucket,
    count:  Number(r.player_count),
  }));

  // Keep top 8 clubs per market
  const clubsByMarket = new Map<string, typeof topClubRows>();
  for (const row of topClubRows) {
    if (!clubsByMarket.has(row.market)) clubsByMarket.set(row.market, []);
    clubsByMarket.get(row.market)!.push(row);
  }
  const topClubs: TopClub[] = [];
  for (const [market, rows] of clubsByMarket.entries()) {
    for (const r of rows.slice(0, 8)) {
      topClubs.push({
        market,
        clubName:     r.club_name,
        sessions:     Number(r.session_count),
        totalPlayers: Number(r.total_players),
      });
    }
  }

  const markets = overview.map((o) => o.market);

  const data: AnalyticsData = {
    fetchedAt:           new Date().toISOString(),
    globalClubs:         Number(g.total_clubs),
    globalPlayers:       Number(g.total_players),
    globalPlayersWithDupr: Number(g.with_dupr),
    markets,
    overview,
    playerStats,
    quality,
    trend,
    duprBuckets,
    topClubs,
  };

  return <AnalyticsDashboard data={data} meta={MARKET_META} />;
}
