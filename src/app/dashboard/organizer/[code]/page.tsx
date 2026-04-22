"use client";

import { useState, useEffect, use, useMemo } from "react";
import Link from "next/link";
import { FillRateBar } from "@/components/FillRateBar";
import { FillRateTrendChart, RevenueChart, CompetitorPriceChart } from "@/components/DashboardCharts";
import { formatVND } from "@/lib/utils";

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

type RankingSortKey = "sessionsToday" | "players" | "fillRate" | "avgFee" | "revenueEstimate";

type Tab = "dashboard" | "ranking" | "rivals";
const RIVAL_STORAGE_KEY = "pickleball-hub:org-rivals";

export default function OrganizerDashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const clubId = parseInt(code);
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
  const [rankingSortKey, setRankingSortKey] = useState<RankingSortKey>("players");
  const [rankingSortDir, setRankingSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const saved = localStorage.getItem(RIVAL_STORAGE_KEY);
    if (saved) {
      try { setRivalIds(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    async function load() {
      const dataRes = await fetch(`/api/dashboard/organizer?clubId=${clubId}`);
      if (dataRes.ok) {
        setData(await dataRes.json());
      } else {
        setError("Failed to load dashboard data");
      }
      setLoading(false);
    }
    load();

    fetch("/api/clubs").then((r) => r.json()).then((d) => {
      setAllClubs((d.clubs || []).filter((c: ClubOption) => c.id !== clubId));
    }).catch(() => {});
  }, [clubId]);

  useEffect(() => {
    if (rivalIds.length === 0) { setRivalData([]); return; }
    setRivalLoading(true);
    const ids = [clubId, ...rivalIds].join(",");
    fetch(`/api/dashboard/compare-clubs?ids=${ids}`)
      .then((r) => r.json())
      .then((d) => setRivalData(d.clubs || []))
      .catch(() => setRivalData([]))
      .finally(() => setRivalLoading(false));
  }, [rivalIds, clubId]);

  function toggleRival(id: number) {
    setRivalIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev;
      localStorage.setItem(RIVAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
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

  function handleRankingSort(key: RankingSortKey) {
    if (key === rankingSortKey) {
      setRankingSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRankingSortKey(key);
      setRankingSortDir("desc");
    }
  }

  if (loading) {
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
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">
            {club.numMembers.toLocaleString()} members
          </span>
          <Link
            href="/dashboard/organizer"
            className="text-xs text-muted hover:text-primary transition px-3 py-2 rounded border border-card-border hover:border-primary/30 min-h-[44px] flex items-center"
          >
            Switch club
          </Link>
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
                  <th className="text-center py-2 px-2 font-medium">Members</th>
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
                  displayedRanking.map((c, i) => {
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
