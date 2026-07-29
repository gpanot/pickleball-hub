"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import type { AnalyticsData, MARKET_META } from "./page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: number, decimals = 0) {
  return v.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

function fmtDate(d: string) {
  const dt = new Date(d + "T12:00:00Z");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtFee(fee: number | null, currency: string) {
  if (fee == null) return "—";
  if (currency === "VND") return `${n(fee / 1000)}k ₫`;
  if (currency === "MYR") return `RM ${fee.toFixed(0)}`;
  if (currency === "PHP") return `₱ ${fee.toFixed(0)}`;
  return `${fee.toFixed(0)} ${currency}`;
}

// ─── InfoTip tooltip ──────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-1.5 cursor-help">
      <span className="text-[10px] text-gray-600 hover:text-gray-400 border border-gray-700 hover:border-gray-500 rounded-full w-[14px] h-[14px] inline-flex items-center justify-center transition-colors leading-none select-none">
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-[11px] text-gray-300 text-center opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-xl whitespace-normal">
        {text}
      </span>
    </span>
  );
}

const COUNTRY_COLORS: Record<string, string> = {
  Vietnam:     "#10b981", // emerald
  Malaysia:    "#3b82f6", // blue
  Philippines: "#f59e0b", // amber
};

const DUPR_BUCKET_ORDER = ["< 2.5", "2.5–3.0", "3.0–3.5", "3.5–4.0", "4.0–4.5", "4.5–5.0", "5.0+", "No DUPR"];
const DUPR_BUCKET_COLORS: Record<string, string> = {
  "< 2.5":    "#6b7280",
  "2.5–3.0":  "#10b981",
  "3.0–3.5":  "#34d399",
  "3.5–4.0":  "#f59e0b",
  "4.0–4.5":  "#f97316",
  "4.5–5.0":  "#ef4444",
  "5.0+":     "#dc2626",
  "No DUPR":  "#374151",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent = false,
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center mb-1">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <p className={`text-2xl font-semibold ${accent ? "text-emerald-400" : "text-white"}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function DuprBar({ pctVal }: { pctVal: number }) {
  const color = pctVal >= 70 ? "bg-emerald-500" : pctVal >= 40 ? "bg-amber-500" : "bg-gray-600";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
      <span className="text-[11px] text-gray-400 tabular-nums w-10 text-right">{pct(pctVal)}</span>
    </div>
  );
}

// ─── Global header ────────────────────────────────────────────────────────────

function GlobalHeader({
  data,
}: {
  data: AnalyticsData;
}) {
  const duprPct = data.globalPlayers > 0
    ? (data.globalPlayersWithDupr / data.globalPlayers) * 100
    : 0;
  const totalToday = data.overview.reduce((s, o) => s + o.sessionsToday, 0);
  const totalActive30d = data.overview.reduce((s, o) => s + o.activePlayers30d, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
      <StatCard
        label="Total clubs"
        value={n(data.globalClubs)}
        sub={`across ${Object.keys(data.allMarkets).length} configured cities`}
        tooltip="Total number of clubs registered in the Reclub database across all scraped cities."
      />
      <StatCard
        label="Known players"
        value={n(data.globalPlayers)}
        sub={`${n(data.globalPlayersWithDupr)} have DUPR (${pct(duprPct)})`}
        tooltip="Total unique players ever discovered in session rosters. DUPR = Doubles rating from the DUPR ranking system."
      />
      <StatCard
        label="Sessions today"
        value={n(totalToday)}
        accent
        sub="across all markets"
        tooltip="Number of sessions scraped for today's date, summed across all active markets."
      />
      <StatCard
        label="Active players"
        value={n(totalActive30d)}
        sub="in rosters, last 30 days"
        tooltip="Distinct players who appeared in at least one session roster in the last 30 days."
      />
    </div>
  );
}

// ─── Market tabs ──────────────────────────────────────────────────────────────

function MarketTabs({
  active,
  meta,
  onChange,
  overview,
}: {
  active: string;
  meta: typeof MARKET_META;
  onChange: (m: string) => void;
  overview: AnalyticsData["overview"];
}) {
  // Group all configured markets by country (preserving declaration order)
  const countries: Record<string, string[]> = {};
  for (const [mk, info] of Object.entries(meta)) {
    const country = info.country ?? "Other";
    if (!countries[country]) countries[country] = [];
    countries[country].push(mk);
  }

  return (
    <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-800 pb-3">
      {Object.entries(countries).map(([country, mks]) => (
        <div key={country} className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-widest mr-1">
            {meta[mks[0]]?.flag}
          </span>
          {mks.map((mk) => {
            const ov = overview.find((o) => o.market === mk);
            const hasData = ov != null;
            const isActive = mk === active;
            return (
              <button
                key={mk}
                onClick={() => onChange(mk)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  isActive
                    ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700 font-medium"
                    : hasData
                    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    : "text-gray-600 hover:text-gray-400 hover:bg-gray-800/50"
                }`}
              >
                {meta[mk]?.label ?? mk}
                {ov && ov.sessionsToday > 0 ? (
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-emerald-800 text-emerald-200" : "bg-gray-700 text-gray-400"
                  }`}>
                    {ov.sessionsToday}
                  </span>
                ) : !hasData ? (
                  <span className="ml-1.5 text-[10px] text-gray-700">soon</span>
                ) : null}
              </button>
            );
          })}
          <span className="text-gray-700 mx-2">·</span>
        </div>
      ))}
    </div>
  );
}

// ─── Per-market view ──────────────────────────────────────────────────────────

function MarketView({
  market,
  data,
  meta,
}: {
  market: string;
  data: AnalyticsData;
  meta: typeof MARKET_META;
}) {
  const ov = data.overview.find((o) => o.market === market);
  const ps = data.playerStats.find((o) => o.market === market);
  const q  = data.quality.find((o) => o.market === market);
  const mkt = meta[market] ?? { label: market, country: "", flag: "", currency: "VND" };
  const color = COUNTRY_COLORS[mkt.country] ?? "#10b981";

  const duprPct = ps && ps.totalPlayers > 0
    ? (ps.playersWithDupr / ps.totalPlayers) * 100
    : 0;

  // Trend data for this market (last 14 days)
  const trendData = data.trend
    .filter((t) => t.market === market)
    .map((t) => ({ date: fmtDate(t.date), sessions: t.sessions, players: t.totalJoined }));

  // DUPR buckets for this market, ordered
  const rawBuckets = data.duprBuckets.filter((b) => b.market === market);
  const bucketMap = Object.fromEntries(rawBuckets.map((b) => [b.bucket, b.count]));
  const duprData = DUPR_BUCKET_ORDER
    .filter((b) => bucketMap[b] != null)
    .map((b) => ({ bucket: b, count: bucketMap[b], color: DUPR_BUCKET_COLORS[b] }));

  // Top clubs
  const clubs = data.topClubs.filter((c) => c.market === market);

  if (!ov) {
    return (
      <div className="text-center py-16 text-gray-600">
        No data yet for {mkt.label} — next scrape will populate this.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Clubs"
          value={n(ov.clubs)}
          sub="known venues"
          tooltip="Total clubs in this city that have at least one scraped session."
        />
        <StatCard
          label="Sessions today"
          value={n(ov.sessionsToday)}
          accent={ov.sessionsToday > 0}
          sub={`${n(ov.sessions7d)} this week`}
          tooltip="Sessions scraped for today across this city. The badge shows this week's total."
        />
        <StatCard
          label="Active players"
          value={ps ? n(ps.totalPlayers) : "—"}
          sub="seen in rosters, 30d"
          tooltip="Distinct players who joined at least one session in the last 30 days. This is the pool used for 'My Feed' and friend suggestions."
        />
        <StatCard
          label="DUPR coverage"
          value={ps ? pct(duprPct) : "—"}
          sub={ps ? `${n(ps.playersWithDupr)} rated players` : undefined}
          tooltip="Share of active players (30d) who have a DUPR doubles rating. Higher coverage = better skill-based matchmaking."
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Avg fill rate"
          value={q?.avgFillPct != null ? pct(q.avgFillPct) : "—"}
          sub="of capacity, last 7d"
          tooltip="Average % of max capacity filled across all sessions with ≥16 spots, last 7 days. Low values may indicate off-peak scrape times or large venues."
        />
        <StatCard
          label="Avg session fee"
          value={fmtFee(q?.avgFee ?? null, mkt.currency)}
          sub="last 7 days"
          tooltip="Average fee per player per session, last 7 days (sessions with ≥16 spots). Used to understand pricing per city."
        />
        <StatCard
          label="Avg DUPR (doubles)"
          value={ps?.avgDupr != null ? ps.avgDupr.toFixed(2) : "—"}
          sub={`${n(ov.activePlayers30d)} active, last 30d`}
          tooltip="Mean DUPR doubles rating of active players with a rating. DUPR scale: ~2.0 (beginner) to 6.0+ (professional)."
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Session trend */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Sessions per day — last 14 days</p>
          {trendData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
                  itemStyle={{ color: "#9ca3af", fontSize: 12 }}
                />
                <Bar dataKey="sessions" name="Sessions" radius={[3, 3, 0, 0]} fill={color} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Players per day */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Players booked per day — last 14 days</p>
          {trendData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
                  itemStyle={{ color: "#9ca3af", fontSize: 12 }}
                />
                <Bar dataKey="players" name="Players" radius={[3, 3, 0, 0]} fill={color} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* DUPR distribution + Top clubs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* DUPR distribution */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">DUPR rating distribution</p>
          {duprData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              No DUPR data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={duprData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis
                  dataKey="bucket"
                  tick={{ fill: "#6b7280", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
                  itemStyle={{ color: "#9ca3af", fontSize: 12 }}
                />
                <Bar dataKey="count" name="Players" radius={[3, 3, 0, 0]}>
                  {duprData.map((d) => (
                    <Cell key={d.bucket} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {/* DUPR coverage bar */}
          {ps && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>DUPR coverage</span>
                <span>{n(ps.playersWithDupr)} / {n(ps.totalPlayers)} players</span>
              </div>
              <DuprBar pctVal={duprPct} />
            </div>
          )}
        </div>

        {/* Top clubs */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Top clubs by bookings — last 30 days</p>
          {clubs.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
              No club data yet
            </div>
          ) : (
            <div className="space-y-2">
              {clubs.map((club, i) => {
                const maxPlayers = clubs[0]?.totalPlayers ?? 1;
                const barPct = maxPlayers > 0 ? (club.totalPlayers / maxPlayers) * 100 : 0;
                return (
                  <div key={club.clubName} className="group">
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="text-gray-300 truncate max-w-[180px]" title={club.clubName}>
                        <span className="text-gray-600 mr-1.5 tabular-nums w-4 inline-block">{i + 1}.</span>
                        {club.clubName}
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-gray-500">{n(club.sessions)} sessions</span>
                        <span className="text-gray-300 font-medium tabular-nums w-10 text-right">
                          {n(club.totalPlayers)}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{ width: `${barPct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cross-market comparison table ───────────────────────────────────────────

function ComparisonTable({
  data,
  meta,
  onSelect,
}: {
  data: AnalyticsData;
  meta: typeof MARKET_META;
  onSelect: (m: string) => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mt-8">
      <div className="px-5 py-3 border-b border-gray-800">
        <p className="text-sm font-medium text-gray-300">All markets — overview</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {["Market", "Clubs", "Today", "7d sessions", "30d sessions", "Active players", "DUPR %", "Avg fill", "Avg DUPR"].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {Object.keys(meta).map((marketKey) => {
              const ov  = data.overview.find((o) => o.market === marketKey);
              const ps  = data.playerStats.find((p) => p.market === marketKey);
              const q   = data.quality.find((q) => q.market === marketKey);
              const mkt = meta[marketKey];
              const hasData    = ov != null;
              const duprPctVal = ps && ps.totalPlayers > 0
                ? (ps.playersWithDupr / ps.totalPlayers) * 100
                : null;

              return (
                <tr
                  key={marketKey}
                  className={`border-b border-gray-800/50 last:border-0 transition cursor-pointer ${
                    hasData ? "hover:bg-gray-800/30" : "opacity-40"
                  }`}
                  onClick={() => onSelect(marketKey)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{mkt?.flag}</span>
                      <div>
                        <p className={`font-medium ${hasData ? "text-gray-200" : "text-gray-500"}`}>
                          {mkt?.label ?? marketKey}
                        </p>
                        <p className="text-[11px] text-gray-600">{mkt?.country}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{ov ? n(ov.clubs) : "—"}</td>
                  <td className="px-4 py-3">
                    {ov ? (
                      <span className={`font-medium tabular-nums ${ov.sessionsToday > 0 ? "text-emerald-400" : "text-gray-600"}`}>
                        {n(ov.sessionsToday)}
                      </span>
                    ) : (
                      <span className="text-gray-700 text-xs">not yet scraped</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{ov ? n(ov.sessions7d) : "—"}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{ov ? n(ov.sessions30d) : "—"}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{ps ? n(ps.totalPlayers) : "—"}</td>
                  <td className="px-4 py-3">
                    {duprPctVal != null ? (
                      <span
                        className="tabular-nums"
                        style={{ color: duprPctVal >= 60 ? "#34d399" : duprPctVal >= 30 ? "#f59e0b" : "#6b7280" }}
                      >
                        {pct(duprPctVal)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {q?.avgFillPct != null ? (
                      <span
                        className="tabular-nums"
                        style={{ color: q.avgFillPct >= 70 ? "#34d399" : q.avgFillPct >= 40 ? "#f59e0b" : "#6b7280" }}
                      >
                        {pct(q.avgFillPct)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">
                    {ps?.avgDupr != null ? ps.avgDupr.toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AnalyticsDashboard({
  data,
  meta,
}: {
  data: AnalyticsData;
  meta: typeof MARKET_META;
}) {
  const [activeMarket, setActiveMarket] = useState(data.markets[0] ?? "hcm");
  const fetchedAt = new Date(data.fetchedAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const totalConfigured = Object.keys(meta).length;
  const totalWithData   = data.markets.length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Analytics</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Scraper market overview · fetched at {fetchedAt}
          </p>
        </div>
        <span className="text-xs text-gray-600 bg-gray-900 border border-gray-800 px-2.5 py-1 rounded-lg">
          {totalWithData} / {totalConfigured} markets active
        </span>
      </div>

      {/* Global KPIs */}
      <GlobalHeader data={data} />

      {/* Market tabs — shows ALL configured markets */}
      <MarketTabs
        active={activeMarket}
        meta={meta}
        onChange={setActiveMarket}
        overview={data.overview}
      />

      {/* Per-market detail */}
      <MarketView market={activeMarket} data={data} meta={meta} />

      {/* Cross-market comparison */}
      <ComparisonTable data={data} meta={meta} onSelect={setActiveMarket} />
    </div>
  );
}
