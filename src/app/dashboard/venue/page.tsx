"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  SELECTED_VENUE_KEY,
  setVenueUnlocked,
  isVenueUnlocked,
  clearVenueSession,
} from "@/lib/dashboard-session";
import { formatVND } from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";
import { useI18n } from "@/lib/i18n";

type VenueOption = {
  id: number;
  name: string;
  address: string;
  _count: { sessions: number };
};

type PreviewVenue = {
  id: number;
  name: string;
  sessionsToday: number;
  totalJoined: number;
  totalCapacity: number;
  fillRate: number;
  avgFee: number;
  revenueEstimate: number;
  uniqueClubs: number;
  activeHours: number;
};

function AnimatedCounter({ target }: { target: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <span ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
      {target}
    </span>
  );
}

export default function VenueGatePage() {
  const { t } = useI18n();
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [previewVenues, setPreviewVenues] = useState<PreviewVenue[]>([]);
  const router = useRouter();

  const VALUE_PROPS = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" strokeLinecap="round" />
        </svg>
      ),
      title: t("venueVp1Title"),
      desc: t("venueVp1Desc"),
      stat: "24h",
      statLabel: t("venueVp1StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("venueVp2Title"),
      desc: t("venueVp2Desc"),
      stat: "VND",
      statLabel: t("venueVp2StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("venueVp3Title"),
      desc: t("venueVp3Desc"),
      stat: "All",
      statLabel: t("venueVp3StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 16l4-6 4 4 5-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("venueVp4Title"),
      desc: t("venueVp4Desc"),
      stat: "7d",
      statLabel: t("venueVp4StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("venueVp5Title"),
      desc: t("venueVp5Desc"),
      stat: "Auto",
      statLabel: t("venueVp5StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
      title: t("venueVp6Title"),
      desc: t("venueVp6Desc"),
      stat: "Top",
      statLabel: t("venueVp6StatLabel"),
    },
  ];

  useEffect(() => { setUnlocked(isVenueUnlocked()); }, []);

  useEffect(() => {
    if (!unlocked) return;
    const saved = localStorage.getItem(SELECTED_VENUE_KEY);
    if (saved) setSelectedVenueId(saved);
  }, [unlocked]);

  useLayoutEffect(() => {
    let cancelled = false;
    const venuesUrl = "/api/venues";

    (async () => {
      setLoading(true);
      try {
        const vPayload =
          readPublicApiCache<{ venues: VenueOption[] }>(venuesUrl) ??
          (await fetchPublicApiJson<{ venues: VenueOption[] }>(venuesUrl));
        const all: VenueOption[] = vPayload.venues || [];
        if (cancelled) return;
        const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name));
        setVenues(sorted);

        const candidates = [...all]
          .sort((a, b) => (b._count?.sessions ?? 0) - (a._count?.sessions ?? 0))
          .slice(0, 20);
        if (candidates.length === 0) return;

        const ids = candidates.map((v) => v.id).join(",");
        const cmpUrl = `/api/dashboard/compare-venues?ids=${ids}`;
        const cPayload =
          readPublicApiCache<{ venues: PreviewVenue[] }>(cmpUrl) ??
          (await fetchPublicApiJson<{ venues: PreviewVenue[] }>(cmpUrl));
        if (cancelled) return;
        const cmpVenues: PreviewVenue[] = cPayload.venues || [];
        const with3 = cmpVenues.filter((v) => v.sessionsToday === 3);
        const pick = with3.length >= 5 ? with3.slice(0, 5) : cmpVenues.slice(0, 5);
        pick.sort((a, b) => a.name.localeCompare(b.name));
        setPreviewVenues(pick);
      } catch {
        if (!cancelled) setVenues([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError("");
    const code = accessCode.trim();
    if (!code) { setVerifyError(t("venueErrEnterCode")); return; }
    setVerifying(true);
    try {
      const res = await fetch("/api/dashboard/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.error || t("venueErrInvalidCode")); return; }
      if (data.entityType !== "venue" || data.venueId == null) {
        setVerifyError(t("venueErrNotVenueCode"));
        return;
      }
      setVenueUnlocked();
      setUnlocked(true);
      setSelectedVenueId(String(data.venueId));
      localStorage.setItem(SELECTED_VENUE_KEY, String(data.venueId));
      setAccessCode("");
    } catch {
      setVerifyError(t("venueErrVerifyFailed"));
    } finally {
      setVerifying(false);
    }
  }

  function handleSelect(val: string) {
    setSelectedVenueId(val);
    if (val) localStorage.setItem(SELECTED_VENUE_KEY, val);
    else localStorage.removeItem(SELECTED_VENUE_KEY);
  }

  function handleGo() {
    if (!selectedVenueId) return;
    localStorage.setItem(SELECTED_VENUE_KEY, selectedVenueId);
    router.push(`/dashboard/venue/${selectedVenueId}`);
  }

  function handleLogout() {
    clearVenueSession();
    setUnlocked(false);
    setSelectedVenueId("");
    setVenues([]);
    setLoading(false);
  }

  const previewMetrics: { key: keyof PreviewVenue; label: string; format: (v: number) => string; higher: boolean }[] = [
    { key: "sessionsToday", label: t("venuePreviewMetricSessions"), format: (v) => v.toString(), higher: true },
    { key: "totalJoined", label: t("venuePreviewMetricPlayers"), format: (v) => v.toLocaleString(), higher: true },
    { key: "fillRate", label: t("venuePreviewMetricFillRate"), format: (v) => `${Math.round(v * 100)}%`, higher: true },
    { key: "avgFee", label: t("venuePreviewMetricAvgPrice"), format: (v) => formatVND(v), higher: false },
    { key: "uniqueClubs", label: t("venuePreviewMetricClubs"), format: (v) => v.toString(), higher: true },
    { key: "activeHours", label: t("venuePreviewMetricActiveHours"), format: (v) => `${v}h`, higher: true },
    { key: "revenueEstimate", label: t("venuePreviewMetricRevenue"), format: (v) => formatVND(v), higher: true },
  ];

  return (
    <div className="min-h-[calc(100dvh-56px)]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-background to-accent/5 py-14 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-accent/10 blur-3xl animate-pulse" />
          <div className="absolute -left-20 bottom-0 h-[300px] w-[300px] rounded-full bg-primary/10 blur-3xl animate-pulse [animation-delay:1.5s]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent mb-6 animate-[fadeInUp_0.6s_ease-out_both]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {t("venueLiveDataBadge")}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-4 animate-[fadeInUp_0.6s_ease-out_0.1s_both]">
            {t("venueHeroTitle")}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-amber-400">
              {t("venueHeroTitleHighlight")}
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted mb-8 animate-[fadeInUp_0.6s_ease-out_0.2s_both]">
            {t("venueHeroSubtitle")}
          </p>

          {/* Stats */}
          <div className="mx-auto mb-10 flex max-w-md items-center justify-around gap-4 animate-[fadeInUp_0.6s_ease-out_0.35s_both]">
            {[
              { val: "40+", label: t("venueStatVenuesTracked") },
              { val: "90+", label: t("venueStatSessionsDay") },
              { val: "3k+", label: t("venueStatPlayersDay") },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-accent">
                  <AnimatedCounter target={s.val} />
                </div>
                <div className="text-[11px] sm:text-xs text-muted mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ACCESS / SELECTOR CARD */}
          <div className="mx-auto max-w-md animate-[fadeInUp_0.6s_ease-out_0.45s_both]">
            <div className="rounded-2xl border border-card-border bg-card/80 backdrop-blur-lg shadow-xl p-5 sm:p-8">
              {!unlocked ? (
                <>
                  <h2 className="text-lg font-bold mb-1">{t("venueUnlockTitle")}</h2>
                  <p className="text-xs text-muted mb-5">{t("venueUnlockSubtitle")}</p>
                  <form onSubmit={handleVerify} className="space-y-3 text-left">
                    <input
                      id="venue-code"
                      type="text"
                      autoComplete="off"
                      placeholder={t("venueAccessCodePlaceholder")}
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      className="w-full rounded-xl border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
                    />
                    {verifyError ? <p className="text-sm text-red-600 dark:text-red-400">{verifyError}</p> : null}
                    <button
                      type="submit"
                      disabled={verifying}
                      className="w-full rounded-xl bg-gradient-to-r from-accent to-amber-500 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition disabled:opacity-50"
                    >
                      {verifying ? t("venueVerifying") : t("venueUnlockBtn")}
                    </button>
                  </form>
                </>
              ) : loading ? (
                <div className="space-y-3">
                  <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded-xl" />
                  <div className="animate-pulse h-12 bg-gray-200 dark:bg-gray-800 rounded-xl" />
                </div>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold mb-1">{t("venueSelectTitle")}</h2>
                  <select
                    value={selectedVenueId}
                    onChange={(e) => handleSelect(e.target.value)}
                    className="w-full rounded-xl border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
                  >
                    <option value="">{t("venueChooseVenue")}</option>
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v._count?.sessions ?? 0} {t("venueSessionsCount")})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleGo}
                    disabled={!selectedVenueId}
                    className="w-full rounded-xl bg-gradient-to-r from-accent to-amber-500 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition disabled:opacity-50"
                  >
                    {t("venueOpenDashboard")}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-xl border border-card-border bg-background py-2.5 text-xs font-medium text-muted hover:text-foreground hover:border-accent/40 transition"
                  >
                    {t("venueLogout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Value propositions grid */}
      <section className="py-12 sm:py-16 lg:py-20 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center mb-10 sm:mb-14">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
              {t("venueValuePropsTitle")}{" "}
              <span className="text-accent">{t("venueValuePropsTitleHighlight")}</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-muted">
              {t("venueValuePropsSubtitle")}
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_PROPS.map((vp, i) => (
              <div
                key={vp.title}
                className="group relative overflow-hidden rounded-2xl border border-card-border bg-card p-5 sm:p-6 transition hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/5 transition-transform duration-500 group-hover:scale-150" />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition group-hover:bg-accent group-hover:text-white">
                      {vp.icon}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-accent leading-none">
                        <AnimatedCounter target={vp.stat} />
                      </div>
                      <div className="text-[10px] text-muted">{vp.statLabel}</div>
                    </div>
                  </div>
                  <h3 className="text-sm font-bold mb-1.5">{vp.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{vp.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live sneak peek — Venue Comparison */}
      <section className="py-12 sm:py-16 bg-gradient-to-b from-background via-accent/5 to-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
              {t("venuePreviewTitle")}{" "}
              <span className="text-accent">{t("venuePreviewTitleHighlight")}</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted">
              {t("venuePreviewSubtitle")}
            </p>
          </div>

          <div className="rounded-2xl border border-card-border bg-card/60 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="border-b border-card-border bg-card/80 px-5 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-muted ml-2">{t("venuePreviewTableHeader")}</span>
            </div>
            <div className="p-4 sm:p-6">
              {previewVenues.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="animate-pulse h-8 bg-gray-200 dark:bg-gray-800 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-card-border">
                        <th className="text-left py-2 pr-3 font-medium text-muted">Metric</th>
                        {previewVenues.map((v) => (
                          <th key={v.id} className="text-center py-2 px-2 font-medium text-foreground">
                            {v.name.length > 18 ? v.name.slice(0, 16) + "..." : v.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewMetrics.map((m) => {
                        const values = previewVenues.map((v) => v[m.key] as number);
                        const best = m.higher ? Math.max(...values) : Math.min(...values);
                        return (
                          <tr key={m.key} className="border-b border-card-border/50">
                            <td className="py-2 pr-3 text-muted font-medium">{m.label}</td>
                            {previewVenues.map((v) => {
                              const val = v[m.key] as number;
                              const isBest = val === best && values.filter((x) => x === best).length === 1;
                              return (
                                <td key={v.id} className={`text-center py-2 px-2 font-semibold ${isBest ? "text-green-600 dark:text-green-400" : ""}`}>
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
              )}
              <div className="text-center text-xs text-muted mt-4 flex items-center justify-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                </span>
                {t("venuePreviewLiveNote")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mock utilization heatmap preview */}
      <section className="py-12 sm:py-16 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
              {t("venueMockTitle")} <span className="text-accent">{t("venueMockTitleHighlight")}</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted">
              {t("venueMockSubtitle")}
            </p>
          </div>

          <div className="rounded-2xl border border-card-border bg-card/60 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="border-b border-card-border bg-card/80 px-5 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-muted ml-2">venue-dashboard.hcm-pickleball.app</span>
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-4 mb-5">
                {[
                  { label: t("venueMockKpiSessions"), val: "12", color: "text-accent" },
                  { label: t("venueMockKpiClubs"), val: "4", color: "text-accent" },
                  { label: t("venueMockKpiUtilization"), val: "68%", color: "text-emerald-500" },
                  { label: t("venueMockKpiTraffic"), val: "840", color: "text-amber-500" },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl border border-card-border bg-background p-3 sm:p-4">
                    <div className="text-[10px] sm:text-xs text-muted mb-1">{m.label}</div>
                    <div className={`text-lg sm:text-xl font-bold ${m.color}`}>
                      <AnimatedCounter target={m.val} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-card-border bg-background p-4 mb-4">
                <div className="text-xs font-semibold mb-3">{t("venueMockHeatmapTitle")}</div>
                <div className="grid grid-cols-12 gap-1">
                  {[
                    [10, 15, 30, 80, 95, 90, 85, 60, 30, 45, 70, 20],
                    [5, 10, 25, 75, 90, 95, 80, 55, 35, 50, 65, 15],
                  ].map((row, ri) => (
                    <div key={ri} className="contents">
                      {row.map((val, ci) => (
                        <div
                          key={`${ri}-${ci}`}
                          className="h-6 rounded-sm transition-colors"
                          title={`${6 + ci}:00 - ${val}%`}
                          style={{
                            backgroundColor: val > 70 ? `rgb(245 158 11 / ${val / 100})` : val > 40 ? `rgb(16 185 129 / ${val / 100})` : `rgb(107 114 128 / ${Math.max(val, 10) / 100})`,
                          }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1.5 text-[8px] sm:text-[9px] text-muted">
                  {["6am", "7", "8", "9", "10", "11", "12pm", "1", "2", "3", "4", "5pm"].map((tt) => <span key={tt}>{tt}</span>)}
                </div>
                <div className="flex items-center gap-2 mt-2 text-[9px] text-muted">
                  <span>{t("venueMockHeatmapLow")}</span>
                  <div className="flex gap-0.5">
                    {[20, 40, 60, 80, 95].map((v) => (
                      <div key={v} className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: `rgb(245 158 11 / ${v / 100})` }} />
                    ))}
                  </div>
                  <span>{t("venueMockHeatmapHigh")}</span>
                </div>
              </div>
              <div className="text-center text-xs text-muted">
                {t("venueMockPreviewNote")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 sm:py-16 text-center bg-background">
        <div className="mx-auto max-w-md px-4">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">{t("venueCtaTitle")}</h2>
          <p className="text-sm text-muted mb-6">
            {t("venueCtaSubtitle")}
          </p>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 transition"
          >
            {t("venueEnterCode")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
}
