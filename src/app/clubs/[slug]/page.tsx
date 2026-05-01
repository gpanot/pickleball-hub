"use client";

import { useState, useLayoutEffect, useEffect, useRef, use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FillRateBar } from "@/components/FillRateBar";
import { SessionScoreBadge } from "@/components/SessionScoreBadge";
import { formatVND, parseSessionType, vnCalendarDateString } from "@/lib/utils";
import { HCM_MEDIAN_COST_FALLBACK } from "@/lib/scoring";
import { readPublicApiCache, writePublicApiCache } from "@/lib/public-api-cache";
import type { ClubDuprDistribution } from "@/lib/queries";
import { useI18n } from "@/lib/i18n";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[50dvh] sm:h-[600px] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />,
});

type ClubDetail = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
  zaloUrl: string | null;
  phone: string | null;
  admins: string[];
  hcmMedianCostPerHour?: number;
  sessions: {
    id: number;
    referenceCode: string;
    name: string;
    startTime: string;
    endTime: string;
    durationMin: number;
    maxPlayers: number;
    feeAmount: number;
    costPerHour: number | null;
    skillLevelMin: number | null;
    skillLevelMax: number | null;
    perks: string[];
    eventUrl: string;
    scrapedDate: string;
    duprParticipationPct?: number | null;
    venue: { name: string; latitude: number; longitude: number } | null;
    snapshots: { joined: number; waitlisted: number }[];
  }[];
  dailyStats: {
    date: string;
    totalSessions: number;
    totalCapacity: number;
    totalJoined: number;
    avgFillRate: number;
    avgFee: number;
    revenueEstimate: number;
  }[];
};

type Tab = "sessions" | "dupr" | "more";

export default function ClubProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { t } = useI18n();
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("sessions");
  const [duprData, setDuprData] = useState<ClubDuprDistribution | null>(null);
  const [duprLoading, setDuprLoading] = useState(false);
  const duprFetchedRef = useRef(false);

  useLayoutEffect(() => {
    const url = `/api/clubs/${encodeURIComponent(slug)}`;
    const cached = readPublicApiCache<ClubDetail>(url);
    if (cached) {
      setClub(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then((r) => (r.ok ? r.json() as Promise<ClubDetail> : null))
      .then((data) => {
        if (cancelled) return;
        if (data) writePublicApiCache(url, data);
        setClub(data);
      })
      .catch(() => {
        if (!cancelled) setClub(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Lazy-load DUPR data the first time the tab is opened.
  // Using a ref (not state) for the "fetched" guard so React StrictMode's
  // double-invoke of effects doesn't cancel an in-flight request.
  useEffect(() => {
    if (activeTab !== "dupr" || duprFetchedRef.current) return;
    duprFetchedRef.current = true; // mark immediately — prevents double-fetch
    const url = `/api/clubs/${encodeURIComponent(slug)}/dupr`;
    setDuprLoading(true);
    fetch(url)
      .then((r) => (r.ok ? (r.json() as Promise<ClubDuprDistribution>) : null))
      .then((data) => { setDuprData(data); })
      .catch(() => { /* leave data null — empty state shown */ })
      .finally(() => { setDuprLoading(false); });
  }, [activeTab, slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-4" />
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold mb-2">{t("clubNotFound")}</h1>
        <Link href="/clubs" className="text-primary hover:underline">{t("clubBackToList")}</Link>
      </div>
    );
  }

  const todaySessions = club.sessions.filter(
    (s) => s.scrapedDate === vnCalendarDateString(0),
  );
  const recentStats = club.dailyStats.slice(0, 7);
  const avgFillRate = recentStats.length > 0
    ? recentStats.reduce((s, d) => s + d.avgFillRate, 0) / recentStats.length
    : 0;
  const avgFee = recentStats.length > 0
    ? recentStats.reduce((s, d) => s + d.avgFee, 0) / recentStats.length
    : 0;
  const totalSessionsWeek = recentStats.reduce((s, d) => s + d.totalSessions, 0);

  const venueLocations = todaySessions
    .filter((s) => s.venue?.latitude && s.venue?.longitude)
    .reduce(
      (acc, s) => {
        const key = `${s.venue!.latitude}-${s.venue!.longitude}`;
        if (!acc.seen.has(key)) {
          acc.seen.add(key);
          acc.pins.push({
            lat: s.venue!.latitude,
            lng: s.venue!.longitude,
            label: s.venue!.name,
            fillRate: 0.5,
            price: formatVND(s.feeAmount),
            popup: `<strong>${s.venue!.name}</strong>`,
          });
        }
        return acc;
      },
      { seen: new Set<string>(), pins: [] as { lat: number; lng: number; label: string; fillRate: number; price: string; popup: string }[] }
    ).pins;

  const priceRange = todaySessions.length > 0
    ? {
        min: Math.min(...todaySessions.map((s) => s.feeAmount)),
        max: Math.max(...todaySessions.map((s) => s.feeAmount)),
      }
    : null;

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
      <Link href="/clubs" className="text-sm text-muted hover:text-primary mb-4 inline-flex items-center min-h-[44px]">
        {t("clubBackToClubs")}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{club.name}</h1>
          <p className="text-sm text-muted mt-1">
            {club.numMembers.toLocaleString()} {t("clubMembers")}
          </p>
        </div>
        <a
          href={`https://reclub.co/clubs/@${club.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium bg-primary text-white px-4 py-2.5 rounded-lg hover:bg-primary-dark transition min-h-[44px] text-center w-full sm:w-auto shrink-0"
        >
          {t("clubViewOnReclub")}
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Stat label={t("clubSessionsWeek")} value={totalSessionsWeek.toString()} />
        <Stat label={t("clubAvgFillRate")} value={`${Math.round(avgFillRate * 100)}%`} />
        <Stat label={t("clubAvgPrice")} value={formatVND(Math.round(avgFee))} />
        <Stat
          label={t("clubPriceRange")}
          value={priceRange ? `${formatVND(priceRange.min)} - ${formatVND(priceRange.max)}` : "N/A"}
        />
      </div>

      {venueLocations.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">{t("clubVenues")}</h2>
          <MapView pins={venueLocations} zoom={13} className="h-[50dvh] sm:h-[600px] w-full" />
        </div>
      )}

      <div className="flex gap-2 mb-4 border-b border-card-border">
        {(["sessions", "dupr", "more"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px min-h-[44px] ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab === "sessions"
              ? `${t("clubTabSessions")} (${todaySessions.length})`
              : tab === "dupr"
              ? t("clubTabDupr")
              : t("clubTabMore")}
          </button>
        ))}
      </div>

      {activeTab === "dupr" && (
        <DuprTab loading={duprLoading} data={duprData} t={t} />
      )}

      {activeTab === "sessions" && (
        <div>
          {todaySessions.length === 0 ? (
            <p className="text-sm text-muted py-4">{t("clubNoSessionsToday")}</p>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((s) => {
                const snap = s.snapshots[0];
                const joined = snap?.joined ?? 0;
                const waitlisted = snap?.waitlisted ?? 0;
                return (
                  <div
                    key={s.id}
                    className="rounded-lg border border-card-border bg-card p-3"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-center min-w-[60px] shrink-0">
                        <div className="text-sm font-bold">{s.startTime}</div>
                        <div className="text-xs text-muted">{s.durationMin}min</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {s.venue && <p className="text-xs text-muted truncate">📍 {s.venue.name}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <SessionScoreBadge
                          className="max-w-[min(160px,45vw)]"
                          input={{
                            confirmedPlayers: joined,
                            capacity: s.maxPlayers,
                            priceVnd: s.feeAmount,
                            durationMinutes: s.durationMin,
                            hasZalo: Boolean(club.zaloUrl),
                            hcmMedianCostPerHour:
                              typeof club.hcmMedianCostPerHour === "number" &&
                              !Number.isNaN(club.hcmMedianCostPerHour)
                                ? club.hcmMedianCostPerHour
                                : HCM_MEDIAN_COST_FALLBACK,
                            sessionType: parseSessionType(s.name),
                            duprParticipationPct: s.duprParticipationPct,
                          }}
                        />
                        <span className="text-right text-sm font-bold">
                          {formatVND(s.feeAmount)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1">
                        <FillRateBar joined={joined} maxPlayers={s.maxPlayers} waitlisted={waitlisted} showLabel={false} />
                      </div>
                      <a
                        href={s.eventUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline whitespace-nowrap min-h-[44px] flex items-center"
                      >
                        {t("clubBook")}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "more" && (
        <div className="space-y-5">
          {(club.zaloUrl || club.phone) && (
            <div className="rounded-lg border border-card-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">{t("clubContact")}</h3>
              <div className="space-y-2">
                {club.zaloUrl && (
                  <a
                    href={club.zaloUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">Z</span>
                    <span className="truncate">{club.zaloUrl}</span>
                  </a>
                )}
                {club.phone && (
                  <a
                    href={`tel:${club.phone}`}
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </span>
                    <span>{club.phone}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {club.admins.length > 0 && (
            <div className="rounded-lg border border-card-border bg-card p-4">
              <h3 className="font-semibold text-sm mb-3">{t("clubAdmins")} ({club.admins.length})</h3>
              <div className="flex flex-wrap gap-2">
                {club.admins.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-sm"
                  >
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </span>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!club.zaloUrl && !club.phone && club.admins.length === 0 && (
            <p className="text-sm text-muted py-4 text-center">{t("clubNoAdditionalInfo")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-card-border bg-card p-3 text-center">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

// ── DUPR Levels tab ───────────────────────────────────────────────────────────

function getBucketColor(bucketValue: number): string {
  const t = Math.min(Math.max((bucketValue - 2.0) / (6.0 - 2.0), 0), 1);
  if (t < 0.25) return "#60a5fa";
  if (t < 0.5)  return "#34d399";
  if (t < 0.75) return "#f97316";
  return "#ef4444";
}

/** Re-bucket raw 0.1 buckets into 0.5-wide groups, client-side. */
function aggregateBuckets(
  raw: { bucket: string; count: number }[],
  bucketSize: 0.1 | 0.5,
): { bucket: string; count: number }[] {
  if (bucketSize === 0.1) return raw;
  const merged = new Map<string, number>();
  for (const { bucket, count } of raw) {
    const val = parseFloat(bucket);
    const key = (Math.floor(val / 0.5) * 0.5).toFixed(1);
    merged.set(key, (merged.get(key) ?? 0) + count);
  }
  return [...merged.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => parseFloat(a.bucket) - parseFloat(b.bucket));
}

function DuprTab({ loading, data, t }: { loading: boolean; data: ClubDuprDistribution | null; t: (k: import("@/lib/i18n").TranslationKey) => string }) {
  const [detail, setDetail] = useState(false);
  const bucketSize: 0.1 | 0.5 = detail ? 0.1 : 0.5;

  if (loading) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-16 h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0" />
            <div className="w-[52px] shrink-0" />
            <div className="flex-1 h-6 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="w-8 h-4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.totalRatedPlayers < 10) {
    return (
      <div className="py-10 text-center text-sm text-muted">
        {t("clubDuprNotEnoughData")}
      </div>
    );
  }

  const { totalRatedPlayers, medianDupr } = data;
  const buckets = aggregateBuckets(data.buckets, bucketSize);
  const maxCount = Math.max(...buckets.map((b) => b.count));

  const medianBucket =
    medianDupr != null
      ? [...buckets]
          .filter((b) => parseFloat(b.bucket) <= medianDupr + bucketSize / 2)
          .at(-1)?.bucket ?? null
      : null;

  return (
    <div>
      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <Stat label={t("clubDuprRatedPlayers")} value={totalRatedPlayers.toLocaleString()} />
        <Stat label={t("clubDuprMedian")} value={medianDupr != null ? medianDupr.toFixed(1) : "—"} />
      </div>

      {/* Chart card */}
      <div className="rounded-lg border border-card-border bg-card p-4">
        {/* Toggle */}
        <div className="flex justify-end mb-3">
          <div className="inline-flex rounded-lg border border-card-border text-xs overflow-hidden">
            <button
              onClick={() => setDetail(false)}
              className={`px-3 py-1.5 transition ${!detail ? "bg-primary text-white font-semibold" : "text-muted hover:text-foreground"}`}
            >
              {t("clubDuprOverview")}
            </button>
            <button
              onClick={() => setDetail(true)}
              className={`px-3 py-1.5 transition border-l border-card-border ${detail ? "bg-primary text-white font-semibold" : "text-muted hover:text-foreground"}`}
            >
              {t("clubDuprDetail")}
            </button>
          </div>
        </div>

        {/* Bars */}
        <div className="space-y-1.5">
          {buckets.map(({ bucket, count }) => {
            const bucketVal = parseFloat(bucket);
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const hi = (bucketVal + bucketSize).toFixed(1);
            const isMedian = bucket === medianBucket;
            const color = getBucketColor(bucketVal);

            return (
              <div key={bucket} className="flex items-center gap-2">
                <span className="w-[68px] shrink-0 text-right text-xs text-muted tabular-nums">
                  {bucket}–{hi}
                </span>
                {isMedian ? (
                  <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
                    {t("clubDuprMedianBadge")}
                  </span>
                ) : (
                  <span className="w-[52px] shrink-0" />
                )}
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-[36px] shrink-0 text-xs tabular-nums text-right text-muted">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
