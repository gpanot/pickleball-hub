"use client";

import { useState, useEffect, useLayoutEffect, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearOrganizerSession, isOrganizerUnlocked } from "@/lib/dashboard-session";
import { FillRateBar } from "@/components/FillRateBar";
import { FillRateTrendChart, RevenueChart, CompetitorPriceChart, WeeklyDistributionChart, HourlyStatsDistributionChart, DAY_LABELS } from "@/components/DashboardCharts";
import { formatVND } from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";

type DashboardData = {
  club: { id: number; name: string; slug: string; numMembers: number };
  todaySessions: {
    id: number; name: string; startTime: string; endTime: string;
    durationMin: number; maxPlayers: number; feeAmount: number;
    joined: number; waitlisted: number; venue: { name: string } | null;
  }[];
  dailyStats: {
    date: string; totalSessions: number; totalCapacity: number; totalJoined: number;
    avgFillRate: number; avgFee: number; revenueEstimate: number;
  }[];
  competitors: Record<string, {
    id: number; name: string; startTime: string; feeAmount: number;
    maxPlayers: number; club: { name: string }; snapshots: { joined: number }[];
  }[]>;
  totalCompetitors: number;
};

type RivalClub = {
  id: number; name: string; slug: string; numMembers: number;
  sessionsToday: number; totalSessionsWeek: number;
  totalJoined: number; totalCapacity: number;
  fillRate: number; avgFillRateWeek: number;
  avgFee: number; revenueEstimate: number;
};

type ClubOption = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
  avgFillRate: number;
  avgFee: number;
  avgFeeToday?: number;
  totalSessionsWeek: number;
  sessionsToday?: number;
  totalJoined: number;
  totalCapacity: number;
  revenueEstimate?: number;
};

type RankingClubRow = {
  id: number;
  name: string;
  numMembers: number;
  sessionsToday: number;
  totalJoined: number;
  totalCapacity: number;
  fillRateToday: number;
  avgFeeDisplay: number;
  revenueEstimate: number;
};

type RankingSortKey = "members" | "sessionsToday" | "players" | "fillRate" | "avgFee" | "revenueEstimate";

type StatSession = {
  scrapedDate: string;
  startTime: string;
  maxPlayers: number;
  feeAmount: number;
  joined: number;
};

type Tab = "dashboard" | "ranking" | "rivals" | "stats";
const RIVAL_STORAGE_KEY = "pickleball-hub:org-rivals";

export default function OrganizerDashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const clubId = parseInt(code, 10);
  const [sessionOk, setSessionOk] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const [allClubs, setAllClubs] = useState<ClubOption[]>([]);
  const [rivalIds, setRivalIds] = useState<number[]>([]);
  const [rivalData, setRivalData] = useState<RivalClub[]>([]);
  const [rivalLoading, setRivalLoading] = useState(false);
  const [rivalSearch, setRivalSearch] = useState("");
  const [rankingSearch, setRankingSearch] = useState("");
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>("revenueEstimate");
  const [rankingSortDir, setRankingSortDir] = useState<"asc" | "desc">("desc");
  const [rankingVisible, setRankingVisible] = useState(100);

  const [statsSessions, setStatsSessions] = useState<StatSession[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsFetched, setStatsFetched] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(clubId) || clubId <= 0) {
      router.replace("/dashboard/organizer");
      return;
    }
    if (!isOrganizerUnlocked()) {
      router.replace("/dashboard/organizer");
      return;
    }
    setSessionOk(true);
  }, [router, clubId]);

  useEffect(() => {
    const saved = localStorage.getItem(RIVAL_STORAGE_KEY);
    if (saved) {
      try { setRivalIds(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useLayoutEffect(() => {
    if (!sessionOk) return;
    let cancelled = false;
    const orgUrl = `/api/dashboard/organizer?clubId=${clubId}`;
    const clubsUrl = "/api/clubs";

    const orgHit = readPublicApiCache<DashboardData>(orgUrl);
    const clubsHit = readPublicApiCache<{ clubs: ClubOption[] }>(clubsUrl);
    if (orgHit && clubsHit) {
      setData(orgHit);
      setAllClubs((clubsHit.clubs || []).filter((c) => c.id !== clubId));
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const [org, clubsPayload] = await Promise.all([
          orgHit ? Promise.resolve(orgHit) : fetchPublicApiJson<DashboardData>(orgUrl),
          clubsHit ? Promise.resolve(clubsHit) : fetchPublicApiJson<{ clubs: ClubOption[] }>(clubsUrl),
        ]);
        if (cancelled) return;
        setData(org);
        setAllClubs((clubsPayload.clubs || []).filter((c) => c.id !== clubId));
      } catch {
        if (!cancelled) setError("Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clubId, sessionOk]);

  useEffect(() => {
    if (!sessionOk) return;
    if (rivalIds.length === 0) {
      setRivalData([]);
      setRivalLoading(false);
      return;
    }
    const ids = [clubId, ...rivalIds].join(",");
    const url = `/api/dashboard/compare-clubs?ids=${ids}`;
    const hit = readPublicApiCache<{ clubs: RivalClub[] }>(url);
    if (hit) {
      setRivalData(hit.clubs || []);
      setRivalLoading(false);
      return;
    }
    let cancelled = false;
    setRivalLoading(true);
    fetchPublicApiJson<{ clubs: RivalClub[] }>(url)
      .then((d) => {
        if (!cancelled) setRivalData(d.clubs || []);
      })
      .catch(() => {
        if (!cancelled) setRivalData([]);
      })
      .finally(() => {
        if (!cancelled) setRivalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rivalIds, clubId, sessionOk]);

  useEffect(() => {
    if (activeTab !== "stats" || statsFetched || !sessionOk) return;
    let cancelled = false;
    setStatsLoading(true);
    const url = `/api/dashboard/organizer/stats?clubId=${clubId}`;
    const hit = readPublicApiCache<{ sessions: StatSession[] }>(url);
    if (hit) {
      setStatsSessions(hit.sessions || []);
      setStatsFetched(true);
      setStatsLoading(false);
      return;
    }
    fetchPublicApiJson<{ sessions: StatSession[] }>(url)
      .then((d) => { if (!cancelled) { setStatsSessions(d.sessions || []); setStatsFetched(true); } })
      .catch(() => { if (!cancelled) setStatsSessions([]); })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, statsFetched, sessionOk, clubId]);

  const weeklyDistribution = useMemo(() => {
    if (statsSessions.length === 0) return [];
    const buckets = Array.from({ length: 7 }, (_, i) => ({
      day: i, label: DAY_LABELS[i], sessions: 0, booked: 0, capacity: 0, totalFee: 0, dates: 0,
    }));
    const datesByDay = Array.from({ length: 7 }, () => new Set<string>());
    for (const s of statsSessions) {
      const d = new Date(s.scrapedDate + "T00:00:00");
      const dow = (d.getDay() + 6) % 7;
      buckets[dow].sessions++;
      buckets[dow].booked += s.joined;
      buckets[dow].capacity += s.maxPlayers;
      buckets[dow].totalFee += s.feeAmount;
      datesByDay[dow].add(s.scrapedDate);
    }
    for (let i = 0; i < 7; i++) {
      buckets[i].dates = datesByDay[i].size;
    }
    return buckets;
  }, [statsSessions]);

  const hourlyDistribution = useMemo(() => {
    const filtered = selectedDay !== null
      ? statsSessions.filter((s) => {
          const d = new Date(s.scrapedDate + "T00:00:00");
          return (d.getDay() + 6) % 7 === selectedDay;
        })
      : statsSessions;
    const buckets: Record<number, { sessions: number; booked: number; capacity: number }> = {};
    for (let h = 5; h <= 23; h++) buckets[h] = { sessions: 0, booked: 0, capacity: 0 };
    for (const s of filtered) {
      const h = parseInt(s.startTime.split(":")[0]);
      if (!buckets[h]) buckets[h] = { sessions: 0, booked: 0, capacity: 0 };
      buckets[h].sessions++;
      buckets[h].booked += s.joined;
      buckets[h].capacity += s.maxPlayers;
    }
    return Object.entries(buckets)
      .map(([h, v]) => ({ hour: `${h.padStart(2, "0")}:00`, ...v }))
      .sort((a, b) => a.hour.localeCompare(b.hour));
  }, [statsSessions, selectedDay]);

  const statsSummary = useMemo(() => {
    if (statsSessions.length === 0) return null;
    const totalSessions = statsSessions.length;
    const totalBooked = statsSessions.reduce((s, x) => s + x.joined, 0);
    const totalCapacity = statsSessions.reduce((s, x) => s + x.maxPlayers, 0);
    const avgFillRate = totalCapacity > 0 ? totalBooked / totalCapacity : 0;
    const uniqueDates = new Set(statsSessions.map((s) => s.scrapedDate)).size;

    let peakDayIdx = 0;
    let peakDayBooked = 0;
    for (const b of weeklyDistribution) {
      if (b.booked > peakDayBooked) { peakDayBooked = b.booked; peakDayIdx = b.day; }
    }

    let peakHour = "—";
    let peakHourBooked = 0;
    for (const h of hourlyDistribution) {
      if (h.booked > peakHourBooked) { peakHourBooked = h.booked; peakHour = h.hour; }
    }

    return { totalSessions, totalBooked, totalCapacity, avgFillRate, uniqueDates, peakDay: DAY_LABELS[peakDayIdx], peakHour };
  }, [statsSessions, weeklyDistribution, hourlyDistribution]);

  function toggleRival(id: number) {
    setRivalIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev;
      localStorage.setItem(RIVAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleLogout() {
    clearOrganizerSession();
    router.push("/dashboard/organizer");
  }

  const filteredRivalClubs = useMemo(() => {
    const q = rivalSearch.trim().toLowerCase();
    const list = !q ? allClubs : allClubs.filter((c) => c.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [allClubs, rivalSearch]);

  const rankingClubs = useMemo((): RankingClubRow[] => {
    if (!data) return [];
    const club = data.club;
    const todaySessions = data.todaySessions;
    const todayJoined = todaySessions.reduce((s, t) => s + t.joined, 0);
    const todayCapacity = todaySessions.reduce((s, t) => s + t.maxPlayers, 0);
    const todayFillRate = todayCapacity > 0 ? todayJoined / todayCapacity : 0;
    const myAvgPrice =
      todaySessions.length > 0
        ? todaySessions.reduce((s, t) => s + t.feeAmount, 0) / todaySessions.length
        : 0;
    const todayRevenue = todaySessions.reduce((s, t) => s + t.joined * t.feeAmount, 0);

    const fromApi = allClubs.map((c) => {
      const cap = c.totalCapacity ?? 0;
      const joined = c.totalJoined ?? 0;
      return {
        id: c.id,
        name: c.name,
        numMembers: c.numMembers,
        sessionsToday: c.sessionsToday ?? 0,
        totalJoined: joined,
        totalCapacity: cap,
        fillRateToday: cap > 0 ? joined / cap : 0,
        avgFeeDisplay: c.avgFeeToday ?? c.avgFee ?? 0,
        revenueEstimate: c.revenueEstimate ?? 0,
      };
    });

    const self: RankingClubRow = {
      id: clubId,
      name: club.name,
      numMembers: club.numMembers,
      sessionsToday: todaySessions.length,
      totalJoined: todayJoined,
      totalCapacity: todayCapacity,
      fillRateToday: todayFillRate,
      avgFeeDisplay: Math.round(myAvgPrice),
      revenueEstimate: todayRevenue,
    };

    return [...fromApi, self];
  }, [data, allClubs, clubId]);

  const displayedRanking = useMemo(() => {
    const q = rankingSearch.trim().toLowerCase();
    let rows = q ? rankingClubs.filter((c) => c.name.toLowerCase().includes(q)) : [...rankingClubs];
    const dir = rankingSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (rankingSortKey) {
        case "members":
          cmp = a.numMembers - b.numMembers;
          break;
        case "sessionsToday":
          cmp = a.sessionsToday - b.sessionsToday;
          break;
        case "players":
          cmp = a.totalJoined - b.totalJoined;
          break;
        case "fillRate":
          cmp = a.fillRateToday - b.fillRateToday;
          break;
        case "avgFee":
          cmp = a.avgFeeDisplay - b.avgFeeDisplay;
          break;
        case "revenueEstimate":
          cmp = a.revenueEstimate - b.revenueEstimate;
          break;
        default:
          cmp = 0;
      }
      if (cmp !== 0) return cmp * dir;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [rankingClubs, rankingSearch, rankingSortKey, rankingSortDir]);

  const rivalColumnsSorted = useMemo(
    () => [...rivalData].sort((a, b) => a.name.localeCompare(b.name)),
    [rivalData],
  );

  useEffect(() => {
    setRankingVisible(100);
  }, [rankingSearch, rankingSortKey, rankingSortDir]);

  function handleRankingSort(key: RankingSortKey) {
    if (key === rankingSortKey) {
      setRankingSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRankingSortKey(key);
      setRankingSortDir("desc");
    }
  }

  if (!sessionOk || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-red-500 mb-4">{error || "Dashboard unavailable"}</p>
        <Link href="/dashboard/organizer" className="text-primary hover:underline">Back to club selection</Link>
      </div>
    );
  }

  const { club, todaySessions, dailyStats } = data;
  const todayJoined = todaySessions.reduce((s, t) => s + t.joined, 0);
  const todayCapacity = todaySessions.reduce((s, t) => s + t.maxPlayers, 0);
  const todayRevenue = todaySessions.reduce((s, t) => s + t.joined * t.feeAmount, 0);
  const todayFillRate = todayCapacity > 0 ? todayJoined / todayCapacity : 0;

  const competitorSlots = Object.entries(data.competitors).map(([slot, sessions]) => {
    const avgPrice = sessions.length > 0 ? sessions.reduce((s, c) => s + c.feeAmount, 0) / sessions.length : 0;
    return { slot, avgPrice, count: sessions.length };
  });

  const myAvgPrice = todaySessions.length > 0
    ? todaySessions.reduce((s, t) => s + t.feeAmount, 0) / todaySessions.length : 0;

  const lowFillSessions = todaySessions.filter((s) => s.maxPlayers > 0 && (s.joined / s.maxPlayers) < 0.5);

  const metrics = [
    { key: "sessionsToday", label: "Sessions today", format: (v: number) => v.toString(), higher: true },
    { key: "totalJoined", label: "Players today", format: (v: number) => v.toLocaleString(), higher: true },
    { key: "fillRate", label: "Fill rate", format: (v: number) => `${Math.round(v * 100)}%`, higher: true },
    { key: "avgFee", label: "Avg price", format: (v: number) => formatVND(v), higher: false },
    { key: "numMembers", label: "Members", format: (v: number) => v.toLocaleString(), higher: true },
    { key: "totalSessionsWeek", label: "Sessions/week", format: (v: number) => v.toString(), higher: true },
    { key: "revenueEstimate", label: "Est. revenue", format: (v: number) => formatVND(v), higher: true },
  ] as const;

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "stats", label: "Stats" },
    { key: "ranking", label: "Ranking" },
    { key: "rivals", label: "Rival Comparison" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">{club.name}</h1>
          <p className="text-sm text-muted">Organizer Dashboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 justify-end">
          <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
            {club.numMembers.toLocaleString()} members
          </span>
          <Link
            href="/dashboard/organizer"
            className="text-xs text-muted hover:text-primary transition px-3 py-2 rounded border border-card-border hover:border-primary/30 min-h-[44px] flex items-center"
          >
            Switch club
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-muted hover:text-red-600 dark:hover:text-red-400 transition px-3 py-2 rounded border border-card-border hover:border-red-400/40 min-h-[44px] flex items-center"
          >
            Log out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 sm:mb-6 border-b border-card-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px whitespace-nowrap shrink-0 min-h-[44px] ${
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground hover:border-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <KPICard label="Sessions today" value={todaySessions.length.toString()} />
            <KPICard label="Players today" value={todayJoined.toLocaleString()} />
            <KPICard label="Fill rate" value={`${Math.round(todayFillRate * 100)}%`} accent={todayFillRate > 0.7} />
            <KPICard label="Est. revenue today" value={formatVND(todayRevenue)} />
          </div>

          <Section title="Today's Sessions">
            {todaySessions.length === 0 ? (
              <p className="text-sm text-muted py-4">No sessions today.</p>
            ) : (
              <div className="space-y-2">
                {todaySessions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-card-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[50px] shrink-0">
                        <div className="text-sm font-bold">{s.startTime}</div>
                        <div className="text-xs text-muted">{s.durationMin}m</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{s.name}</p>
                        {s.venue && <p className="text-xs text-muted truncate">{s.venue.name}</p>}
                      </div>
                      <div className="text-right text-sm font-bold shrink-0">{formatVND(s.feeAmount)}</div>
                    </div>
                    <div className="mt-2">
                      <FillRateBar joined={s.joined} maxPlayers={s.maxPlayers} waitlisted={s.waitlisted} showLabel={false} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {dailyStats.length > 0 && (
            <Section title="Fill Rate Trend (30 days)">
              <FillRateTrendChart data={dailyStats} />
            </Section>
          )}

          {dailyStats.length > 0 && (
            <Section title="Revenue Trend (30 days)">
              <RevenueChart data={dailyStats} />
            </Section>
          )}

          <Section title={`Competitive Analysis (${data.totalCompetitors} competitor sessions today)`}>
            {competitorSlots.length > 0 ? (
              <CompetitorPriceChart myAvgPrice={myAvgPrice} competitorPrices={competitorSlots} />
            ) : (
              <p className="text-sm text-muted py-4">No competitor data available yet.</p>
            )}
          </Section>

          <Section title="Recommendations">
            <div className="space-y-3">
              {lowFillSessions.length > 0 && (
                <Recommendation type="warning"
                  text={`${lowFillSessions.length} session${lowFillSessions.length > 1 ? "s" : ""} below 50% fill rate. Consider adjusting time or price: ${lowFillSessions.map((s) => `${s.startTime} (${s.joined}/${s.maxPlayers})`).join(", ")}.`}
                />
              )}
              {todayFillRate > 0.9 && (
                <Recommendation type="success" text="Your sessions are nearly full! Consider adding more capacity or extra sessions." />
              )}
              {competitorSlots.some((c) => c.count === 0) && (
                <Recommendation type="info" text="Some time slots have no competition. Consider expanding your schedule." />
              )}
              {myAvgPrice > 0 && competitorSlots.length > 0 && (
                <Recommendation type="info"
                  text={`Your average price is ${formatVND(Math.round(myAvgPrice))} vs market average of ${formatVND(Math.round(competitorSlots.reduce((s, c) => s + c.avgPrice, 0) / competitorSlots.length))}.`}
                />
              )}
            </div>
          </Section>
        </>
      )}

      {/* Stats Tab */}
      {activeTab === "stats" && (
        <>
          {statsLoading ? (
            <div className="space-y-4">
              <div className="animate-pulse h-20 bg-gray-100 dark:bg-gray-800 rounded-xl" />
              <div className="animate-pulse h-64 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            </div>
          ) : statsSessions.length === 0 ? (
            <Section title="Stats">
              <p className="text-sm text-muted py-4">No session data available yet.</p>
            </Section>
          ) : (
            <>
              {statsSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
                  <KPICard label="Total sessions" value={statsSummary.totalSessions.toLocaleString()} />
                  <KPICard label="Total players" value={statsSummary.totalBooked.toLocaleString()} />
                  <KPICard label="Avg fill rate" value={`${Math.round(statsSummary.avgFillRate * 100)}%`} accent={statsSummary.avgFillRate > 0.7} />
                  <KPICard label="Peak day" value={statsSummary.peakDay} />
                  <KPICard label="Peak hour" value={statsSummary.peakHour} />
                </div>
              )}

              <Section title="Weekly Distribution — Which days are busiest?">
                <p className="text-xs text-muted mb-3">
                  Sessions, players booked (demand), and total capacity (supply) by day of the week across all historical data.
                </p>
                <WeeklyDistributionChart data={weeklyDistribution} />
                <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                  {weeklyDistribution.map((b) => {
                    const fillRate = b.capacity > 0 ? b.booked / b.capacity : 0;
                    return (
                      <div key={b.day} className="text-xs">
                        <div className="font-medium">{b.label}</div>
                        <div className={`text-[11px] ${fillRate > 0.8 ? "text-red-500" : fillRate > 0.6 ? "text-amber-500" : "text-emerald-500"}`}>
                          {Math.round(fillRate * 100)}% fill
                        </div>
                        <div className="text-[10px] text-muted">{b.dates} days</div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section title="Hourly Distribution — When during the day?">
                <p className="text-xs text-muted mb-3">
                  Filter by day of the week to see hourly demand vs supply patterns.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <button
                    onClick={() => setSelectedDay(null)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition min-h-[36px] ${
                      selectedDay === null
                        ? "bg-primary text-white border-primary"
                        : "bg-background border-card-border hover:border-primary/50"
                    }`}
                  >
                    All days
                  </button>
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedDay(i)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition min-h-[36px] ${
                        selectedDay === i
                          ? "bg-primary text-white border-primary"
                          : "bg-background border-card-border hover:border-primary/50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <HourlyStatsDistributionChart data={hourlyDistribution} />
              </Section>

              <Section title="Fill Rate by Day of Week">
                <div className="space-y-2">
                  {weeklyDistribution.map((b) => {
                    const fillRate = b.capacity > 0 ? b.booked / b.capacity : 0;
                    const avgSessions = b.dates > 0 ? Math.round(b.sessions / b.dates * 10) / 10 : 0;
                    const avgPlayers = b.dates > 0 ? Math.round(b.booked / b.dates) : 0;
                    return (
                      <div key={b.day} className="flex items-center gap-3 py-1.5">
                        <span className="w-8 text-xs font-medium text-muted">{b.label}</span>
                        <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden relative">
                          <div
                            className={`h-full rounded-full transition-all ${
                              fillRate > 0.8 ? "bg-red-400" : fillRate > 0.6 ? "bg-amber-400" : "bg-emerald-400"
                            }`}
                            style={{ width: `${Math.min(fillRate * 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs font-semibold">{Math.round(fillRate * 100)}%</span>
                        <span className="hidden sm:block w-28 text-right text-[11px] text-muted">
                          ~{avgSessions} sessions, ~{avgPlayers} players/day
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Section>
            </>
          )}
        </>
      )}

      {/* Ranking Tab */}
      {activeTab === "ranking" && (
        <Section title="Club Rankings — Today">
          <p className="text-xs text-muted mb-3">
            Metrics are for today. Search and tap column headers to sort. Your club is highlighted.
          </p>
          <input
            type="text"
            placeholder="Search clubs…"
            value={rankingSearch}
            onChange={(e) => setRankingSearch(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mb-4"
          />
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-card-border text-muted">
                  <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                  <th className="text-left py-2 pr-3 font-medium">Club</th>
                  <RankingSortTh
                    label="Members"
                    sortKey="members"
                    activeKey={rankingSortKey}
                    dir={rankingSortDir}
                    onSort={handleRankingSort}
                  />
                  <RankingSortTh
                    label="Sessions"
                    sortKey="sessionsToday"
                    activeKey={rankingSortKey}
                    dir={rankingSortDir}
                    onSort={handleRankingSort}
                  />
                  <RankingSortTh
                    label="Players"
                    sortKey="players"
                    activeKey={rankingSortKey}
                    dir={rankingSortDir}
                    onSort={handleRankingSort}
                  />
                  <RankingSortTh
                    label="Fill Rate"
                    sortKey="fillRate"
                    activeKey={rankingSortKey}
                    dir={rankingSortDir}
                    onSort={handleRankingSort}
                  />
                  <RankingSortTh
                    label="Avg Price"
                    sortKey="avgFee"
                    activeKey={rankingSortKey}
                    dir={rankingSortDir}
                    onSort={handleRankingSort}
                  />
                  <RankingSortTh
                    label="Est. revenue"
                    sortKey="revenueEstimate"
                    activeKey={rankingSortKey}
                    dir={rankingSortDir}
                    onSort={handleRankingSort}
                  />
                </tr>
              </thead>
              <tbody>
                {displayedRanking.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted text-sm">
                      No clubs match your search.
                    </td>
                  </tr>
                ) : (
                  displayedRanking.slice(0, rankingVisible).map((c, i) => {
                    const isMe = c.id === clubId;
                    return (
                      <tr key={c.id} className={`border-b border-card-border/50 ${isMe ? "bg-primary/5 font-semibold" : ""}`}>
                        <td className="py-2 pr-2 text-muted">{i + 1}</td>
                        <td className="py-2 pr-3">
                          {c.name}
                          {isMe && <span className="ml-1 text-[10px] text-primary">(You)</span>}
                        </td>
                        <td className="text-center py-2 px-2">{c.numMembers.toLocaleString()}</td>
                        <td className="text-center py-2 px-2">{c.sessionsToday}</td>
                        <td className="text-center py-2 px-2 tabular-nums">
                          {c.totalJoined.toLocaleString()}/{c.totalCapacity.toLocaleString()}
                        </td>
                        <td className="text-center py-2 px-2">{Math.round(c.fillRateToday * 100)}%</td>
                        <td className="text-center py-2 px-2">{formatVND(Math.round(c.avgFeeDisplay))}</td>
                        <td className="text-center py-2 px-2">{formatVND(Math.round(c.revenueEstimate))}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {rankingVisible < displayedRanking.length && (
            <button
              type="button"
              onClick={() => setRankingVisible((v) => v + 100)}
              className="mt-4 w-full rounded-lg border border-card-border py-2.5 text-sm text-muted hover:text-foreground hover:border-primary/40 transition"
            >
              Show more ({displayedRanking.length - rankingVisible} remaining)
            </button>
          )}
        </Section>
      )}

      {/* Rival Comparison Tab */}
      {activeTab === "rivals" && (
        <Section title="Rival Comparison">
          <div className="mb-4">
            <p className="text-xs text-muted mb-2">Select up to 5 clubs to compare against yours:</p>
            <input
              type="text"
              placeholder="Search clubs..."
              value={rivalSearch}
              onChange={(e) => setRivalSearch(e.target.value)}
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mb-3"
            />
            <div className="flex flex-wrap gap-2 max-h-[240px] overflow-y-auto">
              {filteredRivalClubs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleRival(c.id)}
                  className={`text-xs px-3 py-2 rounded-full border transition min-h-[40px] ${
                    rivalIds.includes(c.id)
                      ? "bg-primary text-white border-primary"
                      : "bg-background border-card-border hover:border-primary/50"
                  } ${!rivalIds.includes(c.id) && rivalIds.length >= 5 ? "opacity-40 cursor-not-allowed" : ""}`}
                  disabled={!rivalIds.includes(c.id) && rivalIds.length >= 5}
                >
                  {c.name}
                </button>
              ))}
            </div>
            {rivalIds.length > 0 && (
              <div className="mt-2 text-xs text-muted">
                {rivalIds.length}/5 selected
                <button onClick={() => { setRivalIds([]); localStorage.removeItem(RIVAL_STORAGE_KEY); }} className="ml-2 text-red-500 hover:underline">Clear all</button>
              </div>
            )}
          </div>

          {rivalLoading ? (
            <div className="animate-pulse h-32 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ) : rivalColumnsSorted.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="text-left py-2 pr-3 font-medium text-muted">Metric</th>
                    {rivalColumnsSorted.map((c) => (
                      <th key={c.id} className={`text-center py-2 px-2 font-medium ${c.id === clubId ? "text-primary" : "text-foreground"}`}>
                        {c.name.length > 18 ? c.name.slice(0, 16) + "..." : c.name}
                        {c.id === clubId && <span className="block text-[10px] text-primary/70">You</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => {
                    const values = rivalColumnsSorted.map((c) => c[m.key] as number);
                    const best = m.higher ? Math.max(...values) : Math.min(...values);
                    return (
                      <tr key={m.key} className="border-b border-card-border/50">
                        <td className="py-2 pr-3 text-muted font-medium">{m.label}</td>
                        {rivalColumnsSorted.map((c) => {
                          const val = c[m.key] as number;
                          const isBest = val === best && values.filter((v) => v === best).length === 1;
                          const isMe = c.id === clubId;
                          return (
                            <td key={c.id} className={`text-center py-2 px-2 font-semibold ${
                              isBest ? "text-green-600 dark:text-green-400" : ""
                            } ${isMe ? "bg-primary/5" : ""}`}>
                              {m.format(val)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-4">Select rivals above to see the comparison table.</p>
          )}
        </Section>
      )}
    </div>
  );
}

function RankingSortTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: RankingSortKey;
  activeKey: RankingSortKey;
  dir: "asc" | "desc";
  onSort: (k: RankingSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className="text-center py-2 px-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 hover:text-foreground transition ${active ? "text-primary" : "text-muted"}`}
      >
        <span>{label}</span>
        {active && <span className="text-[10px] leading-none">{dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function KPICard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 text-center">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="rounded-xl border border-card-border bg-card p-4">{children}</div>
    </div>
  );
}

function Recommendation({ type, text }: { type: "warning" | "success" | "info"; text: string }) {
  const colors = {
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300",
  };
  const icons = { warning: "⚠️", success: "✅", info: "💡" };
  return <div className={`rounded-lg border p-3 text-sm ${colors[type]}`}>{icons[type]} {text}</div>;
}
