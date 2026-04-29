"use client";

import { useState, useEffect, useLayoutEffect, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearVenueSession, isVenueUnlocked } from "@/lib/dashboard-session";
import { HourlyUtilizationChart } from "@/components/DashboardCharts";
import { FillRateBar } from "@/components/FillRateBar";
import { formatVND } from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";
import { useI18n } from "@/lib/i18n";

type VenueData = {
  venue: { id: number; name: string; address: string; latitude: number; longitude: number };
  todaySessions: {
    id: number; name: string; startTime: string; endTime: string;
    durationMin: number; maxPlayers: number; feeAmount: number;
    joined: number; waitlisted: number; club: { name: string; slug: string };
  }[];
  clubBreakdown: { slug: string; name: string; sessions: number; totalJoined: number; totalCapacity: number }[];
  hourlyUtilization: { hour: number; sessions: number; totalPlayers: number }[];
};

type RivalVenue = {
  id: number; name: string; address: string;
  sessionsToday: number; totalJoined: number; totalCapacity: number;
  fillRate: number; avgFee: number; revenueEstimate: number;
  uniqueClubs: number; activeHours: number;
};

type VenueOption = {
  id: number; name: string; address: string; _count: { sessions: number };
  sessionsToday: number; totalJoined: number; totalCapacity: number;
  fillRate: number; avgFee: number; revenueEstimate: number;
  uniqueClubs: number; activeHours: number;
};

type VenueRankingRow = {
  id: number; name: string; sessionsToday: number; totalPlayers: number;
  totalCapacity: number; fillRate: number; avgFee: number;
  revenueEstimate: number; uniqueClubs: number; activeHours: number;
};

type VenueRankingSortKey = "sessions" | "players" | "fillRate" | "avgFee" | "revenueEstimate" | "clubs" | "activeHours";

type Tab = "dashboard" | "ranking" | "rivals";
const RIVAL_STORAGE_KEY = "pickleball-hub:venue-rivals";

export default function VenueDashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
  const { t } = useI18n();
  const venueId = parseInt(code, 10);
  const [sessionOk, setSessionOk] = useState(false);
  const [data, setData] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const [allVenues, setAllVenues] = useState<VenueOption[]>([]);
  const [rivalIds, setRivalIds] = useState<number[]>([]);
  const [rivalData, setRivalData] = useState<RivalVenue[]>([]);
  const [rivalLoading, setRivalLoading] = useState(false);
  const [rivalSearch, setRivalSearch] = useState("");
  const [venueRankSearch, setVenueRankSearch] = useState("");
  const [venueRankSortKey, setVenueRankSortKey] = useState<VenueRankingSortKey>("revenueEstimate");
  const [venueRankSortDir, setVenueRankSortDir] = useState<"asc" | "desc">("desc");
  const [venueRankVisible, setVenueRankVisible] = useState(100);

  useEffect(() => {
    if (!Number.isFinite(venueId) || venueId <= 0) {
      router.replace("/dashboard/venue");
      return;
    }
    if (!isVenueUnlocked()) {
      router.replace("/dashboard/venue");
      return;
    }
    setSessionOk(true);
  }, [router, venueId]);

  useEffect(() => {
    const saved = localStorage.getItem(RIVAL_STORAGE_KEY);
    if (saved) {
      try { setRivalIds(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useLayoutEffect(() => {
    if (!sessionOk) return;
    let cancelled = false;
    const venueUrl = `/api/dashboard/venue?venueId=${venueId}`;
    const venuesListUrl = "/api/venues";

    const venueHit = readPublicApiCache<VenueData>(venueUrl);
    const venuesHit = readPublicApiCache<{ venues: VenueOption[] }>(venuesListUrl);
    if (venueHit && venuesHit) {
      setData(venueHit);
      setAllVenues((venuesHit.venues || []).filter((v) => v.id !== venueId));
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const [vdata, listPayload] = await Promise.all([
          venueHit ? Promise.resolve(venueHit) : fetchPublicApiJson<VenueData>(venueUrl),
          venuesHit ? Promise.resolve(venuesHit) : fetchPublicApiJson<{ venues: VenueOption[] }>(venuesListUrl),
        ]);
        if (cancelled) return;
        setData(vdata);
        setAllVenues((listPayload.venues || []).filter((v) => v.id !== venueId));
      } catch {
        if (!cancelled) setError("Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [venueId, sessionOk]);

  useEffect(() => {
    if (!sessionOk) return;
    if (rivalIds.length === 0) {
      setRivalData([]);
      setRivalLoading(false);
      return;
    }
    const ids = [venueId, ...rivalIds].join(",");
    const url = `/api/dashboard/compare-venues?ids=${ids}`;
    const hit = readPublicApiCache<{ venues: RivalVenue[] }>(url);
    if (hit) {
      setRivalData(hit.venues || []);
      setRivalLoading(false);
      return;
    }
    let cancelled = false;
    setRivalLoading(true);
    fetchPublicApiJson<{ venues: RivalVenue[] }>(url)
      .then((d) => {
        if (!cancelled) setRivalData(d.venues || []);
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
  }, [rivalIds, venueId, sessionOk]);

  function toggleRival(id: number) {
    setRivalIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev;
      localStorage.setItem(RIVAL_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleLogout() {
    clearVenueSession();
    router.push("/dashboard/venue");
  }

  const filteredRivalVenues = useMemo(() => {
    const q = rivalSearch.trim().toLowerCase();
    const list = !q
      ? allVenues
      : allVenues.filter(
          (v) => v.name.toLowerCase().includes(q) || v.address?.toLowerCase().includes(q),
        );
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [allVenues, rivalSearch]);

  const rivalVenueColumnsSorted = useMemo(
    () => [...rivalData].sort((a, b) => a.name.localeCompare(b.name)),
    [rivalData],
  );

  const rankingVenues = useMemo((): VenueRankingRow[] => {
    if (!data) return [];
    const { venue, todaySessions, clubBreakdown, hourlyUtilization } = data;
    const tp = todaySessions.reduce((s, t) => s + t.joined, 0);
    const tc = todaySessions.reduce((s, t) => s + t.maxPlayers, 0);
    const avgF = todaySessions.length > 0
      ? todaySessions.reduce((s, t) => s + t.feeAmount, 0) / todaySessions.length : 0;
    const rev = todaySessions.reduce((s, t) => s + t.joined * t.feeAmount, 0);
    const ah = hourlyUtilization.filter((h) => h.sessions > 0).length;

    const self: VenueRankingRow = {
      id: venueId, name: venue.name, sessionsToday: todaySessions.length,
      totalPlayers: tp, totalCapacity: tc,
      fillRate: tc > 0 ? tp / tc : 0, avgFee: Math.round(avgF),
      revenueEstimate: rev, uniqueClubs: clubBreakdown.length, activeHours: ah,
    };

    const others: VenueRankingRow[] = allVenues.map((v) => ({
      id: v.id, name: v.name, sessionsToday: v.sessionsToday ?? 0,
      totalPlayers: v.totalJoined ?? 0, totalCapacity: v.totalCapacity ?? 0,
      fillRate: v.fillRate ?? 0, avgFee: v.avgFee ?? 0,
      revenueEstimate: v.revenueEstimate ?? 0,
      uniqueClubs: v.uniqueClubs ?? 0, activeHours: v.activeHours ?? 0,
    }));

    return [self, ...others];
  }, [data, allVenues, venueId]);

  const displayedVenueRanking = useMemo(() => {
    const q = venueRankSearch.trim().toLowerCase();
    let rows = q ? rankingVenues.filter((v) => v.name.toLowerCase().includes(q)) : [...rankingVenues];
    const dir = venueRankSortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (venueRankSortKey) {
        case "sessions": cmp = a.sessionsToday - b.sessionsToday; break;
        case "players": cmp = a.totalPlayers - b.totalPlayers; break;
        case "fillRate": cmp = a.fillRate - b.fillRate; break;
        case "avgFee": cmp = a.avgFee - b.avgFee; break;
        case "revenueEstimate": cmp = a.revenueEstimate - b.revenueEstimate; break;
        case "clubs": cmp = a.uniqueClubs - b.uniqueClubs; break;
        case "activeHours": cmp = a.activeHours - b.activeHours; break;
      }
      if (cmp !== 0) return cmp * dir;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [rankingVenues, venueRankSearch, venueRankSortKey, venueRankSortDir]);

  useEffect(() => {
    setVenueRankVisible(100);
  }, [venueRankSearch, venueRankSortKey, venueRankSortDir]);

  function handleVenueRankSort(key: VenueRankingSortKey) {
    if (key === venueRankSortKey) {
      setVenueRankSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setVenueRankSortKey(key);
      setVenueRankSortDir("desc");
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
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-red-500 mb-4">{error || t("venueDashboardError")}</p>
        <Link href="/dashboard/venue" className="text-primary hover:underline">{t("venueBackToSelection")}</Link>
      </div>
    );
  }

  const { venue, todaySessions, clubBreakdown, hourlyUtilization } = data;
  const totalPlayers = todaySessions.reduce((s, t) => s + t.joined, 0);
  const totalCapacity = todaySessions.reduce((s, t) => s + t.maxPlayers, 0);
  const totalRevenue = todaySessions.reduce((s, t) => s + t.joined * t.feeAmount, 0);
  const activeHours = hourlyUtilization.filter((h) => h.sessions > 0).length;
  const deadHours = hourlyUtilization
    .filter((h) => h.sessions === 0 && h.hour >= 6 && h.hour <= 22)
    .map((h) => `${h.hour.toString().padStart(2, "0")}:00`);

  const venueMetrics = [
    { key: "sessionsToday", label: t("venueRivalsMetricSessionsToday"), format: (v: number) => v.toString(), higher: true },
    { key: "totalJoined", label: t("venueRivalsMetricPlayersToday"), format: (v: number) => v.toLocaleString(), higher: true },
    { key: "fillRate", label: t("venueRivalsMetricFillRate"), format: (v: number) => `${Math.round(v * 100)}%`, higher: true },
    { key: "avgFee", label: t("venueRivalsMetricAvgPrice"), format: (v: number) => formatVND(v), higher: false },
    { key: "uniqueClubs", label: t("venueRivalsMetricClubs"), format: (v: number) => v.toString(), higher: true },
    { key: "activeHours", label: t("venueRivalsMetricActiveHours"), format: (v: number) => `${v}h`, higher: true },
    { key: "revenueEstimate", label: t("venueRivalsMetricRevenue"), format: (v: number) => formatVND(v), higher: true },
  ] as const;

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: t("venueTabDashboard") },
    { key: "ranking", label: t("venueTabRanking") },
    { key: "rivals", label: t("venueTabRivals") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">{venue.name}</h1>
          <p className="text-sm text-muted truncate">{venue.address}</p>
          <p className="text-xs text-muted mt-1">{t("venueDashboardSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 self-start justify-end">
          <Link
            href="/dashboard/venue"
            className="text-xs text-muted hover:text-primary transition px-3 py-2 rounded border border-card-border hover:border-primary/30 min-h-[44px] flex items-center"
          >
            {t("venueSwitchVenue")}
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-muted hover:text-red-600 dark:hover:text-red-400 transition px-3 py-2 rounded border border-card-border hover:border-red-400/40 min-h-[44px] flex items-center"
          >
            {t("venueLogout")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 sm:mb-6 border-b border-card-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 sm:px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px whitespace-nowrap shrink-0 min-h-[44px] ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <KPICard label={t("venueKpiSessionsToday")} value={todaySessions.length.toString()} />
            <KPICard label={t("venueKpiTotalPlayers")} value={totalPlayers.toLocaleString()} />
            <KPICard label={t("venueKpiActiveHours")} value={`${activeHours}h / 24h`} />
            <KPICard label={t("venueKpiRevenue")} value={formatVND(totalRevenue)} />
          </div>

          <Section title={t("venueSectionCourtUtil")}>
            <HourlyUtilizationChart data={hourlyUtilization} />
          </Section>

          {deadHours.length > 0 && (
            <Section title={`Dead Hours (${deadHours.length} ${t("venueSectionDeadHours")})`}>
              <div className="flex flex-wrap gap-2">
                {deadHours.map((h) => (
                  <span key={h} className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm text-red-700 dark:text-red-300">
                    {h}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted mt-3">{t("venueDeadHoursNote")}</p>
            </Section>
          )}

          <Section title={`${t("venueSectionClubsHosted")} (${clubBreakdown.length})`}>
            {clubBreakdown.length === 0 ? (
              <p className="text-sm text-muted py-4">{t("venueNoClubData")}</p>
            ) : (
              <div className="space-y-2">
                {clubBreakdown.sort((a, b) => b.sessions - a.sessions).map((c) => (
                  <div key={c.slug} className="rounded-lg border border-card-border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted">{c.sessions} {t("venueClubSessions")}</p>
                      </div>
                      <div className="text-right text-sm shrink-0">
                        <span className="font-bold">{c.totalJoined}</span>
                        <span className="text-muted">/{c.totalCapacity}</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <FillRateBar joined={c.totalJoined} maxPlayers={c.totalCapacity} showLabel={false} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title={`${t("venueSectionAllSessions")} (${todaySessions.length})`}>
            {todaySessions.length === 0 ? (
              <p className="text-sm text-muted py-4">{t("venueNoSessionsToday")}</p>
            ) : (
              <div className="space-y-2">
                {todaySessions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-card-border p-3">
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[50px] shrink-0">
                        <div className="text-sm font-bold">{s.startTime}</div>
                        <div className="text-xs text-muted">{s.endTime}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{s.name}</p>
                        <p className="text-xs text-muted truncate">{s.club.name}</p>
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

          <Section title={t("venueSectionOpportunity")}>
            <div className="space-y-3">
              {deadHours.length > 3 && (
                <Alert type="warning" text={`${deadHours.length} ${t("venueAlertDeadHours")}`} />
              )}
              {clubBreakdown.length < 3 && (
                <Alert type="info" text={t("venueAlertFewClubs")} />
              )}
              {totalCapacity > 0 && totalPlayers / totalCapacity > 0.85 && (
                <Alert type="success" text={t("venueAlertHighUtil")} />
              )}
              {clubBreakdown.some((c) => c.totalCapacity > 0 && c.totalJoined / c.totalCapacity < 0.3) && (
                <Alert type="warning" text={t("venueAlertLowFill")} />
              )}
            </div>
          </Section>
        </>
      )}

      {/* Ranking Tab */}
      {activeTab === "ranking" && (
        <Section title={t("venueRankingTitle")}>
          <p className="text-xs text-muted mb-3">
            {t("venueRankingDesc")}
          </p>
          <input
            type="text"
            placeholder={t("venueRankingSearch")}
            value={venueRankSearch}
            onChange={(e) => setVenueRankSearch(e.target.value)}
            className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mb-4"
          />
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-card-border text-muted">
                  <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                  <th className="text-left py-2 pr-3 font-medium">{t("venueRankingColVenue")}</th>
                  <VenueRankSortTh label={t("venueRankingColSessions")} sortKey="sessions" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                  <VenueRankSortTh label={t("venueRankingColPlayers")} sortKey="players" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                  <VenueRankSortTh label={t("venueRankingColFillRate")} sortKey="fillRate" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                  <VenueRankSortTh label={t("venueRankingColAvgPrice")} sortKey="avgFee" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                  <VenueRankSortTh label={t("venueRankingColRevenue")} sortKey="revenueEstimate" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                  <VenueRankSortTh label={t("venueRankingColClubs")} sortKey="clubs" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                  <VenueRankSortTh label={t("venueRankingColActiveHrs")} sortKey="activeHours" activeKey={venueRankSortKey} dir={venueRankSortDir} onSort={handleVenueRankSort} />
                </tr>
              </thead>
              <tbody>
                {displayedVenueRanking.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted text-sm">
                      {t("venueRankingNoMatch")}
                    </td>
                  </tr>
                ) : (
                  displayedVenueRanking.slice(0, venueRankVisible).map((v, i) => {
                    const isMe = v.id === venueId;
                    return (
                      <tr key={v.id} className={`border-b border-card-border/50 ${isMe ? "bg-primary/5 font-semibold" : ""}`}>
                        <td className="py-2 pr-2 text-muted">{i + 1}</td>
                        <td className="py-2 pr-3 max-w-[160px] truncate">
                          {v.name}
                          {isMe && <span className="ml-1 text-[10px] text-primary">({t("venueRankingYou")})</span>}
                        </td>
                        <td className="text-center py-2 px-2">{v.sessionsToday}</td>
                        <td className="text-center py-2 px-2 tabular-nums">
                          {v.totalPlayers.toLocaleString()}/{v.totalCapacity.toLocaleString()}
                        </td>
                        <td className="text-center py-2 px-2">{Math.round(v.fillRate * 100)}%</td>
                        <td className="text-center py-2 px-2">{formatVND(v.avgFee)}</td>
                        <td className="text-center py-2 px-2">{formatVND(v.revenueEstimate)}</td>
                        <td className="text-center py-2 px-2">{v.uniqueClubs}</td>
                        <td className="text-center py-2 px-2">{v.activeHours}h</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {venueRankVisible < displayedVenueRanking.length && (
            <button
              type="button"
              onClick={() => setVenueRankVisible((n) => n + 100)}
              className="mt-4 w-full rounded-lg border border-card-border py-2.5 text-sm text-muted hover:text-foreground hover:border-primary/40 transition"
            >
              Show more ({displayedVenueRanking.length - venueRankVisible} {t("venueRankingShowMore")})
            </button>
          )}
        </Section>
      )}

      {/* Rival Comparison Tab */}
      {activeTab === "rivals" && (
        <Section title={t("venueRivalsTitle")}>
          <div className="mb-4">
            <p className="text-xs text-muted mb-2">{t("venueRivalsDesc")}</p>
            <input
              type="text"
              placeholder={t("venueRivalsSearch")}
              value={rivalSearch}
              onChange={(e) => setRivalSearch(e.target.value)}
              className="w-full rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary mb-3"
            />
            <div className="flex flex-wrap gap-2 max-h-[240px] overflow-y-auto">
              {filteredRivalVenues.map((v) => (
                <button
                  key={v.id}
                  onClick={() => toggleRival(v.id)}
                  className={`text-xs px-3 py-2 rounded-full border transition min-h-[40px] ${
                    rivalIds.includes(v.id)
                      ? "bg-primary text-white border-primary"
                      : "bg-background border-card-border hover:border-primary/50"
                  } ${!rivalIds.includes(v.id) && rivalIds.length >= 5 ? "opacity-40 cursor-not-allowed" : ""}`}
                  disabled={!rivalIds.includes(v.id) && rivalIds.length >= 5}
                >
                  {v.name}
                </button>
              ))}
            </div>
            {rivalIds.length > 0 && (
              <div className="mt-2 text-xs text-muted">
                {rivalIds.length}/5 {t("venueRivalsSelected")}
                <button onClick={() => { setRivalIds([]); localStorage.removeItem(RIVAL_STORAGE_KEY); }} className="ml-2 text-red-500 hover:underline">{t("venueRivalsClearAll")}</button>
              </div>
            )}
          </div>

          {rivalLoading ? (
            <div className="animate-pulse h-32 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ) : rivalVenueColumnsSorted.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-card-border">
                    <th className="text-left py-2 pr-3 font-medium text-muted">{t("venueRivalsColMetric")}</th>
                    {rivalVenueColumnsSorted.map((v) => (
                      <th key={v.id} className={`text-center py-2 px-2 font-medium ${v.id === venueId ? "text-primary" : "text-foreground"}`}>
                        {v.name.length > 18 ? v.name.slice(0, 16) + "..." : v.name}
                        {v.id === venueId && <span className="block text-[10px] text-primary/70">{t("venueRankingYou")}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {venueMetrics.map((m) => {
                    const values = rivalVenueColumnsSorted.map((v) => v[m.key] as number);
                    const best = m.higher ? Math.max(...values) : Math.min(...values);
                    return (
                      <tr key={m.key} className="border-b border-card-border/50">
                        <td className="py-2 pr-3 text-muted font-medium">{m.label}</td>
                        {rivalVenueColumnsSorted.map((v) => {
                          const val = v[m.key] as number;
                          const isBest = val === best && values.filter((x) => x === best).length === 1;
                          const isMe = v.id === venueId;
                          return (
                            <td key={v.id} className={`text-center py-2 px-2 font-semibold ${
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
            <p className="text-sm text-muted text-center py-4">{t("venueRivalsNoRivals")}</p>
          )}
        </Section>
      )}
    </div>
  );
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-4 text-center">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
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

function VenueRankSortTh({
  label, sortKey, activeKey, dir, onSort,
}: {
  label: string; sortKey: VenueRankingSortKey; activeKey: VenueRankingSortKey;
  dir: "asc" | "desc"; onSort: (k: VenueRankingSortKey) => void;
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

function Alert({ type, text }: { type: "warning" | "success" | "info"; text: string }) {
  const colors = {
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300",
  };
  const icons = { warning: "⚠️", success: "✅", info: "💡" };
  return <div className={`rounded-lg border p-3 text-sm ${colors[type]}`}>{icons[type]} {text}</div>;
}
