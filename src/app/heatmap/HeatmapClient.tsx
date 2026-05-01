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

// Dynamic import — Leaflet requires browser APIs (no SSR)
const HeatmapView = dynamic(
  () => import("@/components/HeatmapView").then((m) => m.HeatmapView),
  { ssr: false, loading: () => <div className="h-[480px] w-full rounded-xl bg-card animate-pulse" /> },
);

interface Props {
  heatmapData: HeatmapData;
  sessions: GetSessionsListItem[];
  hcmMedianCostPerHour: number;
}

// Map onboarding level to a sensible default DUPR position
function levelToDupr(level: string | undefined, median: number): number {
  if (level === "casual") return 2.5;
  if (level === "competitive") return 4.5;
  if (level === "intermediate") return 3.5;
  return median;
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

export function HeatmapClient({ heatmapData, sessions, hcmMedianCostPerHour }: Props) {
  const { duprRange, medianDupr, venues, totalPlayersWithDupr } = heatmapData;
  const preferences = useProfileStore((s) => s.preferences);
  const hasCompletedOnboarding = useProfileStore((s) => s.hasCompletedOnboarding);

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
    if (hasCompletedOnboarding && preferences?.level) {
      const candidate = levelToDupr(preferences.level, medianDupr);
      return clamp(roundToBucket(candidate), duprRange.min, duprRange.max);
    }
    return clamp(medianDupr, duprRange.min, duprRange.max);
  }, [hasCompletedOnboarding, preferences?.level, medianDupr, duprRange]);

  const [selectedDupr, setSelectedDupr] = useState(defaultDupr);
  const [hydrated, setHydrated] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<HeatmapVenue | null>(null);

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

  // Filter + sort sessions
  const recommendedSessions = useMemo(() => {
    if (selectedVenue) {
      // Venue selected: show all sessions at that venue regardless of DUPR band
      const venueIdSet = new Set(selectedVenue.venueIds);
      const filtered = sessions.filter(
        (s) => s.venueId != null && venueIdSet.has(String(s.venueId)),
      );
      filtered.sort((a, b) => a.startTime.localeCompare(b.startTime));
      return filtered.slice(0, 20);
    }
    // Default: only venues in the active DUPR band, sorted by heat desc then start time
    const filtered = sessions.filter(
      (s) => s.venueId != null && activeVenues.has(String(s.venueId)),
    );
    filtered.sort((a, b) => {
      const heatA = venueHeatScoreMap.get(String(a.venueId)) ?? 0;
      const heatB = venueHeatScoreMap.get(String(b.venueId)) ?? 0;
      if (heatB !== heatA) return heatB - heatA;
      return a.startTime.localeCompare(b.startTime);
    });
    return filtered.slice(0, 20);
  }, [sessions, activeVenues, venueHeatScoreMap, selectedVenue]);

  const sliderMin = duprRange.min;
  const sliderMax = duprRange.max;
  const sliderStep = 0.1;

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Where Players Go
        </h1>
        <p className="mt-1 text-sm text-muted">
          Showing activity for DUPR{" "}
          <span className="font-semibold text-primary">
            {bandMin} – {bandMax}
          </span>
          {totalPlayersWithDupr > 0 && (
            <span className="ml-2 text-muted">
              · {totalPlayersWithDupr.toLocaleString()} players with ratings (last 90 days)
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
            DUPR Level
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
        <p className="mt-2 text-xs text-muted">
          Drag to filter. The heatmap and sessions below update instantly.
        </p>
      </div>

      {/* Leaflet heatmap — no overflow-hidden: Leaflet tiles render outside bounds during pan */}
      <div className="mb-8 rounded-xl border border-card-border shadow-sm" style={{ isolation: "isolate" }}>
        <HeatmapView
          venues={venues}
          selectedDupr={selectedDupr}
          className="h-[480px] w-full"
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

      {/* Recommended sessions strip */}
      <section id="sessions-section">
        <h2 className="mb-1 text-lg font-bold text-foreground">
          {selectedVenue
            ? `Sessions at ${selectedVenue.venueName}`
            : "Sessions at the hotspots"}
        </h2>
        <p className="mb-4 text-sm text-muted">
          {selectedVenue
            ? "Upcoming sessions from clubs at this court"
            : `Upcoming sessions where DUPR ${bandMin}–${bandMax} players are most active.`}
        </p>

        {recommendedSessions.length === 0 ? (
          <div className="rounded-xl border border-card-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted">
              {selectedVenue
                ? `No upcoming sessions at ${selectedVenue.venueName} right now.`
                : "No upcoming sessions at these venues right now."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {selectedVenue
                ? "Check back later or tap another venue on the map."
                : "Try adjusting the DUPR slider to find more activity."}
            </p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-3"
            style={{ scrollbarWidth: "thin" }}
          >
            {recommendedSessions.map((session) => (
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
