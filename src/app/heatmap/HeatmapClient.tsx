"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { HeatmapData, HeatmapVenue } from "@/lib/queries";
import type { GetSessionsListItem } from "@/lib/queries";
import { SessionCard } from "@/components/SessionCard";
import { useProfileStore } from "@/store/profileStore";
import { useHeatmapStore } from "@/store/heatmapStore";
import { HeatmapLoginModal } from "@/components/HeatmapLoginModal";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";

// Dynamic import — Leaflet requires browser APIs (no SSR)
const HeatmapView = dynamic(
  () => import("@/components/HeatmapView").then((m) => m.HeatmapView),
  { ssr: false, loading: () => <div className="h-[480px] w-full rounded-xl bg-card animate-pulse" /> },
);

interface Props {
  heatmapData: HeatmapData;
  sessions: GetSessionsListItem[];
  hcmMedianCostPerHour: number;
  todayStr: string;
}

const DEFAULT_DUPR = 2.9;

// ── Time-of-day filter ────────────────────────────────────────────────────────
type TimeSlot = "morning" | "afternoon" | "evening";

const TIME_RANGES: Record<TimeSlot, [string, string]> = {
  morning: ["00:00", "11:59"],
  afternoon: ["12:00", "16:59"],
  evening: ["17:00", "23:59"],
};

function sessionMatchesTimeSlots(startTime: string, activeSlots: TimeSlot[]): boolean {
  if (activeSlots.length === 0 || activeSlots.length === 3) return true;
  return activeSlots.some((slot) => {
    const [min, max] = TIME_RANGES[slot];
    return startTime >= min && startTime <= max;
  });
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function roundToBucket(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Returns all individual venue IDs that belong to coordinate groups active in the DUPR band. */
function activeVenueIds(venues: HeatmapData["venues"], selectedDupr: number): Set<string> {
  const bandMin = roundToBucket(selectedDupr - 0.1);
  const bandMax = roundToBucket(selectedDupr + 0.1);
  const ids = new Set<string>();
  for (const v of venues) {
    for (const [bucket, count] of Object.entries(v.playersByDupr)) {
      const b = parseFloat(bucket);
      if (b >= bandMin && b <= bandMax && count > 0) {
        for (const vid of v.venueIds) ids.add(vid);
        break;
      }
    }
  }
  return ids;
}

/** Count players in band for a venue (for sorting). */
function venueHeatScore(
  venue: HeatmapData["venues"][number],
  selectedDupr: number,
): number {
  const bandMin = roundToBucket(selectedDupr - 0.1);
  const bandMax = roundToBucket(selectedDupr + 0.1);
  let total = 0;
  for (const [bucket, count] of Object.entries(venue.playersByDupr)) {
    const b = parseFloat(bucket);
    if (b >= bandMin && b <= bandMax) total += count;
  }
  return total;
}

export function HeatmapClient({ heatmapData, sessions, hcmMedianCostPerHour, todayStr }: Props) {
  const { duprRange, venues, totalPlayersWithDupr } = heatmapData;
  const { t } = useI18n();

  // Auth + gate
  const { data: authSession, status: authStatus } = useSession();
  const isAuthenticated = authStatus === "authenticated";
  const freeClicksUsed = useHeatmapStore((s) => s.freeClicksUsed);
  const incrementFreeClick = useHeatmapStore((s) => s.incrementFreeClick);
  const resetGate = useHeatmapStore((s) => s.reset);
  const [showLoginModal, setShowLoginModal] = useState(false);
  // Stores a pending venue click that should be replayed after login
  const pendingClickRef = useRef<(() => void) | null>(null);

  const profileId = useProfileStore((s) => s.profileId);

  // Reset gate counter + link anonymous profile once the user logs in
  useEffect(() => {
    if (isAuthenticated) {
      resetGate();
      setShowLoginModal(false);

      // Silently link anonymous PlayerProfile to this User
      if (profileId) {
        fetch("/api/auth/link-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
        }).catch(() => { /* non-critical */ });
      }

      // Replay the pending click that triggered the modal
      if (pendingClickRef.current) {
        pendingClickRef.current();
        pendingClickRef.current = null;
      }
    }
  }, [isAuthenticated, resetGate, profileId]);

  /**
   * Called by HeatmapView before opening a popup.
   * Returns true if the click is allowed, false if gated.
   *
   * Stored in a ref so Leaflet marker listeners always call the latest version
   * even after the Zustand counter increments (avoids stale closure in useCallback).
   */
  const handleBubbleClickRef = useRef<(openPopup: () => void) => boolean>(() => true);
  handleBubbleClickRef.current = (openPopup: () => void): boolean => {
    if (isAuthenticated) return true;
    if (freeClicksUsed < 3) {
      incrementFreeClick();
      return true;
    }
    pendingClickRef.current = openPopup;
    setShowLoginModal(true);
    return false;
  };

  // Stable callback passed to HeatmapView — delegates to the always-current ref
  const handleBubbleClick = useCallback(
    (openPopup: () => void) => handleBubbleClickRef.current(openPopup),
    [], // intentionally empty — ref holds the live logic
  );

  const defaultDupr = useMemo(() => {
    return clamp(DEFAULT_DUPR, duprRange.min, duprRange.max);
  }, [duprRange]);

  const [selectedDupr, setSelectedDupr] = useState(defaultDupr);
  const [hydrated, setHydrated] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<HeatmapVenue | null>(null);
  const [activeTimeSlots, setActiveTimeSlots] = useState<TimeSlot[]>(["morning", "afternoon", "evening"]);

  // Wait for zustand hydration before applying personalized default
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      setSelectedDupr(defaultDupr);
    }
  }, [hydrated, defaultDupr]);

  const bandMin = roundToBucket(selectedDupr - 0.1).toFixed(1);
  const bandMax = roundToBucket(selectedDupr + 0.1).toFixed(1);

  // Build heat-score mapping every individual venue ID to its group's score
  const venueHeatScoreMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of venues) {
      const score = venueHeatScore(v, selectedDupr);
      for (const vid of v.venueIds) map.set(vid, score);
    }
    return map;
  }, [venues, selectedDupr]);

  const activeVenues = useMemo(
    () => activeVenueIds(venues, selectedDupr),
    [venues, selectedDupr],
  );

  // Filter + sort sessions, then group by time slot
  const sessionsBySlot = useMemo(() => {
    const base = selectedVenue
      ? (() => {
          const venueIdSet = new Set(selectedVenue.venueIds);
          return sessions
            .filter((s) => s.venueId != null && venueIdSet.has(String(s.venueId)))
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
        })()
      : (() => {
          const filtered = sessions.filter(
            (s) => s.venueId != null && activeVenues.has(String(s.venueId)),
          );
          filtered.sort((a, b) => {
            const heatA = venueHeatScoreMap.get(String(a.venueId)) ?? 0;
            const heatB = venueHeatScoreMap.get(String(b.venueId)) ?? 0;
            if (heatB !== heatA) return heatB - heatA;
            return a.startTime.localeCompare(b.startTime);
          });
          return filtered;
        })();

    const result: Record<TimeSlot, typeof base> = { morning: [], afternoon: [], evening: [] };
    for (const slot of (["morning", "afternoon", "evening"] as TimeSlot[])) {
      if (!activeTimeSlots.includes(slot)) continue;
      const [min, max] = TIME_RANGES[slot];
      const slotSessions = base
        .filter((s) => s.startTime >= min && s.startTime <= max)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, 20);
      result[slot] = slotSessions;
    }
    return result;
  }, [sessions, activeVenues, venueHeatScoreMap, selectedVenue, activeTimeSlots]);

  const totalRecommendedSessions = sessionsBySlot.morning.length + sessionsBySlot.afternoon.length + sessionsBySlot.evening.length;

  const sliderMin = duprRange.min;
  const sliderMax = duprRange.max;
  const sliderStep = 0.1;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t("heatmapTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t("heatmapSubtitle")}{" "}
          <span className="font-semibold text-primary">
            {bandMin} – {bandMax}
          </span>
          {totalPlayersWithDupr > 0 && (
            <span className="ml-2 text-muted">
              · {totalPlayersWithDupr.toLocaleString()} {t("heatmapPlayersWithRatings")}
            </span>
          )}
        </p>
      </div>

      {/* DUPR slider */}
      <div className="mb-5 rounded-xl border border-card-border bg-card px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <label
            htmlFor="dupr-slider"
            className="text-sm font-semibold text-foreground"
          >
            {t("heatmapDuprLevel")}
          </label>
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-sm font-bold text-primary">
            {bandMin} – {bandMax}
          </span>
        </div>
        <div className="relative flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-xs text-muted">
            {sliderMin.toFixed(1)}
          </span>
          <input
            id="dupr-slider"
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={selectedDupr}
            onChange={(e) => setSelectedDupr(roundToBucket(parseFloat(e.target.value)))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-blue-400 via-emerald-400 via-amber-400 to-red-500 accent-primary"
          />
          <span className="w-10 shrink-0 text-xs text-muted">
            {sliderMax.toFixed(1)}
          </span>
        </div>
        <div className="mt-1.5 px-13">
          <DuprTickMarks min={sliderMin} max={sliderMax} selected={selectedDupr} />
        </div>
      </div>

      {/* Time-of-day filter pills */}
      <div className="mb-4 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(["morning", "afternoon", "evening"] as TimeSlot[]).map((slot) => {
          const active = activeTimeSlots.includes(slot);
          const label = t(slot);
          return (
            <button
              key={slot}
              type="button"
              onClick={() => {
                setActiveTimeSlots((prev) => {
                  if (prev.includes(slot)) {
                    const next = prev.filter((s) => s !== slot);
                    return next.length === 0 ? ["morning", "afternoon", "evening"] : next;
                  }
                  return [...prev, slot];
                });
              }}
              className={`inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                active
                  ? "border-primary bg-primary text-white"
                  : "border-card-border bg-background hover:border-primary/40"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Leaflet heatmap — no overflow-hidden: Leaflet tiles render outside bounds during pan */}
      <div className="mb-8 rounded-xl border border-card-border shadow-sm" style={{ isolation: "isolate" }}>
        <HeatmapView
          venues={venues}
          selectedDupr={selectedDupr}
          activeTimeSlots={activeTimeSlots}
          sessions={sessions}
          className="h-[480px] w-full"
          popupStrings={{
            clubsAtCourt: t("heatmapPopupClubsAtCourt"),
            playersAtLevel: t("heatmapPopupPlayersAtLevel"),
            sessionsHeld: t("heatmapPopupSessionsHeld"),
            players90d: t("heatmapPopupPlayers90d"),
            sessionsBelow: t("heatmapPopupSessionsBelow"),
          }}
          onBubbleClick={handleBubbleClick}
          onVenueSelect={(venue) => {
            setSelectedVenue(venue);
          }}
          onVenueDeselect={() => setSelectedVenue(null)}
        />
      </div>

      {/* 3-click gate modal */}
      <HeatmapLoginModal
        open={showLoginModal}
        onClose={(didLogin) => {
          if (!didLogin) setShowLoginModal(false);
        }}
      />

      {/* Recommended sessions — grouped by time of day */}
      <section id="sessions-section">
        {(() => {
          const firstSession =
            sessionsBySlot.morning[0] ??
            sessionsBySlot.afternoon[0] ??
            sessionsBySlot.evening[0];
          const datePrefix = firstSession
            ? firstSession.scrapedDate === todayStr
              ? t("heatmapToday")
              : t("heatmapTomorrow")
            : null;
          const venueTitle = selectedVenue
            ? `${t("heatmapSessionsAtVenue")} ${selectedVenue.venueName}`
            : t("heatmapSessionsAtHotspots");
          return (
            <h2 className="mb-1 text-lg font-bold text-foreground">
              {datePrefix && (
                <span className="mr-2 text-primary">{datePrefix} –</span>
              )}
              {venueTitle}
            </h2>
          );
        })()}
        <p className="mb-4 text-sm text-muted">
          {selectedVenue
            ? t("heatmapUpcomingAtCourt")
            : `${t("heatmapUpcomingHotspot")} ${bandMin}–${bandMax} ${t("heatmapUpcomingHotspotSuffix")}`}
        </p>

        {totalRecommendedSessions === 0 ? (
          <div className="rounded-xl border border-card-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted">
              {selectedVenue
                ? `${t("heatmapNoSessionsVenue")} ${selectedVenue.venueName} ${t("heatmapNoSessionsVenueSuffix")}`
                : t("heatmapNoSessionsGeneral")}
            </p>
            <p className="mt-1 text-xs text-muted">
              {selectedVenue
                ? t("heatmapCheckBackLater")
                : t("heatmapTrySlider")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {(
              [
                ["morning",   t("heatmapTimeMorning"),   t("heatmapTimeMorningSub")],
                ["afternoon", t("heatmapTimeAfternoon"), t("heatmapTimeAfternoonSub")],
                ["evening",   t("heatmapTimeEvening"),   t("heatmapTimeEveningSub")],
              ] as [TimeSlot, string, string][]
            ).map(([slot, label, sub]) => {
              const slotSessions = sessionsBySlot[slot];
              if (slotSessions.length === 0) return null;
              return (
                <div key={slot}>
                  <div className="mb-2 flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    <span className="text-xs text-muted">· {sub}</span>
                  </div>
                  <div
                    className="flex gap-3 overflow-x-auto pb-3"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {slotSessions.map((session) => (
                      <div
                        key={`${session.id}-${session.scrapedDate}`}
                        className="w-72 shrink-0 sm:w-80"
                      >
                        <SessionCard
                          session={session}
                          hcmMedianCostPerHour={hcmMedianCostPerHour}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Simple tick mark bar below the slider */
function DuprTickMarks({
  min,
  max,
  selected,
}: {
  min: number;
  max: number;
  selected: number;
}) {
  const ticks: number[] = [];
  for (let v = Math.ceil(min * 10) / 10; v <= max + 0.001; v = Math.round((v + 0.5) * 10) / 10) {
    ticks.push(Math.round(v * 10) / 10);
  }

  return (
    <div className="relative flex justify-between px-0">
      {ticks.map((t) => {
        const isSelected = Math.abs(t - selected) < 0.05;
        return (
          <span
            key={t}
            className={`text-center text-[10px] leading-none transition-colors ${
              isSelected ? "font-bold text-primary" : "text-muted"
            }`}
            style={{ minWidth: 24 }}
          >
            {t.toFixed(1)}
          </span>
        );
      })}
    </div>
  );
}
