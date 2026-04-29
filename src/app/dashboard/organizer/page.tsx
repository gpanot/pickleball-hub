"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  SELECTED_CLUB_KEY,
  setOrganizerUnlocked,
  isOrganizerUnlocked,
  clearOrganizerSession,
} from "@/lib/dashboard-session";
import { formatVND } from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";
import { mouseflowTag } from "@/lib/analytics";
import { useI18n } from "@/lib/i18n";

type ClubOption = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
  totalSessionsWeek: number;
  /** Present on /api/clubs payload (used for preview + rivals). */
  sessionsToday?: number;
  totalJoined?: number;
  totalCapacity?: number;
  avgFee?: number;
  avgFeeToday?: number;
  revenueEstimate?: number;
};

type PreviewClub = {
  id: number;
  name: string;
  numMembers: number;
  sessionsToday: number;
  totalJoined: number;
  totalCapacity: number;
  avgFeeToday: number;
  revenueEstimate: number;
};

function AnimatedCounter({ target, suffix = "" }: { target: string; suffix?: string }) {
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
    <span
      ref={ref}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
    >
      {target}{suffix}
    </span>
  );
}

export default function OrganizerGatePage() {
  const { t } = useI18n();
  const [clubs, setClubs] = useState<ClubOption[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [previewClubs, setPreviewClubs] = useState<PreviewClub[]>([]);
  const router = useRouter();

  const VALUE_PROPS = [
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M7 16l4-6 4 4 5-8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("orgVp1Title"),
      desc: t("orgVp1Desc"),
      stat: "75%",
      statLabel: t("orgVp1StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("orgVp2Title"),
      desc: t("orgVp2Desc"),
      stat: "8+",
      statLabel: t("orgVp2StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("orgVp3Title"),
      desc: t("orgVp3Desc"),
      stat: "24/7",
      statLabel: t("orgVp3StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("orgVp4Title"),
      desc: t("orgVp4Desc"),
      stat: "#1",
      statLabel: t("orgVp4StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      title: t("orgVp5Title"),
      desc: t("orgVp5Desc"),
      stat: "2x",
      statLabel: t("orgVp5StatLabel"),
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-7 w-7">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: t("orgVp6Title"),
      desc: t("orgVp6Desc"),
      stat: "5v5",
      statLabel: t("orgVp6StatLabel"),
    },
  ];

  useEffect(() => { setUnlocked(isOrganizerUnlocked()); }, []);

  useEffect(() => {
    if (!unlocked) return;
    const saved = localStorage.getItem(SELECTED_CLUB_KEY);
    if (saved) setSelectedClubId(saved);
  }, [unlocked]);

  useLayoutEffect(() => {
    const url = "/api/clubs";
    const applyPayload = (all: ClubOption[]) => {
      const sorted = [...all]
        .filter((c) => c.numMembers >= 12)
        .sort((a, b) => a.name.localeCompare(b.name));
      setClubs(sorted);
      const top5 = [...all]
        .sort((a, b) => (b.totalJoined ?? 0) - (a.totalJoined ?? 0))
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          name: c.name,
          numMembers: c.numMembers,
          sessionsToday: c.sessionsToday ?? 0,
          totalJoined: c.totalJoined ?? 0,
          totalCapacity: c.totalCapacity ?? 0,
          avgFeeToday: c.avgFeeToday ?? c.avgFee ?? 0,
          revenueEstimate: c.revenueEstimate ?? 0,
        }));
      setPreviewClubs(top5);
    };

    const cached = readPublicApiCache<{ clubs: ClubOption[] }>(url);
    if (cached) {
      applyPayload(cached.clubs || []);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPublicApiJson<{ clubs: ClubOption[] }>(url)
      .then((d) => {
        if (cancelled) return;
        applyPayload(d.clubs || []);
      })
      .catch(() => {
        if (!cancelled) setClubs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError("");
    const code = accessCode.trim();
    if (!code) { setVerifyError(t("orgErrEnterCode")); return; }
    setVerifying(true);
    try {
      const res = await fetch("/api/dashboard/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.error || t("orgErrInvalidCode")); return; }
      if (data.entityType !== "club" || data.clubId == null) {
        setVerifyError(t("orgErrNotOrgCode"));
        return;
      }
      setOrganizerUnlocked();
      mouseflowTag("user_type:organizer");
      setUnlocked(true);
      setSelectedClubId(String(data.clubId));
      localStorage.setItem(SELECTED_CLUB_KEY, String(data.clubId));
      setAccessCode("");
    } catch {
      setVerifyError(t("orgErrVerifyFailed"));
    } finally {
      setVerifying(false);
    }
  }

  function handleSelect(val: string) {
    setSelectedClubId(val);
    if (val) localStorage.setItem(SELECTED_CLUB_KEY, val);
    else localStorage.removeItem(SELECTED_CLUB_KEY);
  }

  function handleGo() {
    if (!selectedClubId) return;
    localStorage.setItem(SELECTED_CLUB_KEY, selectedClubId);
    router.push(`/dashboard/organizer/${selectedClubId}`);
  }

  function handleLogout() {
    clearOrganizerSession();
    setUnlocked(false);
    setSelectedClubId("");
    setClubs([]);
    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100dvh-56px)]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 py-14 sm:py-20 lg:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full bg-primary/10 blur-3xl animate-pulse" />
          <div className="absolute -left-20 bottom-0 h-[300px] w-[300px] rounded-full bg-accent/10 blur-3xl animate-pulse [animation-delay:1s]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary mb-6 animate-[fadeInUp_0.6s_ease-out_both]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            {t("orgLiveDataBadge")}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-4 animate-[fadeInUp_0.6s_ease-out_0.1s_both]">
            {t("orgHeroTitle")}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
              {t("orgHeroTitleHighlight")}
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted mb-8 animate-[fadeInUp_0.6s_ease-out_0.2s_both]">
            {t("orgHeroSubtitle")}
          </p>

          {/* Animated stats row */}
          <div className="mx-auto mb-10 flex max-w-md items-center justify-around gap-4 animate-[fadeInUp_0.6s_ease-out_0.35s_both]">
            {[
              { val: "90+", label: t("orgStatSessionsTracked") },
              { val: "27", label: t("orgStatClubsAnalyzed") },
              { val: "3k+", label: t("orgStatPlayersDaily") },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-primary">
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
                  <h2 className="text-lg font-bold mb-1">{t("orgUnlockTitle")}</h2>
                  <p className="text-xs text-muted mb-5">{t("orgUnlockSubtitle")}</p>
                  <form onSubmit={handleVerify} className="space-y-3 text-left">
                    <input
                      id="org-code"
                      type="text"
                      autoComplete="off"
                      placeholder={t("orgAccessCodePlaceholder")}
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      className="w-full rounded-xl border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                    />
                    {verifyError ? <p className="text-sm text-red-600 dark:text-red-400">{verifyError}</p> : null}
                    <button
                      type="submit"
                      disabled={verifying}
                      className="w-full rounded-xl bg-gradient-to-r from-primary to-emerald-500 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition disabled:opacity-50"
                    >
                      {verifying ? t("orgVerifying") : t("orgUnlockBtn")}
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
                  <h2 className="text-lg font-bold mb-1">{t("orgSelectClubTitle")}</h2>
                  <select
                    value={selectedClubId}
                    onChange={(e) => handleSelect(e.target.value)}
                    className="w-full rounded-xl border border-card-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  >
                    <option value="">{t("orgChooseClub")}</option>
                    {clubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.numMembers} {t("orgMembers")})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleGo}
                    disabled={!selectedClubId}
                    className="w-full rounded-xl bg-gradient-to-r from-primary to-emerald-500 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition disabled:opacity-50"
                  >
                    {t("orgOpenDashboard")}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full rounded-xl border border-card-border bg-background py-2.5 text-xs font-medium text-muted hover:text-foreground hover:border-primary/40 transition"
                  >
                    {t("orgLogout")}
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
              {t("orgValuePropsTitle")}{" "}
              <span className="text-primary">{t("orgValuePropsTitleHighlight")}</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm sm:text-base text-muted">
              {t("orgValuePropsSubtitle")}
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_PROPS.map((vp, i) => (
              <div
                key={vp.title}
                className="group relative overflow-hidden rounded-2xl border border-card-border bg-card p-5 sm:p-6 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-150" />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                      {vp.icon}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-primary leading-none">
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

      {/* Live sneak peek — Top 5 clubs */}
      <section className="py-12 sm:py-16 bg-gradient-to-b from-background via-primary/5 to-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
              {t("orgPreviewTitle")} <span className="text-primary">{t("orgPreviewTitleHighlight")}</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted">
              {t("orgPreviewSubtitle")}
            </p>
          </div>

          <div className="rounded-2xl border border-card-border bg-card/60 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="border-b border-card-border bg-card/80 px-5 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-muted ml-2">{t("orgPreviewTableHeader")}</span>
            </div>
            <div className="p-4 sm:p-6">
              {previewClubs.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse h-10 bg-gray-200 dark:bg-gray-800 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-muted">
                        <th className="text-left py-2.5 pr-2 font-medium w-8">#</th>
                        <th className="text-left py-2.5 pr-3 font-medium">Club</th>
                        <th className="text-center py-2.5 px-2 font-medium hidden sm:table-cell">{t("orgPreviewColMembers")}</th>
                        <th className="text-center py-2.5 px-2 font-medium">{t("orgPreviewColSessions")}</th>
                        <th className="text-center py-2.5 px-2 font-medium">{t("orgPreviewColPlayers")}</th>
                        <th className="text-center py-2.5 px-2 font-medium hidden sm:table-cell">{t("orgPreviewColFillRate")}</th>
                        <th className="text-center py-2.5 px-2 font-medium hidden sm:table-cell">{t("orgPreviewColAvgPrice")}</th>
                        <th className="text-right py-2.5 pl-2 font-medium">{t("orgPreviewColRevenue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewClubs.map((c, i) => {
                        const fillRate = c.totalCapacity > 0 ? c.totalJoined / c.totalCapacity : 0;
                        return (
                          <tr key={c.id} className="border-b border-card-border/50 transition hover:bg-primary/5">
                            <td className="py-2.5 pr-2 text-muted font-medium">{i + 1}</td>
                            <td className="py-2.5 pr-3 font-medium truncate max-w-[140px] sm:max-w-none">{c.name}</td>
                            <td className="text-center py-2.5 px-2 hidden sm:table-cell">{c.numMembers.toLocaleString()}</td>
                            <td className="text-center py-2.5 px-2">{c.sessionsToday}</td>
                            <td className="text-center py-2.5 px-2 tabular-nums">
                              <span className="font-semibold text-primary">{c.totalJoined}</span>
                              <span className="text-muted">/{c.totalCapacity}</span>
                            </td>
                            <td className="text-center py-2.5 px-2 hidden sm:table-cell">{Math.round(fillRate * 100)}%</td>
                            <td className="text-center py-2.5 px-2 hidden sm:table-cell">{formatVND(c.avgFeeToday)}</td>
                            <td className="text-right py-2.5 pl-2 font-semibold">{formatVND(c.revenueEstimate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-center text-xs text-muted mt-4 flex items-center justify-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                {t("orgPreviewLiveNote")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mock dashboard preview */}
      <section className="py-12 sm:py-16 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
              {t("orgMockTitle")} <span className="text-primary">{t("orgMockTitleHighlight")}</span>
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted">
              {t("orgMockSubtitle")}
            </p>
          </div>

          <div className="rounded-2xl border border-card-border bg-card/60 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="border-b border-card-border bg-card/80 px-5 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-400" />
                <div className="h-3 w-3 rounded-full bg-amber-400" />
                <div className="h-3 w-3 rounded-full bg-green-400" />
              </div>
              <span className="text-xs text-muted ml-2">organizer-dashboard.hcm-pickleball.app</span>
            </div>
            <div className="p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-4 mb-5">
                {[
                  { label: t("orgMockKpiSessions"), val: "6", color: "text-primary" },
                  { label: t("orgMockKpiPlayers"), val: "124", color: "text-primary" },
                  { label: t("orgMockKpiFillRate"), val: "82%", color: "text-emerald-500" },
                  { label: t("orgMockKpiRevenue"), val: "9.8M VND", color: "text-amber-500" },
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
                <div className="text-xs font-semibold mb-3">{t("orgMockChartTitle")}</div>
                <div className="flex items-end gap-1.5 h-20">
                  {[45, 60, 52, 70, 85, 78, 92].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t transition-all duration-700" style={{ height: `${h}%`, background: `linear-gradient(to top, rgb(16 185 129 / ${0.4 + (h / 200)}), rgb(16 185 129 / ${0.15 + (h / 400)}))`, animationDelay: `${i * 100}ms` }} />
                  ))}
                </div>
                <div className="flex justify-between mt-1.5 text-[9px] text-muted">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
                </div>
              </div>
              <div className="text-center text-xs text-muted">
                {t("orgMockPreviewNote")}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 sm:py-16 text-center bg-background">
        <div className="mx-auto max-w-md px-4">
          <h2 className="text-xl sm:text-2xl font-bold mb-3">{t("orgCtaTitle")}</h2>
          <p className="text-sm text-muted mb-6">
            {t("orgCtaSubtitle")}
          </p>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 transition"
          >
            {t("orgEnterCode")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M5 12h14m-7-7 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
}
