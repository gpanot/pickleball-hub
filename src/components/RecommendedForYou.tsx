"use client";

import { useEffect, useState, useCallback } from "react";
import { useProfileStore } from "@/store/profileStore";
import { useI18n } from "@/lib/i18n";
import { SessionCardSkeleton } from "@/components/SessionCardSkeleton";
import { OnboardingQnA } from "@/components/OnboardingQnA";
import type { PlayerPreferences } from "@/store/profileStore";
import { haversineKm, formatDistanceKm, formatVND, parseSessionType } from "@/lib/utils";
import { computeSessionScore, getScoreLabel, HCM_MEDIAN_COST_FALLBACK } from "@/lib/scoring";
import type { TranslationKey } from "@/lib/i18n";

interface RecommendedSession {
  id: number;
  referenceCode: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  maxPlayers: number;
  feeAmount: number;
  costPerHour: number | null;
  status: string;
  perks: string[];
  eventUrl: string;
  joined: number;
  waitlisted: number;
  fillRate: number;
  duprParticipationPct?: number | null;
  club: { name: string; slug: string; zaloUrl?: string | null };
  venue: { name: string; address: string; latitude?: number; longitude?: number } | null;
  matchReasons: string[];
}

interface RecommendedForYouProps {
  date: string;
  userLocation: { lat: number; lng: number } | null;
  onSessionClick: (session: RecommendedSession) => void;
}

function prefLabel(
  prefs: PlayerPreferences,
  t: (k: TranslationKey) => string,
): string {
  const timeMap: Record<PlayerPreferences["timeSlots"], TranslationKey> = {
    weekday_evenings: "recommendedTimeSlotsWeekdayEvenings",
    weekends: "recommendedTimeSlotsWeekends",
    weekday_mornings: "recommendedTimeSlotsWeekdayMornings",
    weekday_afternoons: "recommendedTimeSlotsWeekdayAfternoons",
    weekend_evenings: "recommendedTimeSlotsWeekendEvenings",
  };
  const levelMap: Record<PlayerPreferences["level"], TranslationKey> = {
    casual: "recommendedLevelCasual",
    intermediate: "recommendedLevelIntermediate",
    competitive: "recommendedLevelCompetitive",
  };
  const travelMap: Record<PlayerPreferences["travelTime"], TranslationKey> = {
    "10min": "recommendedTravelTime10min",
    "15min": "recommendedTravelTime15min",
    any: "recommendedTravelTimeAny",
  };
  return [
    t(timeMap[prefs.timeSlots]),
    t(levelMap[prefs.level]),
    t(travelMap[prefs.travelTime]),
  ].join(" · ");
}

/** Compact inline score pill (no popover, just the number + tier colour). */
function ScorePill({ session }: { session: RecommendedSession }) {
  const scoreInput = {
    confirmedPlayers: session.joined,
    capacity: session.maxPlayers,
    priceVnd: session.feeAmount,
    durationMinutes: session.durationMin,
    hasZalo: Boolean(session.club.zaloUrl),
    hcmMedianCostPerHour: HCM_MEDIAN_COST_FALLBACK,
    sessionType: parseSessionType(session.name),
    duprParticipationPct: session.duprParticipationPct,
  };
  const result = computeSessionScore(scoreInput);
  const { color } = getScoreLabel(result.score);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
      style={{ borderColor: color, color, backgroundColor: `${color}18` }}
      aria-label={`Score ${result.score}`}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.39 7.26h7.72l-6.25 4.54 2.39 7.26-6.25-4.54-6.25 4.54 2.39-7.26-6.25-4.54h7.72L12 2z" />
      </svg>
      {result.score}
    </span>
  );
}

export function RecommendedForYou({ date, userLocation, onSessionClick }: RecommendedForYouProps) {
  const { t } = useI18n();
  const {
    hasCompletedOnboarding,
    preferences,
    profileId,
    setPreferences,
    completeOnboarding,
    logClickedSession,
  } = useProfileStore();

  const [sessions, setSessions] = useState<RecommendedSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);

  const fetchRecommendations = useCallback(
    async (prefs: PlayerPreferences, pid: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ date });
        if (pid) params.set("profileId", pid);
        params.set("timeSlots", prefs.timeSlots);
        params.set("level", prefs.level);
        params.set("travelTime", prefs.travelTime);
        if (userLocation) {
          params.set("lat", String(userLocation.lat));
          params.set("lng", String(userLocation.lng));
        }
        const res = await fetch(`/api/sessions/recommended?${params}`);
        if (res.ok) {
          const data = (await res.json()) as { sessions: RecommendedSession[] };
          setSessions(data.sessions ?? []);
        }
      } catch {
        setSessions([]);
      } finally {
        setLoading(false);
      }
    },
    [date, userLocation],
  );

  useEffect(() => {
    if (hasCompletedOnboarding && preferences && !editing) {
      void fetchRecommendations(preferences, profileId);
    }
  }, [hasCompletedOnboarding, preferences, profileId, fetchRecommendations, editing]);

  const handleOnboardingComplete = useCallback(
    (prefs: Omit<PlayerPreferences, "clickedSessions" | "visitCount">) => {
      setPreferences(prefs);
      completeOnboarding();
      setEditing(false);
      setCollapsed(false);
      void fetchRecommendations(
        { ...prefs, clickedSessions: [], visitCount: 0 },
        profileId,
      );
    },
    [setPreferences, completeOnboarding, fetchRecommendations, profileId],
  );

  const handleCardClick = useCallback(
    (s: RecommendedSession) => {
      logClickedSession(s.referenceCode);
      onSessionClick(s);
    },
    [logClickedSession, onSessionClick],
  );

  const showOnboarding = !hasCompletedOnboarding || editing;

  return (
    <section className="mb-4 min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {t("recommendedForYou")}
        </h2>
        {hasCompletedOnboarding && !editing && (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-card-border bg-card text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("recommendedExpand") : t("recommendedCollapse")}
          >
            {collapsed ? "▼" : "▲"}
          </button>
        )}
      </div>

      <div
        className="overflow-hidden transition-[max-height] duration-300 ease"
        style={{ maxHeight: collapsed ? 0 : 3000 }}
      >
        {showOnboarding ? (
          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <OnboardingQnA onComplete={handleOnboardingComplete} />
          </div>
        ) : loading ? (
          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[min(280px,calc(100vw-3rem))] shrink-0">
                <SessionCardSkeleton />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-2 text-xs text-muted">{t("recommendedEmpty")}</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sessions.map((s) => {
              const spotsLeft = Math.max(0, s.maxPlayers - s.joined);
              const distKm =
                userLocation &&
                s.venue?.latitude != null &&
                s.venue?.longitude != null
                  ? haversineKm(
                      userLocation.lat,
                      userLocation.lng,
                      s.venue.latitude,
                      s.venue.longitude,
                    )
                  : null;

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleCardClick(s)}
                  className="flex w-[min(280px,calc(100vw-3rem))] shrink-0 flex-col rounded-xl border border-card-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  {/* Top row: time pill + score + spots left */}
                  <div className="mb-1 flex flex-wrap items-center gap-1">
                    <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {s.startTime} – {s.endTime}
                    </span>
                    <ScorePill session={s} />
                    {spotsLeft > 0 && spotsLeft <= 5 && (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        {spotsLeft} {t("recommendedSpotsLeft")}
                      </span>
                    )}
                  </div>

                  <span className="line-clamp-2 text-sm font-semibold leading-snug">
                    {s.name}
                  </span>

                  {/* Match reason pill */}
                  {s.matchReasons.length > 0 && (
                    <span className="mt-1 inline-flex self-start rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                      {s.matchReasons[0]}
                    </span>
                  )}

                  <span className="mt-1 text-xs text-muted">{s.club.name}</span>
                  {s.venue && (
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted/90">
                      📍 {s.venue.name}
                    </span>
                  )}

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold tabular-nums text-foreground">
                      {formatVND(s.feeAmount)}
                    </span>
                    {distKm !== null && (
                      <span className="text-xs font-medium text-primary">
                        {formatDistanceKm(distKm)} {t("recommendedAway")}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Profile summary / edit card — always last */}
            {preferences && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex w-[min(200px,calc(100vw-3rem))] shrink-0 flex-col items-start justify-between rounded-xl border border-dashed border-card-border bg-card/60 p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-card hover:shadow-md"
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {t("recommendedBasedOn")}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary" aria-hidden>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </div>
                <p className="mt-2 text-xs leading-snug text-foreground">
                  {prefLabel(preferences, t)}
                </p>
                <span className="mt-3 text-[11px] font-semibold text-primary">
                  {t("recommendedTapToEdit")} →
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
