"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { SessionCard } from "@/components/SessionCard";
// import { readPublicApiCache, writePublicApiCache } from "@/lib/public-api-cache" — superseded by server props; no /api/sessions fetches
import { SessionBookPreviewSheet } from "@/components/SessionBookPreviewSheet";
import { SessionsIntroBanner } from "@/components/SessionsIntroBanner";
import { SessionFilters, type FilterState } from "@/components/SessionFilters";
import { RecommendedForYou } from "@/components/RecommendedForYou";
import { ZaloPrompt } from "@/components/ZaloPrompt";
import {
  formatVND,
  parseSessionType,
  hasFoodDrinkPerk,
  haversineKm,
  formatDistanceKm,
} from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { mouseflowTag } from "@/lib/analytics";
import { computeSessionScore, HCM_MEDIAN_COST_FALLBACK } from "@/lib/scoring";
import type { GetSessionsListItem } from "@/lib/queries";
import { useProfileStore } from "@/store/profileStore";

const ZALO_GROUP_URL = "https://zalo.me/g/khebsp5x7jlkslmnroxh";

const PAGE_SIZE = 50;

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

type HomeSession = GetSessionsListItem;

/** Hide sessions with no place to go (private / friend listings). Always applied — no UI toggle. */
function sessionHasVenueAddressOrLocation(s: HomeSession): boolean {
  const v = s.venue;
  if (!v) return false;
  if (v.name?.trim() || v.address?.trim()) return true;
  return v.latitude != null && v.longitude != null;
}

function TimeGroupedList({
  groups,
  visibleCount,
  userLocation,
  hcmMedianCostPerHour,
  onCardClick,
}: {
  groups: Map<string, HomeSession[]>;
  visibleCount: number;
  userLocation: { lat: number; lng: number } | null;
  hcmMedianCostPerHour: number;
  onCardClick: (session: HomeSession) => void;
}) {
  const { t } = useI18n();
  let rendered = 0;
  const entries = Array.from(groups.entries());

  return (
    <div className="space-y-4">
      {entries.map(([startTime, group]) => {
        if (rendered >= visibleCount) return null;
        const remaining = visibleCount - rendered;
        const visible = group.slice(0, remaining);
        rendered += visible.length;

        return (
          <div key={startTime}>
            <div className="sticky top-12 sm:top-14 z-20 -mx-2 px-2 py-1.5 backdrop-blur-md bg-background/80 border-b border-card-border/30">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                  {t("from")} {startTime.replace(/^0/, "")}
                </span>
                <span className="text-xs text-muted">{group.length} {group.length !== 1 ? t("sessions") : t("session")}</span>
                <div className="flex-1 border-t border-card-border/50" />
              </div>
            </div>
            <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-2">
              {visible.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  userLocation={userLocation}
                  hcmMedianCostPerHour={hcmMedianCostPerHour}
                  onCardClick={() => onCardClick(s)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type HomeClientProps = {
  todayStr: string;
  tomorrowStr: string;
  todaySessions: HomeSession[];
  tomorrowSessions: HomeSession[];
  hcmMedianToday: number;
  hcmMedianTomorrow: number;
  lastScrapedAtToday: string | null;
  lastScrapedAtTomorrow: string | null;
};

function applyTimeMaxPriceSearchFilters(
  list: HomeSession[],
  timeSlot: string,
  maxPrice: string,
  search: string,
) {
  let result = list;
  if (timeSlot) {
    const ranges: Record<string, [string, string]> = {
      morning: ["00:00", "11:59"],
      afternoon: ["12:00", "16:59"],
      evening: ["17:00", "23:59"],
    };
    const r = ranges[timeSlot];
    if (r) {
      const [min, max] = r;
      result = result.filter((s) => s.startTime >= min && s.startTime <= max);
    }
  }
  if (maxPrice === "0") {
    result = result.filter((s) => s.feeAmount === 0);
  } else if (maxPrice) {
    const mp = parseInt(maxPrice, 10);
    if (!Number.isNaN(mp)) result = result.filter((s) => s.feeAmount <= mp);
  }
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.club.name.toLowerCase().includes(q) ||
        (s.venue?.name?.toLowerCase().includes(q) ?? false) ||
        (s.venue?.address?.toLowerCase().includes(q) ?? false),
    );
  }
  return result;
}

export function HomeClient({
  todayStr,
  tomorrowStr,
  todaySessions: todaySessionsProp,
  tomorrowSessions: tomorrowSessionsProp,
  hcmMedianToday,
  hcmMedianTomorrow,
  lastScrapedAtToday,
  lastScrapedAtTomorrow,
}: HomeClientProps) {
  const { t } = useI18n();
  const { showZaloPrompt, zaloPromptDismissed, dismissZaloPrompt, saveToServer, incrementVisit } = useProfileStore();
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [dayTab, setDayTab] = useState<"today" | "tomorrow">("today");

  const sessions = dayTab === "today" ? todaySessionsProp : tomorrowSessionsProp;
  const activeDate = dayTab === "today" ? todayStr : tomorrowStr;
  const hcmMedianCostPerHour = useMemo(() => {
    const m = dayTab === "today" ? hcmMedianToday : hcmMedianTomorrow;
    if (typeof m === "number" && !Number.isNaN(m)) return m;
    return HCM_MEDIAN_COST_FALLBACK;
  }, [dayTab, hcmMedianToday, hcmMedianTomorrow]);
  const lastScrapedAt = dayTab === "today" ? lastScrapedAtToday : lastScrapedAtTomorrow;
  const [filters, setFilters] = useState<FilterState>({
    timeSlot: "",
    maxPrice: "",
    availability: "",
    foodDrink: "",
    sessionType: "",
    search: "",
    sortBy: "time",
    excludeFewPlayers: "true",
  });

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [searchDraft, setSearchDraft] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [bookPreviewSession, setBookPreviewSession] = useState<HomeSession | null>(null);
  const [shareClipboardToast, setShareClipboardToast] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"fromNow" | "past">("fromNow");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [zaloJoined, setZaloJoined] = useState(true);

  useEffect(() => {
    setZaloJoined(localStorage.getItem("zalo_joined") === "true");
  }, []);

  useEffect(() => {
    incrementVisit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showShareClipboardToast = useCallback(() => {
    setShareClipboardToast(true);
    window.setTimeout(() => setShareClipboardToast(false), 2500);
  }, []);

  const handleZaloPillClick = useCallback(() => {
    mouseflowTag("zalo_intent:floating_cta");
    localStorage.setItem("zalo_joined", "true");
    setZaloJoined(true);
    window.open(ZALO_GROUP_URL, "_blank", "noopener");
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300_000 },
    );
  }, []);

  const vnNowMinutes = useMemo(() => {
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return vn.getUTCHours() * 60 + vn.getUTCMinutes();
  }, []);

  const filtered = useMemo(() => {
    let result = sessions.filter(sessionHasVenueAddressOrLocation);
    result = applyTimeMaxPriceSearchFilters(
      result,
      filters.timeSlot,
      filters.maxPrice,
      filters.search,
    );

    if (dayTab === "today") {
      const effectiveFilter = isMobile ? "fromNow" : timeFilter;
      if (effectiveFilter === "fromNow") {
        result = result.filter((s) => timeToMinutes(s.startTime) >= vnNowMinutes);
      } else {
        result = result.filter((s) => timeToMinutes(s.startTime) < vnNowMinutes);
      }
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

    if (filters.excludeFewPlayers === "true") {
      result = result.filter((s) => s.joined > 2);
    }

    if (filters.foodDrink === "true") {
      result = result.filter((s) => hasFoodDrinkPerk(s.perks));
    }

    const sessionScore = (s: HomeSession) =>
      computeSessionScore({
        confirmedPlayers: s.joined,
        capacity: s.maxPlayers,
        priceVnd: s.feeAmount,
        durationMinutes: s.durationMin,
        hasZalo: Boolean(s.club.zaloUrl),
        hcmMedianCostPerHour,
        sessionType: parseSessionType(s.name),
        duprParticipationPct: s.duprParticipationPct,
        returningPlayerPct: s.returningPlayerPct,
      }).score;

    if (filters.sortBy === "score" || filters.sortBy === "score_nearby") {
      result = result.filter((s) => sessionScore(s) >= 50);
    }

    if (filters.sortBy === "playerLevel") {
      result = result.filter((s) => parseSessionType(s.name) !== "roundrobin");
    }

    const distanceKm = (session: HomeSession) => {
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
      case "playerLevel":
        result.sort((a, b) => {
          // Sessions with no DUPR data sort to the bottom
          const da = a.duprParticipationPct ?? -1;
          const db = b.duprParticipationPct ?? -1;
          if (da !== db) return db - da;
          return a.startTime.localeCompare(b.startTime);
        });
        break;
      case "nearby":
        if (userLocation) {
          result.sort((a, b) => distanceKm(a) - distanceKm(b));
        } else {
          result.sort((a, b) => a.startTime.localeCompare(b.startTime));
        }
        break;
      case "score":
        result.sort((a, b) => {
          const diff = sessionScore(b) - sessionScore(a);
          if (diff !== 0) return diff;
          return a.startTime.localeCompare(b.startTime);
        });
        break;
      case "score_nearby":
        if (userLocation) {
          result.sort((a, b) => {
            const da = distanceKm(a);
            const db = distanceKm(b);
            if (da !== db) return da - db;
            return sessionScore(b) - sessionScore(a);
          });
        } else {
          result.sort((a, b) => {
            const diff = sessionScore(b) - sessionScore(a);
            if (diff !== 0) return diff;
            return a.startTime.localeCompare(b.startTime);
          });
        }
        break;
      default:
        result.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    return result;
  }, [
    sessions,
    hcmMedianCostPerHour,
    dayTab,
    timeFilter,
    isMobile,
    vnNowMinutes,
    filters.availability,
    filters.sortBy,
    filters.sessionType,
    filters.excludeFewPlayers,
    filters.foodDrink,
    filters.timeSlot,
    filters.maxPrice,
    filters.search,
    userLocation,
  ]);

  const timeGroupedSessions = useMemo(() => {
    const groups = new Map<string, HomeSession[]>();
    for (const s of filtered) {
      const key = s.startTime;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return groups;
  }, [filtered]);

  const hasTimeGroups = useMemo(
    () => timeGroupedSessions.size > 0,
    [timeGroupedSessions],
  );

  /** Same basis the old /api/sessions? query used: time, price, search (not map/venue/sort/availability). */
  const sessionsForTimeStrip = useMemo(
    () => applyTimeMaxPriceSearchFilters(sessions, filters.timeSlot, filters.maxPrice, filters.search),
    [sessions, filters.timeSlot, filters.maxPrice, filters.search],
  );

  const fromNowCount = useMemo(() => {
    if (dayTab !== "today") return sessionsForTimeStrip.length;
    return sessionsForTimeStrip.filter((s) => timeToMinutes(s.startTime) >= vnNowMinutes).length;
  }, [dayTab, sessionsForTimeStrip, vnNowMinutes]);

  const pastCount = useMemo(() => {
    if (dayTab !== "today") return 0;
    return sessionsForTimeStrip.filter((s) => timeToMinutes(s.startTime) < vnNowMinutes).length;
  }, [dayTab, sessionsForTimeStrip, vnNowMinutes]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [dayTab, timeFilter, filters]);

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
  const tomorrowPendingSync = dayTab === "tomorrow" && sessions.length === 0;

  const updatedAtLine = useMemo(() => {
    if (!lastScrapedAt) return null;
    return (
      <>
        {t("updatedAt")}{" "}
        {new Date(lastScrapedAt).toLocaleString("en-US", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })}{" "}
        {t("on")}{" "}
        {new Date(lastScrapedAt).toLocaleDateString("en-US", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </>
    );
  }, [lastScrapedAt, t]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-2 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="mb-1 hidden text-xl font-bold sm:block sm:text-2xl">
          <span className="text-primary">{t("pickleball")}</span>{" "}
          {dayTab === "today" ? t("sessionsToday") : t("sessionsTomorrow")}
        </h1>
        <p className="text-sm text-muted">
          {t("hoChiMinhCity")} — {formatDayLabel(activeDate)}
          {tomorrowPendingSync ? (
            <> — {t("noSessionsLoadedYet")}</>
          ) : (
            <>
              {" "}
              — {sessions.length} {t("sessions")}, {totalPlayers.toLocaleString()} {t("players")}
            </>
          )}
          {updatedAtLine && (
            <>
              <span className="sm:hidden"> - </span>
              <span className="text-[11px] text-muted/70 sm:hidden">{updatedAtLine}</span>
            </>
          )}
        </p>
        {updatedAtLine && (
          <p className="mt-0.5 hidden text-[11px] text-muted/70 sm:block">{updatedAtLine}</p>
        )}
      </div>

      {tomorrowPendingSync && (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
          role="status"
        >
          <p className="font-semibold text-amber-900 dark:text-amber-50">{t("tomorrowEmpty")}</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
            {t("tomorrowEmptyDesc")}{" "}
            <a
              href="https://reclub.co"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-white"
            >
              Reclub
            </a>{" "}
            {t("forLiveBookings")}
          </p>
        </div>
      )}

      <SessionsIntroBanner />

      {showZaloPrompt && !zaloPromptDismissed && (
        <ZaloPrompt
          onSave={(zaloId, displayName) => saveToServer(zaloId, displayName)}
          onDismiss={dismissZaloPrompt}
        />
      )}

      <RecommendedForYou
        date={activeDate}
        userLocation={userLocation}
        onSessionClick={(s) => setBookPreviewSession(s as unknown as HomeSession)}
      />

      <SessionFilters
        filters={filters}
        onChange={handleFilterChange}
        sessionCount={filtered.length}
        hasUserLocation={!!userLocation}
      />

      <div className="mt-4 flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition min-h-[44px] sm:py-1.5 ${
              viewMode === "list"
                ? "bg-primary text-white"
                : "border border-card-border bg-card hover:border-primary/30"
            }`}
          >
            {t("list")}
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
            {t("map")}
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
              {t("today")}
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
              {t("tomorrow")}
            </button>
          </div>

          {dayTab === "today" && (
            <div className="hidden sm:contents">
              <div className="mx-1 h-6 w-px bg-card-border shrink-0" />
              <div className="flex shrink-0 items-center rounded-lg border border-card-border bg-card p-0.5">
                <button
                  type="button"
                  onClick={() => setTimeFilter("fromNow")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition min-h-[32px] ${
                    timeFilter === "fromNow"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t("fromNow")} ({fromNowCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTimeFilter("past")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition min-h-[32px] ${
                    timeFilter === "past"
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t("past")} ({pastCount})
                </button>
              </div>
            </div>
          )}

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
              placeholder={t("searchPlaceholder")}
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
              {t("done")}
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 min-w-0">
        {viewMode === "map" ? (
          <MapView pins={mapPins} className="h-[calc(100dvh-200px)] min-h-[300px] w-full" showLocateButton />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted">
            {sessions.length === 0 && dayTab === "tomorrow" ? (
              <>
                <p className="text-lg mb-2 text-foreground">{t("noSessionsToShow")}</p>
                <p className="text-sm max-w-md mx-auto">{t("tomorrowListingsAppear")}</p>
              </>
            ) : sessions.length === 0 ? (
              <>
                <p className="text-lg mb-2">{t("noSessionsFound")}</p>
                <p className="text-sm">{t("tryAnotherDay")}</p>
              </>
            ) : (
              <>
                <p className="text-lg mb-2">{t("noSessionsMatch")}</p>
                <p className="text-sm">{t("tryAdjusting")}</p>
              </>
            )}
          </div>
        ) : filters.sortBy === "score" || filters.sortBy === "score_nearby" || filters.sortBy === "playerLevel" || !hasTimeGroups ? (
          <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, visibleCount).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                userLocation={userLocation}
                hcmMedianCostPerHour={hcmMedianCostPerHour}
                onCardClick={() => setBookPreviewSession(s)}
              />
            ))}
          </div>
        ) : (
          <TimeGroupedList
            groups={timeGroupedSessions}
            visibleCount={visibleCount}
            userLocation={userLocation}
            hcmMedianCostPerHour={hcmMedianCostPerHour}
            onCardClick={setBookPreviewSession}
          />
        )}

        {viewMode === "list" && filtered.length > visibleCount && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="rounded-lg border border-card-border bg-card px-6 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:shadow-sm min-h-[44px]"
            >
              {t("showMore")} ({filtered.length - visibleCount} {t("remaining")})
            </button>
          </div>
        )}
      </div>

      <SessionBookPreviewSheet
        session={bookPreviewSession}
        open={bookPreviewSession != null}
        onClose={() => setBookPreviewSession(null)}
        hcmMedianCostPerHour={hcmMedianCostPerHour}
        userLocation={userLocation}
        onShareClipboardToast={showShareClipboardToast}
      />

      {/* Floating Zalo CTA pill */}
      {!zaloJoined && (
        <button
          type="button"
          onClick={handleZaloPillClick}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 max-w-[260px] rounded-full bg-gray-900/75 px-4 py-2.5 text-xs font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-gray-900/90 active:scale-95 dark:bg-white/20"
        >
          {t("zaloFloatingCta")}
        </button>
      )}

      {shareClipboardToast && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-[110] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          {t("shareClipboardToast")}
        </div>
      )}
    </div>
  );
}
