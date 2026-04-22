"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { SessionCard } from "@/components/SessionCard";
import { SessionFilters, type FilterState } from "@/components/SessionFilters";
import {
  formatVND,
  parseSessionType,
  hasFoodDrinkPerk,
  haversineKm,
  formatDistanceKm,
  vnCalendarDateString,
} from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[calc(100dvh-200px)] min-h-[300px] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />,
});

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

type Session = {
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
  status: string;
  joined: number;
  waitlisted: number;
  fillRate: number;
  club: { name: string; slug: string };
  venue: { name: string; address: string; latitude: number; longitude: number } | null;
};

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [dayTab, setDayTab] = useState<"today" | "tomorrow">("today");

  const todayStr = useMemo(() => vnCalendarDateString(0), []);
  const tomorrowStr = useMemo(() => vnCalendarDateString(1), []);
  const activeDate = dayTab === "today" ? todayStr : tomorrowStr;
  const [filters, setFilters] = useState<FilterState>({
    timeSlot: "",
    maxPrice: "",
    availability: "",
    foodDrink: "",
    sessionType: "",
    search: "",
    sortBy: "time",
  });

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [searchDraft, setSearchDraft] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [freeTonightDetail, setFreeTonightDetail] = useState<Session | null>(null);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (!freeTonightDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFreeTonightDetail(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [freeTonightDetail]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300_000 },
    );
  }, []);

  useLayoutEffect(() => {
    const params = new URLSearchParams();
    params.set("date", activeDate);
    if (filters.timeSlot) params.set("timeSlot", filters.timeSlot);
    if (filters.maxPrice === "0") {
      params.set("freeOnly", "true");
    } else if (filters.maxPrice) {
      params.set("maxPrice", filters.maxPrice);
    }
    if (filters.search) params.set("search", filters.search);
    if (filters.foodDrink) params.set("hasPerks", filters.foodDrink);

    const url = `/api/sessions?${params.toString()}`;
    const cached = readPublicApiCache<{ sessions: Session[] }>(url);
    if (cached) {
      setSessions(cached.sessions || []);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetchPublicApiJson<{ sessions: Session[] }>(url)
      .then((data) => {
        if (!cancelled) setSessions(data.sessions || []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDate, filters.timeSlot, filters.maxPrice, filters.search, filters.foodDrink]);

  const filtered = useMemo(() => {
    let result = [...sessions];

    if (dayTab === "today") {
      const nowMinutes = (() => {
        const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
        return vn.getUTCHours() * 60 + vn.getUTCMinutes();
      })();
      result = result.filter((s) => timeToMinutes(s.startTime) >= nowMinutes);
    }

    if (filters.availability === "available") {
      result = result.filter((s) => s.fillRate < 0.75);
    } else if (filters.availability === "filling") {
      result = result.filter((s) => s.fillRate >= 0.75 && s.fillRate < 1);
    } else if (filters.availability === "available,filling") {
      result = result.filter((s) => s.fillRate < 1);
    } else if (filters.availability === "full") {
      result = result.filter((s) => s.fillRate >= 1);
    }

    if (filters.sessionType) {
      result = result.filter((s) => parseSessionType(s.name) === filters.sessionType);
    }

    if (filters.foodDrink === "true") {
      result = result.filter((s) => hasFoodDrinkPerk(s.perks));
    }

    const distanceKm = (session: Session) => {
      if (
        !userLocation ||
        !session.venue?.latitude ||
        !session.venue?.longitude
      ) {
        return Number.POSITIVE_INFINITY;
      }
      return haversineKm(
        userLocation.lat,
        userLocation.lng,
        session.venue.latitude,
        session.venue.longitude,
      );
    };

    switch (filters.sortBy) {
      case "price":
        result.sort((a, b) => a.feeAmount - b.feeAmount);
        break;
      case "costPerHour":
        result.sort((a, b) => (a.costPerHour || 999999) - (b.costPerHour || 999999));
        break;
      case "fillRate":
        result.sort((a, b) => b.fillRate - a.fillRate);
        break;
      case "available":
        result.sort((a, b) => a.fillRate - b.fillRate);
        break;
      case "nearby":
        if (userLocation) {
          result.sort((a, b) => distanceKm(a) - distanceKm(b));
        } else {
          result.sort((a, b) => a.startTime.localeCompare(b.startTime));
        }
        break;
      default:
        result.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return result;
  }, [
    sessions,
    dayTab,
    filters.availability,
    filters.sortBy,
    filters.sessionType,
    filters.foodDrink,
    userLocation,
  ]);

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
  }, []);

  const applyMobileSearch = useCallback(() => {
    const q = searchDraft.trim();
    setFilters((f) => ({ ...f, search: q }));
    setMobileSearchOpen(false);
  }, [searchDraft]);

  const onMobileSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    applyMobileSearch();
  };

  /** Free, has spots, start at or after 18:00; nearest first, max 3 */
  const freeTonightCards = useMemo(() => {
    const min18 = 18 * 60;
    const eligible = sessions.filter((s) => {
      if (s.feeAmount !== 0) return false;
      if (s.fillRate >= 1) return false;
      return timeToMinutes(s.startTime) >= min18;
    });

    const distKm = (s: Session) => {
      if (!userLocation || !s.venue?.latitude || !s.venue?.longitude) {
        return Number.POSITIVE_INFINITY;
      }
      return haversineKm(
        userLocation.lat,
        userLocation.lng,
        s.venue.latitude,
        s.venue.longitude,
      );
    };

    return [...eligible]
      .sort((a, b) => {
        const da = distKm(a);
        const db = distKm(b);
        if (da !== db) return da - db;
        return a.startTime.localeCompare(b.startTime);
      })
      .slice(0, 3);
  }, [sessions, userLocation]);

  const mapPins = useMemo(() => {
    return filtered
      .filter((s) => s.venue?.latitude && s.venue?.longitude)
      .map((s) => ({
        lat: s.venue!.latitude,
        lng: s.venue!.longitude,
        label: `${s.club.name} - ${s.startTime}`,
        fillRate: s.fillRate,
        price: formatVND(s.feeAmount),
        popup: "",
        eventUrl: s.eventUrl,
        venueName: s.venue!.name,
        clubName: s.club.name,
        time: `${s.startTime} - ${s.endTime}`,
        joined: s.joined,
        maxPlayers: s.maxPlayers,
      }));
  }, [filtered]);

  const totalPlayers = sessions.reduce((sum, s) => sum + s.joined, 0);
  const tomorrowPendingSync =
    dayTab === "tomorrow" && !loading && sessions.length === 0;

  return (
    <div className="mx-auto min-w-0 max-w-7xl px-2 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">
          <span className="text-primary">Pickleball</span> Sessions{" "}
          {dayTab === "today" ? "Today" : "Tomorrow"}
        </h1>
        <p className="text-sm text-muted">
          Ho Chi Minh City — {formatDayLabel(activeDate)}
          {tomorrowPendingSync ? (
            <> — no sessions loaded for this date yet</>
          ) : (
            <>
              {" "}
              — {sessions.length} sessions, {totalPlayers.toLocaleString()} players
            </>
          )}
        </p>
      </div>

      {tomorrowPendingSync && (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <p className="font-semibold text-amber-900 dark:text-amber-50">Tomorrow&apos;s list is empty in our database</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            Sessions are stored per calendar day on the server. After each Reclub sync (about 6 AM and 1 PM HCMC),
            the next day&apos;s rows appear here. If production has not ingested tomorrow yet, you will see zero
            until that run completes — check{" "}
            <a
              href="https://reclub.co"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-white"
            >
              Reclub
            </a>{" "}
            for live bookings in the meantime.
          </p>
        </div>
      )}

      {dayTab === "today" && freeTonightCards.length > 0 && (
        <section className="mb-4 min-w-0">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Free Tonight</h2>
          <p className="mb-2 text-xs text-muted">
            Free sessions from 6:00 PM with spots left — nearest first
          </p>
          <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {freeTonightCards.map((s) => {
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
              const spotsLeft = Math.max(0, s.maxPlayers - s.joined);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFreeTonightDetail(s)}
                  className="flex w-[min(280px,calc(100vw-3rem))] shrink-0 flex-col rounded-xl border border-card-border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-1">
                    <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      Free · From 6pm
                    </span>
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {spotsLeft} left
                    </span>
                  </div>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{s.name}</span>
                  <span className="mt-1 text-xs text-muted">
                    {s.startTime} – {s.endTime} · {s.club.name}
                  </span>
                  {s.venue && (
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted/90">
                      📍 {s.venue.name}
                    </span>
                  )}
                  {distKm != null && (
                    <span className="mt-1 text-xs font-medium text-primary">
                      {formatDistanceKm(distKm)} away
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <SessionFilters
        filters={filters}
        onChange={handleFilterChange}
        sessionCount={filtered.length}
        hasUserLocation={!!userLocation}
      />

      <div className="mt-4 flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition min-h-[44px] sm:py-1.5 ${
              viewMode === "list"
                ? "bg-primary text-white"
                : "border border-card-border bg-card hover:border-primary/30"
            }`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition min-h-[44px] sm:py-1.5 ${
              viewMode === "map"
                ? "bg-primary text-white"
                : "border border-card-border bg-card hover:border-primary/30"
            }`}
          >
            Map
          </button>

          <div className="mx-1 h-6 w-px bg-card-border shrink-0" />

          <div className="flex shrink-0 items-center rounded-lg border border-card-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => setDayTab("today")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition min-h-[32px] ${
                dayTab === "today"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDayTab("tomorrow")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition min-h-[32px] ${
                dayTab === "tomorrow"
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Tomorrow
            </button>
          </div>

          <div className="min-w-0 flex-1" aria-hidden />
          <div className="flex shrink-0 sm:hidden">
            {!mobileSearchOpen ? (
              <button
                type="button"
                onClick={() => setMobileSearchOpen(true)}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border border-card-border bg-card transition hover:border-primary/40 ${
                  filters.search ? "border-primary/50 ring-1 ring-primary/20" : ""
                }`}
                aria-label="Open search"
              >
                <SearchIcon className="h-5 w-5 text-foreground" />
              </button>
            ) : null}
          </div>
        </div>
        {mobileSearchOpen ? (
          <form onSubmit={onMobileSearchSubmit} className="flex gap-2 sm:hidden">
            <input
              type="text"
              placeholder="Sessions, clubs, addresses…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary-dark"
              aria-label="Apply search"
            >
              <SearchIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={applyMobileSearch}
              className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-card-border bg-card px-2 text-sm text-muted transition hover:bg-primary/5"
            >
              Done
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 min-w-0">
        {loading ? (
          <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 rounded-xl bg-card border border-card-border animate-pulse" />
            ))}
          </div>
        ) : viewMode === "map" ? (
          <MapView pins={mapPins} className="h-[calc(100dvh-200px)] min-h-[300px] w-full" showLocateButton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted">
            {sessions.length === 0 && dayTab === "tomorrow" ? (
              <>
                <p className="text-lg mb-2 text-foreground">No sessions to show yet</p>
                <p className="text-sm max-w-md mx-auto">
                  Tomorrow&apos;s listings appear here after each sync from Reclub. See the note above for timing,
                  or open Reclub to browse what&apos;s already published.
                </p>
              </>
            ) : sessions.length === 0 ? (
              <>
                <p className="text-lg mb-2">No sessions found</p>
                <p className="text-sm">Try another day or check back after the next data update.</p>
              </>
            ) : (
              <>
                <p className="text-lg mb-2">No sessions match your filters</p>
                <p className="text-sm">Try adjusting your filters or clear search.</p>
              </>
            )}
          </div>
        ) : (
          <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <SessionCard key={s.id} session={s} userLocation={userLocation} />
            ))}
          </div>
        )}
      </div>

      {freeTonightDetail ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setFreeTonightDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="free-tonight-dialog-title"
            className="max-h-[min(92dvh,900px)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-card-border bg-background p-4 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="free-tonight-dialog-title" className="text-lg font-bold">
                Session details
              </h2>
              <button
                type="button"
                onClick={() => setFreeTonightDetail(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-primary/10 hover:text-foreground"
              >
                Close
              </button>
            </div>
            <SessionCard session={freeTonightDetail} userLocation={userLocation} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
