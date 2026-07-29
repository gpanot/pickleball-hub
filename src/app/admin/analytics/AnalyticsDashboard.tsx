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

// ─── Types ────────────────────────────────────────────────────────────────────

type Scope =
  | { level: "all" }
  | { level: "country"; country: string }
  | { level: "city";    market: string };

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
  Vietnam:     "#10b981",
  Malaysia:    "#3b82f6",
  Philippines: "#f59e0b",
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false, tooltip,
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
      <p className={`text-2xl font-semibold ${accent ? "text-emerald-400" : "text-white"}`}>{value}</p>
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

// ─── Breadcrumb nav ───────────────────────────────────────────────────────────

function Breadcrumb({
  scope,
  meta,
  onNavigate,
}: {
  scope: Scope;
  meta: typeof MARKET_META;
  onNavigate: (s: Scope) => void;
}) {
  const crumbs: { label: string; scope: Scope }[] = [
    { label: "All", scope: { level: "all" } },
  ];
  if (scope.level === "country") {
    const flag = Object.values(meta).find((m) => m.country === scope.country)?.flag ?? "";
    crumbs.push({ label: `${flag} ${scope.country}`, scope });
  }
  if (scope.level === "city") {
    const mkt = meta[scope.market];
    const flag = Object.values(meta).find((m) => m.country === mkt?.country)?.flag ?? "";
    crumbs.push({
      label: `${flag} ${mkt?.country ?? ""}`,
      scope: { level: "country", country: mkt?.country ?? "" },
    });
    crumbs.push({ label: mkt?.label ?? scope.market, scope });
  }

  return (
    <div className="flex items-center gap-1 text-sm mb-6">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-700">/</span>}
          {i < crumbs.length - 1 ? (
            <button
              onClick={() => onNavigate(c.scope)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              {c.label}
            </button>
          ) : (
            <span className="text-white font-medium">{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ─── Helper: aggregate markets for a set of market keys ──────────────────────

function aggregateMarkets(
  keys: string[],
  data: AnalyticsData,
  meta: typeof MARKET_META,
) {
  const ovs  = data.overview.filter((o) => keys.includes(o.market));
  const pss  = data.playerStats.filter((p) => keys.includes(p.market));

  const clubs           = ovs.reduce((s, o) => s + o.clubs, 0);
  const sessionsToday   = ovs.reduce((s, o) => s + o.sessionsToday, 0);
  const sessions7d      = ovs.reduce((s, o) => s + o.sessions7d, 0);
  const sessions30d     = ovs.reduce((s, o) => s + o.sessions30d, 0);
  const activePlayers   = ovs.reduce((s, o) => s + o.activePlayers30d, 0);
  const totalPlayers    = pss.reduce((s, p) => s + p.totalPlayers, 0);
  const withDupr        = pss.reduce((s, p) => s + p.playersWithDupr, 0);

  // Weighted avg DUPR
  let duprSum = 0, duprCount = 0;
  for (const p of pss) {
    if (p.avgDupr != null && p.playersWithDupr > 0) {
      duprSum   += p.avgDupr * p.playersWithDupr;
      duprCount += p.playersWithDupr;
    }
  }
  const avgDupr = duprCount > 0 ? duprSum / duprCount : null;
  const duprPct = totalPlayers > 0 ? (withDupr / totalPlayers) * 100 : 0;

  // Trend: sum across all keys per date
  const trendByDate = new Map<string, { sessions: number; players: number }>();
  for (const t of data.trend.filter((t) => keys.includes(t.market))) {
    const existing = trendByDate.get(t.date) ?? { sessions: 0, players: 0 };
    trendByDate.set(t.date, {
      sessions: existing.sessions + t.sessions,
      players:  existing.players  + t.totalJoined,
    });
  }
  const trendData = Array.from(trendByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date: fmtDate(date), ...v }));

  // DUPR buckets: sum across all keys
  const bucketSum = new Map<string, number>();
  for (const b of data.duprBuckets.filter((b) => keys.includes(b.market))) {
    bucketSum.set(b.bucket, (bucketSum.get(b.bucket) ?? 0) + b.count);
  }
  const duprData = DUPR_BUCKET_ORDER
    .filter((b) => bucketSum.has(b))
    .map((b) => ({ bucket: b, count: bucketSum.get(b)!, color: DUPR_BUCKET_COLORS[b] }));

  return {
    clubs, sessionsToday, sessions7d, sessions30d, activePlayers,
    totalPlayers, withDupr, avgDupr, duprPct, trendData, duprData,
  };
}

// ─── Shared charts ────────────────────────────────────────────────────────────

function TrendCharts({
  trendData,
  color,
}: {
  trendData: { date: string; sessions: number; players: number }[];
  color: string;
}) {
  const tooltipStyle = {
    contentStyle: { background: "#111827", border: "1px solid #374151", borderRadius: 8 },
    labelStyle: { color: "#e5e7eb", fontSize: 12 },
    itemStyle: { color: "#9ca3af", fontSize: 12 },
  };
  const empty = (
    <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No data yet</div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-300 mb-4">Sessions per day — last 14 days</p>
        {trendData.length === 0 ? empty : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="sessions" name="Sessions" radius={[3, 3, 0, 0]} fill={color} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-sm font-medium text-gray-300 mb-4">Players booked per day — last 14 days</p>
        {trendData.length === 0 ? empty : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="players" name="Players" radius={[3, 3, 0, 0]} fill={color} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function DuprChart({
  duprData,
  totalPlayers,
  withDupr,
  duprPct,
}: {
  duprData: { bucket: string; count: number; color: string }[];
  totalPlayers: number;
  withDupr: number;
  duprPct: number;
}) {
  const tooltipStyle = {
    contentStyle: { background: "#111827", border: "1px solid #374151", borderRadius: 8 },
    labelStyle: { color: "#e5e7eb", fontSize: 12 },
    itemStyle: { color: "#9ca3af", fontSize: 12 },
  };
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm font-medium text-gray-300 mb-4">DUPR rating distribution</p>
      {duprData.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No DUPR data yet</div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={duprData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="bucket" tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" name="Players" radius={[3, 3, 0, 0]}>
              {duprData.map((d) => <Cell key={d.bucket} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {totalPlayers > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>DUPR coverage</span>
            <span>{n(withDupr)} / {n(totalPlayers)} players</span>
          </div>
          <DuprBar pctVal={duprPct} />
        </div>
      )}
    </div>
  );
}

// ─── ALL level ────────────────────────────────────────────────────────────────

function AllView({
  data,
  meta,
  onDrillCountry,
}: {
  data: AnalyticsData;
  meta: typeof MARKET_META;
  onDrillCountry: (country: string) => void;
}) {
  const duprPct = data.globalPlayers > 0
    ? (data.globalPlayersWithDupr / data.globalPlayers) * 100
    : 0;
  const totalToday    = data.overview.reduce((s, o) => s + o.sessionsToday, 0);
  const totalActive30 = data.overview.reduce((s, o) => s + o.activePlayers30d, 0);

  // All market keys
  const allKeys = Object.keys(meta);
  const { trendData, duprData, totalPlayers, withDupr, duprPct: aggDuprPct } =
    aggregateMarkets(allKeys, data, meta);

  // Countries
  const countries = [...new Set(Object.values(meta).map((m) => m.country))];

  return (
    <div className="space-y-6">
      {/* Global KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total clubs"
          value={n(data.globalClubs)}
          sub={`across ${allKeys.length} cities`}
          tooltip="Total clubs registered in the Reclub database across all scraped cities."
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
          tooltip="Sessions scraped for today's date, summed across all active markets."
        />
        <StatCard
          label="Active players"
          value={n(totalActive30)}
          sub="in rosters, last 30 days"
          tooltip="Distinct players who appeared in at least one session roster in the last 30 days."
        />
      </div>

      {/* Country cards — click to drill down */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {countries.map((country) => {
          const countryKeys = Object.entries(meta)
            .filter(([, v]) => v.country === country)
            .map(([k]) => k);
          const agg = aggregateMarkets(countryKeys, data, meta);
          const flag = meta[countryKeys[0]]?.flag ?? "";
          const color = COUNTRY_COLORS[country] ?? "#6b7280";
          const activeMarkets = countryKeys.filter((k) =>
            data.overview.some((o) => o.market === k)
          ).length;

          return (
            <button
              key={country}
              onClick={() => onDrillCountry(country)}
              className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 text-left transition-all group"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{flag}</span>
                  <span className="text-base font-semibold text-white">{country}</span>
                </div>
                <span className="text-[10px] text-gray-600 group-hover:text-gray-400 transition-colors">
                  {activeMarkets}/{countryKeys.length} cities →
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Clubs</p>
                  <p className="text-xl font-semibold text-white">{n(agg.clubs)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Today</p>
                  <p className={`text-xl font-semibold ${agg.sessionsToday > 0 ? "text-emerald-400" : "text-gray-600"}`}>
                    {n(agg.sessionsToday)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Active players</p>
                  <p className="text-xl font-semibold text-white">{n(agg.activePlayers)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">DUPR coverage</p>
                  <p className="text-xl font-semibold" style={{ color }}>
                    {agg.totalPlayers > 0 ? pct(agg.duprPct) : "—"}
                  </p>
                </div>
              </div>
              {/* mini trend sparkline: 14-day sessions bar */}
              {agg.trendData.length > 0 && (
                <div className="mt-4 flex items-end gap-[2px] h-8">
                  {agg.trendData.map((d, i) => {
                    const max = Math.max(...agg.trendData.map((x) => x.sessions), 1);
                    const h = Math.max(2, (d.sessions / max) * 32);
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{ height: h, backgroundColor: color, opacity: 0.6 }}
                      />
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Global trend charts */}
      <TrendCharts trendData={trendData} color="#6b7280" />

      {/* Global DUPR chart */}
      <DuprChart
        duprData={duprData}
        totalPlayers={totalPlayers}
        withDupr={withDupr}
        duprPct={aggDuprPct}
      />
    </div>
  );
}

// ─── COUNTRY level ────────────────────────────────────────────────────────────

function CountryView({
  country,
  data,
  meta,
  onDrillCity,
}: {
  country: string;
  data: AnalyticsData;
  meta: typeof MARKET_META;
  onDrillCity: (market: string) => void;
}) {
  const countryKeys = Object.entries(meta)
    .filter(([, v]) => v.country === country)
    .map(([k]) => k);
  const agg   = aggregateMarkets(countryKeys, data, meta);
  const color = COUNTRY_COLORS[country] ?? "#6b7280";

  return (
    <div className="space-y-6">
      {/* Country aggregate KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Clubs"
          value={n(agg.clubs)}
          sub="known venues"
          tooltip="Total clubs across all cities in this country."
        />
        <StatCard
          label="Sessions today"
          value={n(agg.sessionsToday)}
          accent={agg.sessionsToday > 0}
          sub={`${n(agg.sessions7d)} this week`}
          tooltip="Sessions scraped today across all cities in this country."
        />
        <StatCard
          label="Active players"
          value={n(agg.activePlayers)}
          sub="in rosters, last 30 days"
          tooltip="Distinct players active in rosters across all cities, last 30 days."
        />
        <StatCard
          label="DUPR coverage"
          value={agg.totalPlayers > 0 ? pct(agg.duprPct) : "—"}
          sub={`${n(agg.withDupr)} rated players`}
          tooltip="Share of active players with a DUPR doubles rating across this country."
        />
      </div>

      {/* City comparison table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <p className="text-sm font-medium text-gray-300">Cities in {country}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {["City", "Clubs", "Today", "7d sessions", "30d sessions", "Active players", "DUPR %", "Avg DUPR"].map((h) => (
                  <th key={h} className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countryKeys.map((mk) => {
                const ov = data.overview.find((o) => o.market === mk);
                const ps = data.playerStats.find((p) => p.market === mk);
                const hasData = ov != null;
                const duprPctVal = ps && ps.totalPlayers > 0
                  ? (ps.playersWithDupr / ps.totalPlayers) * 100
                  : null;

                return (
                  <tr
                    key={mk}
                    onClick={() => onDrillCity(mk)}
                    className={`border-b border-gray-800/50 last:border-0 cursor-pointer transition ${
                      hasData ? "hover:bg-gray-800/40" : "opacity-40"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${hasData ? "text-gray-200" : "text-gray-500"}`}>
                          {meta[mk]?.label ?? mk}
                        </p>
                        {!hasData && (
                          <span className="text-[10px] text-gray-700 border border-gray-800 px-1.5 py-0.5 rounded">
                            soon
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums">{ov ? n(ov.clubs) : "—"}</td>
                    <td className="px-4 py-3">
                      {ov ? (
                        <span className={`font-medium tabular-nums ${ov.sessionsToday > 0 ? "text-emerald-400" : "text-gray-600"}`}>
                          {n(ov.sessionsToday)}
                        </span>
                      ) : <span className="text-gray-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums">{ov ? n(ov.sessions7d) : "—"}</td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums">{ov ? n(ov.sessions30d) : "—"}</td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums">{ps ? n(ps.totalPlayers) : "—"}</td>
                    <td className="px-4 py-3">
                      {duprPctVal != null ? (
                        <span className="tabular-nums" style={{ color: duprPctVal >= 60 ? "#34d399" : duprPctVal >= 30 ? "#f59e0b" : "#6b7280" }}>
                          {pct(duprPctVal)}
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 tabular-nums">
                      {ps?.avgDupr != null ? ps.avgDupr.toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Country total row */}
              <tr className="bg-gray-800/30 border-t border-gray-700">
                <td className="px-4 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total</td>
                <td className="px-4 py-2.5 text-gray-200 font-medium tabular-nums">{n(agg.clubs)}</td>
                <td className="px-4 py-2.5">
                  <span className={`font-medium tabular-nums ${agg.sessionsToday > 0 ? "text-emerald-400" : "text-gray-400"}`}>
                    {n(agg.sessionsToday)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-200 font-medium tabular-nums">{n(agg.sessions7d)}</td>
                <td className="px-4 py-2.5 text-gray-200 font-medium tabular-nums">{n(agg.sessions30d)}</td>
                <td className="px-4 py-2.5 text-gray-200 font-medium tabular-nums">{n(agg.activePlayers)}</td>
                <td className="px-4 py-2.5">
                  <span className="tabular-nums" style={{ color }}>
                    {agg.totalPlayers > 0 ? pct(agg.duprPct) : "—"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-400 tabular-nums">
                  {agg.avgDupr != null ? agg.avgDupr.toFixed(2) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Country trend charts */}
      <TrendCharts trendData={agg.trendData} color={color} />

      {/* Country DUPR chart */}
      <DuprChart
        duprData={agg.duprData}
        totalPlayers={agg.totalPlayers}
        withDupr={agg.withDupr}
        duprPct={agg.duprPct}
      />
    </div>
  );
}

// ─── CITY level ───────────────────────────────────────────────────────────────

function CityView({
  market,
  data,
  meta,
}: {
  market: string;
  data: AnalyticsData;
  meta: typeof MARKET_META;
}) {
  const ov  = data.overview.find((o) => o.market === market);
  const ps  = data.playerStats.find((o) => o.market === market);
  const q   = data.quality.find((o) => o.market === market);
  const mkt = meta[market] ?? { label: market, country: "", flag: "", currency: "VND" };
  const color = COUNTRY_COLORS[mkt.country] ?? "#10b981";

  const duprPct = ps && ps.totalPlayers > 0
    ? (ps.playersWithDupr / ps.totalPlayers) * 100
    : 0;

  const trendData = data.trend
    .filter((t) => t.market === market)
    .map((t) => ({ date: fmtDate(t.date), sessions: t.sessions, players: t.totalJoined }));

  const rawBuckets = data.duprBuckets.filter((b) => b.market === market);
  const bucketMap  = Object.fromEntries(rawBuckets.map((b) => [b.bucket, b.count]));
  const duprData   = DUPR_BUCKET_ORDER
    .filter((b) => bucketMap[b] != null)
    .map((b) => ({ bucket: b, count: bucketMap[b], color: DUPR_BUCKET_COLORS[b] }));

  const clubs = data.topClubs.filter((c) => c.market === market);

  if (!ov) {
    return (
      <div className="text-center py-16 text-gray-600">
        No data yet for {mkt.label} — will populate on the next scrape.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row 1 */}
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
          tooltip="Sessions scraped for today. Badge shows this week's total."
        />
        <StatCard
          label="Active players"
          value={ps ? n(ps.totalPlayers) : "—"}
          sub="seen in rosters, 30d"
          tooltip="Distinct players who joined at least one session in the last 30 days."
        />
        <StatCard
          label="DUPR coverage"
          value={ps ? pct(duprPct) : "—"}
          sub={ps ? `${n(ps.playersWithDupr)} rated players` : undefined}
          tooltip="Share of active players (30d) who have a DUPR doubles rating."
        />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Avg fill rate"
          value={q?.avgFillPct != null ? pct(q.avgFillPct) : "—"}
          sub="of capacity, last 7d"
          tooltip="Average % of max capacity filled across sessions with ≥16 spots, last 7 days."
        />
        <StatCard
          label="Avg session fee"
          value={fmtFee(q?.avgFee ?? null, mkt.currency)}
          sub="last 7 days"
          tooltip="Average fee per player per session, last 7 days (sessions with ≥16 spots)."
        />
        <StatCard
          label="Avg DUPR (doubles)"
          value={ps?.avgDupr != null ? ps.avgDupr.toFixed(2) : "—"}
          sub={`${n(ov.activePlayers30d)} active, last 30d`}
          tooltip="Mean DUPR doubles rating. Scale: ~2.0 (beginner) to 6.0+ (professional)."
        />
      </div>

      {/* Trend charts */}
      <TrendCharts trendData={trendData} color={color} />

      {/* DUPR + Top clubs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DuprChart
          duprData={duprData}
          totalPlayers={ps?.totalPlayers ?? 0}
          withDupr={ps?.playersWithDupr ?? 0}
          duprPct={duprPct}
        />

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-medium text-gray-300 mb-4">Top clubs by bookings — last 30 days</p>
          {clubs.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-600 text-sm">No club data yet</div>
          ) : (
            <div className="space-y-2">
              {clubs.map((club, i) => {
                const maxPlayers = clubs[0]?.totalPlayers ?? 1;
                const barPct = maxPlayers > 0 ? (club.totalPlayers / maxPlayers) * 100 : 0;
                return (
                  <div key={club.clubName}>
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
                      <div className="h-1 rounded-full" style={{ width: `${barPct}%`, backgroundColor: color }} />
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

// ─── Main export ──────────────────────────────────────────────────────────────

export function AnalyticsDashboard({
  data,
  meta,
}: {
  data: AnalyticsData;
  meta: typeof MARKET_META;
}) {
  const [scope, setScope] = useState<Scope>({ level: "all" });

  const fetchedAt = new Date(data.fetchedAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const totalConfigured = Object.keys(meta).length;
  const totalWithData   = data.markets.length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-4">
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

      {/* Breadcrumb */}
      <Breadcrumb scope={scope} meta={meta} onNavigate={setScope} />

      {/* Content by level */}
      {scope.level === "all" && (
        <AllView
          data={data}
          meta={meta}
          onDrillCountry={(country) => setScope({ level: "country", country })}
        />
      )}
      {scope.level === "country" && (
        <CountryView
          country={scope.country}
          data={data}
          meta={meta}
          onDrillCity={(market) => setScope({ level: "city", market })}
        />
      )}
      {scope.level === "city" && (
        <CityView market={scope.market} data={data} meta={meta} />
      )}
    </div>
  );
}
