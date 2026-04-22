"use client";

import { useState, useEffect, useLayoutEffect, use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearVenueSession, isVenueUnlocked } from "@/lib/dashboard-session";
import { HourlyUtilizationChart } from "@/components/DashboardCharts";
import { FillRateBar } from "@/components/FillRateBar";
import { formatVND } from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";

type VenueData = {
  venue: { id: number; name: string; address: string; latitude: number; longitude: number };
  todaySessions: {
    id: number; name: string; startTime: string; endTime: string;
    durationMin: number; maxPlayers: number; feeAmount: number;
    joined: number; waitlisted: number; club: { name: string; slug: string };
  }[];
  clubBreakdown: { name: string; sessions: number; totalJoined: number; totalCapacity: number }[];
  hourlyUtilization: { hour: number; sessions: number; totalPlayers: number }[];
};

type RivalVenue = {
  id: number; name: string; address: string;
  sessionsToday: number; totalJoined: number; totalCapacity: number;
  fillRate: number; avgFee: number; revenueEstimate: number;
  uniqueClubs: number; activeHours: number;
};

type VenueOption = { id: number; name: string; address: string; _count: { sessions: number } };

type Tab = "dashboard" | "ranking" | "rivals";
const RIVAL_STORAGE_KEY = "pickleball-hub:venue-rivals";

export default function VenueDashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();
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

  const rankingVenues = useMemo(() => {
    if (!data) return [];
    const { venue, todaySessions } = data;
    const totalPlayers = todaySessions.reduce((s, t) => s + t.joined, 0);
    const myEntry: VenueOption & { totalPlayers: number; sessions: number } = {
      id: venueId,
      name: venue.name,
      address: venue.address,
      _count: { sessions: todaySessions.length },
      totalPlayers,
      sessions: todaySessions.length,
    };
    const others = allVenues.map((v) => ({
      ...v,
      totalPlayers: 0,
      sessions: v._count?.sessions ?? 0,
    }));
    return [myEntry, ...others].sort((a, b) => b.sessions - a.sessions);
  }, [data, allVenues, venueId]);

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
        <p className="text-red-500 mb-4">{error || "Dashboard unavailable"}</p>
        <Link href="/dashboard/venue" className="text-primary hover:underline">Back to venue selection</Link>
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
    { key: "sessionsToday", label: "Sessions today", format: (v: number) => v.toString(), higher: true },
    { key: "totalJoined", label: "Players today", format: (v: number) => v.toLocaleString(), higher: true },
    { key: "fillRate", label: "Fill rate", format: (v: number) => `${Math.round(v * 100)}%`, higher: true },
    { key: "avgFee", label: "Avg price", format: (v: number) => formatVND(v), higher: false },
    { key: "uniqueClubs", label: "Clubs hosted", format: (v: number) => v.toString(), higher: true },
    { key: "activeHours", label: "Active hours", format: (v: number) => `${v}h`, higher: true },
    { key: "revenueEstimate", label: "Est. revenue", format: (v: number) => formatVND(v), higher: true },
  ] as const;

  const tabs: { key: Tab; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "ranking", label: "Ranking" },
    { key: "rivals", label: "Rival Comparison" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">{venue.name}</h1>
          <p className="text-sm text-muted truncate">{venue.address}</p>
          <p className="text-xs text-muted mt-1">Venue Dashboard</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 self-start justify-end">
          <Link
            href="/dashboard/venue"
            className="text-xs text-muted hover:text-primary transition px-3 py-2 rounded border border-card-border hover:border-primary/30 min-h-[44px] flex items-center"
          >
            Switch venue
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
            <KPICard label="Total players" value={totalPlayers.toLocaleString()} />
            <KPICard label="Active hours" value={`${activeHours}h / 24h`} />
            <KPICard label="Est. revenue" value={formatVND(totalRevenue)} />
          </div>

          <Section title="Court Utilization (Today)">
            <HourlyUtilizationChart data={hourlyUtilization} />
          </Section>

          {deadHours.length > 0 && (
            <Section title={`Dead Hours (${deadHours.length} gaps)`}>
              <div className="flex flex-wrap gap-2">
                {deadHours.map((h) => (
                  <span key={h} className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm text-red-700 dark:text-red-300">
                    {h}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted mt-3">These hours have no scheduled sessions. Consider reaching out to clubs or offering discounted court time.</p>
            </Section>
          )}

          <Section title={`Clubs Hosted (${clubBreakdown.length})`}>
            {clubBreakdown.length === 0 ? (
              <p className="text-sm text-muted py-4">No club data available.</p>
            ) : (
              <div className="space-y-2">
                {clubBreakdown.sort((a, b) => b.sessions - a.sessions).map((c) => (
                  <div key={c.name} className="rounded-lg border border-card-border p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted">{c.sessions} sessions</p>
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

          <Section title={`All Sessions Today (${todaySessions.length})`}>
            {todaySessions.length === 0 ? (
              <p className="text-sm text-muted py-4">No sessions today.</p>
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

          <Section title="Opportunity Alerts">
            <div className="space-y-3">
              {deadHours.length > 3 && (
                <Alert type="warning" text={`${deadHours.length} empty hours between 6am-10pm. Your venue has significant untapped capacity.`} />
              )}
              {clubBreakdown.length < 3 && (
                <Alert type="info" text="You're hosting fewer than 3 clubs. Attracting more organizers could increase utilization and revenue." />
              )}
              {totalCapacity > 0 && totalPlayers / totalCapacity > 0.85 && (
                <Alert type="success" text="Great utilization! Your venue is running at over 85% capacity during active hours." />
              )}
              {clubBreakdown.some((c) => c.totalCapacity > 0 && c.totalJoined / c.totalCapacity < 0.3) && (
                <Alert type="warning" text="Some clubs are underperforming at your venue (<30% fill). Consider discussing schedule changes." />
              )}
            </div>
          </Section>
        </>
      )}

      {/* Ranking Tab */}
      {activeTab === "ranking" && (
        <Section title="Venue Rankings — By Sessions Today">
          <p className="text-xs text-muted mb-4">All venues ranked by number of sessions. Your venue is highlighted.</p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-card-border text-muted">
                  <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                  <th className="text-left py-2 pr-3 font-medium">Venue</th>
                  <th className="text-center py-2 px-2 font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {rankingVenues.map((v, i) => {
                  const isMe = v.id === venueId;
                  return (
                    <tr key={v.id} className={`border-b border-card-border/50 ${isMe ? "bg-primary/5 font-semibold" : ""}`}>
                      <td className="py-2 pr-2 text-muted">{i + 1}</td>
                      <td className="py-2 pr-3">
                        {v.name}
                        {isMe && <span className="ml-1 text-[10px] text-primary">(You)</span>}
                      </td>
                      <td className="text-center py-2 px-2">{v.sessions}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Rival Comparison Tab */}
      {activeTab === "rivals" && (
        <Section title="Venue Comparison">
          <div className="mb-4">
            <p className="text-xs text-muted mb-2">Select up to 5 venues to compare against yours:</p>
            <input
              type="text"
              placeholder="Search venues..."
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
                {rivalIds.length}/5 selected
                <button onClick={() => { setRivalIds([]); localStorage.removeItem(RIVAL_STORAGE_KEY); }} className="ml-2 text-red-500 hover:underline">Clear all</button>
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
                    <th className="text-left py-2 pr-3 font-medium text-muted">Metric</th>
                    {rivalVenueColumnsSorted.map((v) => (
                      <th key={v.id} className={`text-center py-2 px-2 font-medium ${v.id === venueId ? "text-primary" : "text-foreground"}`}>
                        {v.name.length > 18 ? v.name.slice(0, 16) + "..." : v.name}
                        {v.id === venueId && <span className="block text-[10px] text-primary/70">You</span>}
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
            <p className="text-sm text-muted text-center py-4">Select venues above to see the comparison table.</p>
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

function Alert({ type, text }: { type: "warning" | "success" | "info"; text: string }) {
  const colors = {
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300",
    success: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300",
    info: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300",
  };
  const icons = { warning: "⚠️", success: "✅", info: "💡" };
  return <div className={`rounded-lg border p-3 text-sm ${colors[type]}`}>{icons[type]} {text}</div>;
}
