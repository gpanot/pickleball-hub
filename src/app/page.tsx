"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { SessionCard } from "@/components/SessionCard";
import { SessionsIntroBanner } from "@/components/SessionsIntroBanner";
import { SessionFilters, type FilterState } from "@/components/SessionFilters";
import {
  formatVND,
  parseSessionType,
  hasFoodDrinkPerk,
  haversineKm,
  formatDistanceKm,
  vnCalendarDateString,
} from "@/lib/utils";
import { readPublicApiCache, writePublicApiCache } from "@/lib/public-api-cache";
import { useI18n } from "@/lib/i18n";
import { mouseflowTag } from "@/lib/analytics";
import {
  computeHcmMedianCostPerHour,
  computeSessionScore,
  HCM_MEDIAN_COST_FALLBACK,
} from "@/lib/scoring";

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
  club: { name: string; slug: string; zaloUrl?: string | null; clubRank?: number };
  duprParticipationPct?: number | null;
  description?: string | null;
  venue: { name: string; address: string; latitude: number; longitude: number } | null;
};

type SessionsApiPayload = {
  sessions: Session[];
  hcmMedianCostPerHour?: number;
  lastScrapedAt: string | null;
};

function resolveHcmMedianFromPayload(data: SessionsApiPayload): number {
  if (typeof data.hcmMedianCostPerHour === "number" && !Number.isNaN(data.hcmMedianCostPerHour)) {
    return data.hcmMedianCostPerHour;
  }
  return computeHcmMedianCostPerHour(
    (data.sessions ?? []).map((s) => ({
      feeAmount: s.feeAmount,
      durationMinutes: s.durationMin,
      clubRank: s.club.clubRank,
    })),
  );
}

/** Hide sessions with no place to go (private / friend listings). Always applied — no UI toggle. */
function sessionHasVenueAddressOrLocation(s: Session): boolean {
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
}: {
  groups: Map<string, Session[]>;
  visibleCount: number;
  userLocation: { lat: number; lng: number } | null;
  hcmMedianCostPerHour: number;
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
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hcmMedianCostPerHour, setHcmMedianCostPerHour] = useState(HCM_MEDIAN_COST_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [lastScrapedAt, setLastScrapedAt] = useState<string | null>(null);
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
    excludeFewPlayers: "true",
  });

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [searchDraft, setSearchDraft] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [freeTonightDetail, setFreeTonightDetail] = useState<Session | null>(null);
  const [timeFilter, setTimeFilter] = useState<"fromNow" | "past">("fromNow");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [zaloJoined, setZaloJoined] = useState(true);
  const [copyToast, setCopyToast] = useState(false);
  const headingTapCount = useRef(0);
  const headingTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setZaloJoined(localStorage.getItem("zalo_joined") === "true");
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
    const cached = readPublicApiCache<SessionsApiPayload>(url);
    if (cached) {
      setSessions(cached.sessions || []);
      setHcmMedianCostPerHour(resolveHcmMedianFromPayload(cached));
      setLastScrapedAt(cached.lastScrapedAt ?? null);
      setLoading(false);
    } else {
      setLoading(true);
    }

    let cancelled = false;
    fetch(url, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SessionsApiPayload>;
      })
      .then((data) => {
        writePublicApiCache(url, data);
        if (!cancelled) {
          setSessions(data.sessions || []);
          setHcmMedianCostPerHour(resolveHcmMedianFromPayload(data));
          setLastScrapedAt(data.lastScrapedAt ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessions([]);
          setHcmMedianCostPerHour(HCM_MEDIAN_COST_FALLBACK);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeDate, filters.timeSlot, filters.maxPrice, filters.search, filters.foodDrink]);

  const vnNowMinutes = useMemo(() => {
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return vn.getUTCHours() * 60 + vn.getUTCMinutes();
  }, []);

  const filtered = useMemo(() => {
    let result = sessions.filter(sessionHasVenueAddressOrLocation);

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
      case "score": {
        const scoreOf = (s: Session) =>
          computeSessionScore({
            confirmedPlayers: s.joined,
            capacity: s.maxPlayers,
            priceVnd: s.feeAmount,
            durationMinutes: s.durationMin,
            hasZalo: Boolean(s.club.zaloUrl),
            hcmMedianCostPerHour,
            sessionType: parseSessionType(s.name),
            duprParticipationPct: s.duprParticipationPct,
          }).score;
        result.sort((a, b) => {
          const diff = scoreOf(b) - scoreOf(a);
          if (diff !== 0) return diff;
          return a.startTime.localeCompare(b.startTime);
        });
        break;
      }
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
    userLocation,
  ]);

  const timeGroupedSessions = useMemo(() => {
    const groups = new Map<string, Session[]>();
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

  const fromNowCount = useMemo(() => {
    if (dayTab !== "today") return sessions.length;
    return sessions.filter((s) => timeToMinutes(s.startTime) >= vnNowMinutes).length;
  }, [sessions, dayTab, vnNowMinutes]);

  const pastCount = useMemo(() => {
    if (dayTab !== "today") return 0;
    return sessions.filter((s) => timeToMinutes(s.startTime) < vnNowMinutes).length;
  }, [sessions, dayTab, vnNowMinutes]);

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
  const freeTonightCards = useMemo(() => {
    const min18 = 18 * 60;
    const hasVenueLocation = (s: Session) =>
      Boolean(s.venue?.name?.trim() || s.venue?.address?.trim());
    const eligible = sessions.filter((s) => {
      if (s.feeAmount !== 0) return false;
      if (s.fillRate >= 1) return false;
      if (timeToMinutes(s.startTime) < min18) return false;
      if (!hasVenueLocation(s)) return false;
      if (!s.description?.trim()) return false;
      return true;
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
      });
  }, [sessions, userLocation]);

  const copyFreeTonightMessage = useCallback(() => {
    if (freeTonightCards.length === 0) return;
    const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const days = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const dayName = days[vn.getUTCDay()];
    const dd = String(vn.getUTCDate()).padStart(2, "0");
    const mm = String(vn.getUTCMonth() + 1).padStart(2, "0");

    const eventBlocks = freeTonightCards.map((s, i) => {
      const spotsLeft = Math.max(0, s.maxPlayers - s.joined);
      const dist =
        userLocation && s.venue?.latitude != null && s.venue?.longitude != null
          ? formatDistanceKm(haversineKm(userLocation.lat, userLocation.lng, s.venue.latitude, s.venue.longitude))
          : "—";
      const venue = s.venue?.name ?? "TBA";
      return `${i + 1}. ${s.name} — ${s.startTime} — còn ${spotsLeft} chỗ\n${venue}\n${dist}`;
    });

    const text = `🎾 PICKLEBALL FREE TỐI NAY — HCM
${dayName}, ${dd}/${mm} | ${freeTonightCards.length} buổi FREE còn chỗ

Gợi ý gần trung tâm:

${eventBlocks.join("\n\n")}

👉 Xem đầy đủ + lọc giá/giờ: https://pickleball-hub-gules.vercel.app
💬 Nhận thông báo hàng ngày: zalo.me/g/khebsp5x7jlkslmnroxh`;

    navigator.clipboard.writeText(text).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2500);
    });
  }, [freeTonightCards, userLocation]);

  const handleHeadingTap = useCallback(() => {
    if (headingTapTimer.current) clearTimeout(headingTapTimer.current);
    headingTapCount.current += 1;
    if (headingTapCount.current >= 5) {
      headingTapCount.current = 0;
      copyFreeTonightMessage();
    } else {
      headingTapTimer.current = setTimeout(() => {
        headingTapCount.current = 0;
      }, 2000);
    }
  }, [copyFreeTonightMessage]);

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

  const updatedAtLine = useMemo(() => {
    if (!lastScrapedAt || loading) return null;
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
  }, [lastScrapedAt, loading, t]);

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

      {freeTonightCards.length > 0 && (
        <section className="mb-4 min-w-0">
          <h2
            onClick={handleHeadingTap}
            className="mb-2 text-sm font-semibold text-foreground cursor-default select-none"
          >
            {dayTab === "today" ? `${t("freeTonight")} (${freeTonightCards.length})` : `${t("freeTomorrowNight")} (${freeTonightCards.length})`}
          </h2>
          <p className="mb-2 text-xs text-muted">
            {dayTab === "today" ? t("freeSessionsFrom6pm") : t("freeSessionsTomorrow6pm")}
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
                      {t("freeFrom6pm")}
                    </span>
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold tabular-nums text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {spotsLeft} {t("left")}
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
                      {formatDistanceKm(distKm)} {t("away")}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Zalo Join Card */}
            <a
              href={ZALO_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => mouseflowTag("zalo_intent:carousel")}
              className="flex w-[min(280px,calc(100vw-3rem))] shrink-0 flex-col items-center justify-center rounded-xl border border-emerald-200 p-3 text-center shadow-sm transition hover:shadow-md dark:border-emerald-800"
              style={{ background: "linear-gradient(135deg, #e6f9ee 0%, #d1f5e0 50%, #c3f0d4 100%)" }}
            >
              <svg viewBox="0 0 48 48" className="mb-2 h-10 w-10" aria-hidden>
                <circle cx="24" cy="24" r="24" fill="#0068FF" />
                <path d="M12.5 16.5c0-2.21 1.79-4 4-4h15c2.21 0 4 1.79 4 4v9c0 2.21-1.79 4-4 4h-3.5l-4.5 4v-4h-7c-2.21 0-4-1.79-4-4v-9z" fill="white" />
              </svg>
              <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{t("getFreeSessions")}</span>
              <span className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">{t("joinZaloGroup")}</span>
            </a>
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
        ) : hasTimeGroups ? (
          <TimeGroupedList
            groups={timeGroupedSessions}
            visibleCount={visibleCount}
            userLocation={userLocation}
            hcmMedianCostPerHour={hcmMedianCostPerHour}
          />
        ) : (
          <div className="grid min-w-0 items-stretch gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, visibleCount).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                userLocation={userLocation}
                hcmMedianCostPerHour={hcmMedianCostPerHour}
              />
            ))}
          </div>
        )}

        {!loading && viewMode === "list" && filtered.length > visibleCount && (
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
                {t("sessionDetails")}
              </h2>
              <button
                type="button"
                onClick={() => setFreeTonightDetail(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:bg-primary/10 hover:text-foreground"
              >
                {t("close")}
              </button>
            </div>
            <SessionCard
              session={freeTonightDetail}
              userLocation={userLocation}
              hcmMedianCostPerHour={hcmMedianCostPerHour}
            />
          </div>
        </div>
      ) : null}

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

      {/* Copy toast */}
      {copyToast && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-[110] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          {t("copiedToast")}
        </div>
      )}
    </div>
  );
}
