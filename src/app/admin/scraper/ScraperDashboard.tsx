"use client";

import { useState } from "react";
import type { ScraperData, MARKET_META } from "./page";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: number) {
  return v.toLocaleString("en-US");
}

function pct(v: number) {
  return `${v.toFixed(1)}%`;
}

function timeAgo(iso: string | null): { label: string; stale: boolean; veryStale: boolean } {
  if (!iso) return { label: "never", stale: true, veryStale: true };
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = diffMs / 60_000;
  const diffH   = diffMin / 60;
  const diffD   = diffH / 24;
  const stale     = diffH > 12;
  const veryStale = diffH > 30;
  if (diffMin < 2)   return { label: "just now",                    stale: false, veryStale: false };
  if (diffMin < 60)  return { label: `${Math.round(diffMin)}m ago`, stale: false, veryStale: false };
  if (diffH < 24)    return { label: `${Math.round(diffH)}h ago`,   stale, veryStale: false };
  return               { label: `${Math.round(diffD)}d ago`,        stale: true,  veryStale };
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
  }) + " VN";
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function StatusDot({ ok, warn, label }: { ok: boolean; warn?: boolean; label?: string }) {
  const color = ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {label && <span className="text-xs text-gray-400">{label}</span>}
    </span>
  );
}

function CoverageMiniBar({ pctVal, color }: { pctVal: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pctVal, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[11px] tabular-nums text-gray-400 w-10 text-right">{pct(pctVal)}</span>
    </div>
  );
}

// ─── Cron schedule diagram ─────────────────────────────────────────────────────

function CronSchedule({
  slots,
}: {
  slots: ScraperData["cronSchedule"];
}) {
  const now = new Date();
  const nowVnH = (now.getUTCHours() + 7) % 24;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm font-medium text-gray-300 mb-4">Cron schedule</p>
      <div className="flex items-center gap-3">
        {slots.map((slot) => {
          const isPast = slot.vnHour < nowVnH;
          const isNext = !isPast && slots.filter((s) => s.vnHour < nowVnH).length === slots.indexOf(slot) - (slots.filter(s => s.vnHour < nowVnH).length > 0 ? 0 : 0);
          const distH = ((slot.vnHour - nowVnH + 24) % 24);
          const isUpcoming = distH <= 2 && distH > 0;
          return (
            <div
              key={slot.label}
              className={`flex-1 rounded-lg border p-3 text-center transition-all ${
                isPast
                  ? "border-emerald-800 bg-emerald-950/40"
                  : isUpcoming
                  ? "border-amber-700 bg-amber-950/40"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              <p className={`text-base font-semibold ${isPast ? "text-emerald-400" : isUpcoming ? "text-amber-400" : "text-gray-400"}`}>
                {slot.label}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">UTC {slot.utcHour}:00</p>
              {isPast && <p className="text-[10px] text-emerald-600 mt-1">✓ done today</p>}
              {isUpcoming && <p className="text-[10px] text-amber-600 mt-1">~{distH}h away</p>}
              {!isPast && !isUpcoming && <p className="text-[10px] text-gray-700 mt-1">upcoming</p>}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-600 mt-3">
        Full scrape (all 9 markets in parallel) + roster pass. Club discovery scan runs weekly on Monday.
      </p>
    </div>
  );
}

// ─── Roster health table (main focus) ─────────────────────────────────────────

function RosterHealthTable({
  health,
  meta,
}: {
  health: ScraperData["health"];
  meta: typeof MARKET_META;
}) {
  const COUNTRY_COLORS: Record<string, string> = {
    Vietnam: "#10b981", Malaysia: "#3b82f6", Philippines: "#f59e0b",
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-300">Roster health — today</p>
        <p className="text-[11px] text-gray-600">Priority: sessions with ≥16 capacity and ≥5 joined</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              {["Market", "Status", "Sessions today", "Rostered", "Coverage", "Players seen", "Last roster", "Last club scan"].map((h) => (
                <th key={h} className="text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {health.map((row) => {
              const mkt   = meta[row.market];
              const color = COUNTRY_COLORS[mkt?.country ?? ""] ?? "#6b7280";
              const ago   = timeAgo(row.lastRosterScrape);
              const scanAgo = timeAgo(row.lastClubScan);
              const hasData = row.sessionsToday > 0;
              const coverageOk   = row.rosterCoveragePct >= 30;
              const coverageWarn = row.rosterCoveragePct >= 10 && row.rosterCoveragePct < 30;
              const overallOk   = hasData && !ago.stale;
              const overallWarn = hasData && ago.stale && !ago.veryStale;

              return (
                <tr key={row.market} className={`border-b border-gray-800/50 last:border-0 ${!hasData ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>{mkt?.flag}</span>
                      <div>
                        <p className="font-medium text-gray-200 text-sm">{mkt?.label ?? row.market}</p>
                        <p className="text-[10px] text-gray-600">{mkt?.country}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!hasData
                      ? <StatusDot ok={false} warn label="no data" />
                      : ago.veryStale
                      ? <StatusDot ok={false} label="stale" />
                      : ago.stale
                      ? <StatusDot ok={false} warn label="old" />
                      : <StatusDot ok label="live" />
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`tabular-nums font-medium ${row.sessionsToday > 0 ? "text-white" : "text-gray-600"}`}>
                      {n(row.sessionsToday)}
                    </span>
                    {row.tomorrowSessions > 0 && (
                      <span className="ml-2 text-[10px] text-gray-600">+{n(row.tomorrowSessions)} tmrw</span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-300">
                    {n(row.sessionsWithRoster)}
                    <span className="text-gray-600 text-[11px] ml-1">/ {n(row.sessionsToday)}</span>
                  </td>
                  <td className="px-4 py-3 w-40">
                    {hasData
                      ? <CoverageMiniBar pctVal={row.rosterCoveragePct} color={coverageOk ? "#10b981" : coverageWarn ? "#f59e0b" : "#ef4444"} />
                      : <span className="text-gray-700 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 tabular-nums" style={{ color }}>
                    {n(row.playersRostered)}
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-xs ${ago.veryStale ? "text-red-400" : ago.stale ? "text-amber-400" : "text-gray-300"}`}>
                      {ago.label}
                    </p>
                    <p className="text-[10px] text-gray-600">{fmtTime(row.lastRosterScrape)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-xs ${scanAgo.veryStale ? "text-amber-500" : "text-gray-500"}`}>
                      {scanAgo.label}
                    </p>
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

// ─── Roster run history (7 days) ─────────────────────────────────────────────

function RosterRunHistory({
  runs,
  meta,
}: {
  runs: ScraperData["rosterRuns"];
  meta: typeof MARKET_META;
}) {
  const [filter, setFilter] = useState<string>("all");
  const markets = ["all", ...Object.keys(meta).filter((mk) => runs.some((r) => r.market === mk))];

  const filtered = filter === "all" ? runs : runs.filter((r) => r.market === filter);

  // Group by date
  const byDate = new Map<string, typeof runs>();
  for (const r of filtered) {
    if (!byDate.has(r.vnDate)) byDate.set(r.vnDate, []);
    byDate.get(r.vnDate)!.push(r);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-gray-300">Roster run history — last 7 days</p>
        <div className="flex gap-1 flex-wrap">
          {markets.map((mk) => (
            <button
              key={mk}
              onClick={() => setFilter(mk)}
              className={`px-2.5 py-1 text-[11px] rounded-lg transition-all ${
                filter === mk
                  ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700"
                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              }`}
            >
              {mk === "all" ? "All" : (meta[mk]?.flag + " " + (meta[mk]?.label ?? mk))}
            </button>
          ))}
        </div>
      </div>

      {Array.from(byDate.entries()).map(([date, dayRuns]) => (
        <div key={date} className="border-b border-gray-800/50 last:border-0">
          <div className="px-5 py-2 bg-gray-800/30">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{fmtDate(date)}</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {dayRuns.map((run, i) => {
                const mkt = meta[run.market];
                const slotsOk = run.scrapeSlots >= 2;
                return (
                  <tr key={i} className="border-b border-gray-800/30 last:border-0 hover:bg-gray-800/20">
                    <td className="px-5 py-2.5 w-36">
                      <span className="flex items-center gap-1.5 text-gray-300">
                        {mkt?.flag} {mkt?.label ?? run.market}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-300 w-32">
                      <span className="font-medium">{n(run.sessionsRostered)}</span>
                      <span className="text-gray-600 text-[11px] ml-1">sessions</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-emerald-400 w-28">
                      <span className="font-medium">{n(run.playersSeen)}</span>
                      <span className="text-gray-600 text-[11px] ml-1">players</span>
                    </td>
                    <td className="px-4 py-2.5 w-28">
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                        slotsOk ? "bg-emerald-900/40 text-emerald-400" : "bg-gray-800 text-gray-500"
                      }`}>
                        {run.scrapeSlots}× run{run.scrapeSlots !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 text-[11px]">
                      {fmtTime(run.firstRoster)} → {fmtTime(run.lastRoster)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {byDate.size === 0 && (
        <div className="px-5 py-8 text-center text-gray-600 text-sm">No roster runs in the last 7 days for this market.</div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ScraperDashboard({
  data,
  meta,
}: {
  data: ScraperData;
  meta: typeof MARKET_META;
}) {
  const fetchedAt = new Date(data.fetchedAt).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  const totalSessions = data.health.reduce((s, h) => s + h.sessionsToday, 0);
  const marketsLive   = data.health.filter((h) => h.sessionsToday > 0 && !timeAgo(h.lastRosterScrape).stale).length;
  const marketsStale  = data.health.filter((h) => h.sessionsToday > 0 && timeAgo(h.lastRosterScrape).stale).length;
  const overallHealth = marketsStale === 0 ? "ok" : marketsStale <= 2 ? "warn" : "error";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            Scraper Health
            <span className={`text-xs px-2 py-0.5 rounded-full font-normal ${
              overallHealth === "ok"    ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800" :
              overallHealth === "warn"  ? "bg-amber-900/50 text-amber-400 border border-amber-800" :
                                          "bg-red-900/50 text-red-400 border border-red-800"
            }`}>
              {overallHealth === "ok" ? "● All systems OK" : overallHealth === "warn" ? "⚠ Some markets stale" : "✗ Action needed"}
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Refreshed at {fetchedAt}</p>
        </div>
        <div className="flex gap-2 text-xs text-gray-600">
          <span className="bg-gray-900 border border-gray-800 px-2.5 py-1 rounded-lg">
            {marketsLive} / {Object.keys(meta).length} markets live
          </span>
        </div>
      </div>

      {/* Global KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Sessions today</p>
          <p className="text-2xl font-semibold text-white">{n(totalSessions)}</p>
          <p className="text-[11px] text-gray-500 mt-1">across all markets</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Rostered today</p>
          <p className="text-2xl font-semibold text-emerald-400">{n(data.totalRosteredToday)}</p>
          <p className="text-[11px] text-gray-500 mt-1">sessions with player data</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Players seen today</p>
          <p className="text-2xl font-semibold text-white">{n(data.totalPlayersToday)}</p>
          <p className="text-[11px] text-gray-500 mt-1">feed & friend data</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Next scrape</p>
          <p className="text-2xl font-semibold text-white">
            {(() => {
              const nowVnH = (new Date().getUTCHours() + 7) % 24;
              const next = data.cronSchedule.find((s) => s.vnHour > nowVnH);
              return next?.label ?? data.cronSchedule[0]?.label ?? "—";
            })()}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">full scrape all markets</p>
        </div>
      </div>

      {/* Cron schedule */}
      <CronSchedule slots={data.cronSchedule} />

      {/* Roster health table — PRIMARY VIEW */}
      <RosterHealthTable health={data.health} meta={meta} />

      {/* Run history */}
      <RosterRunHistory runs={data.rosterRuns} meta={meta} />
    </div>
  );
}
