"use client";

import { useState, useEffect, useLayoutEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { ClubStatsCard } from "@/components/ClubStatsCard";
import { formatVND } from "@/lib/utils";
import { fetchPublicApiJson, readPublicApiCache } from "@/lib/public-api-cache";

const PAGE_SIZE = 50;

const MAP_HEIGHT_CLASS =
  "min-h-[300px] sm:min-h-[560px] h-[calc(100dvh-260px)] max-h-[900px] w-full";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => (
    <div className={`rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse ${MAP_HEIGHT_CLASS}`} />
  ),
});

type Club = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
  zaloUrl: string | null;
  phone: string | null;
  admins: string[];
  avgFillRate: number;
  avgFee: number;
  totalSessionsWeek: number;
  totalJoined: number;
  totalCapacity: number;
  latitude: number | null;
  longitude: number | null;
};

function formatLastUpdatedLabel(lastUpdatedAt: string | null): string {
  if (!lastUpdatedAt) return "Updated time unavailable";

  const dt = new Date(lastUpdatedAt);
  const vnDateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const vnTimeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const updatedDate = vnDateFmt.format(dt);
  const todayDate = vnDateFmt.format(new Date());
  const time = vnTimeFmt.format(dt).toLowerCase();

  if (updatedDate === todayDate) {
    return `Updated at ${time} today`;
  }

  return `Updated at ${time} on ${updatedDate}`;
}

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("members");
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, sortBy]);

  useLayoutEffect(() => {
    const url = "/api/clubs";
    const cached = readPublicApiCache<{ clubs: Club[]; lastUpdatedAt: string | null }>(url);
    if (cached) {
      setClubs(cached.clubs || []);
      setLastUpdatedAt(cached.lastUpdatedAt ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPublicApiJson<{ clubs: Club[]; lastUpdatedAt: string | null }>(url)
      .then((d) => {
        if (!cancelled) {
          setClubs(d.clubs || []);
          setLastUpdatedAt(d.lastUpdatedAt ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClubs([]);
          setLastUpdatedAt(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let result = clubs.filter(
      (c) =>
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.slug.toLowerCase().includes(search.toLowerCase())
    );

    switch (sortBy) {
      case "sessions":
        result.sort((a, b) => b.totalSessionsWeek - a.totalSessionsWeek);
        break;
      case "players":
        result.sort((a, b) => b.totalJoined - a.totalJoined);
        break;
      case "fillRate":
        result.sort((a, b) => b.avgFillRate - a.avgFillRate);
        break;
      case "price":
        result.sort((a, b) => a.avgFee - b.avgFee);
        break;
      default:
        result.sort((a, b) => b.numMembers - a.numMembers);
    }

    return result;
  }, [clubs, search, sortBy]);

  const mapPins = useMemo(() => {
    return filtered
      .filter((c) => c.latitude && c.longitude)
      .map((c) => ({
        lat: c.latitude!,
        lng: c.longitude!,
        label: c.name,
        fillRate: c.avgFillRate,
        price: formatVND(c.avgFee),
        popup: `<strong>${c.name}</strong><br/>Avg price: ${formatVND(c.avgFee)}<br/>Fill rate: ${Math.round(c.avgFillRate * 100)}%<br/>${c.totalJoined}/${c.totalCapacity} players today`,
      }));
  }, [filtered]);

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Club Directory</h1>
        <p className="text-sm text-muted">
          {clubs.length} pickleball clubs in Ho Chi Minh City
          {clubs.length > 0 && (
            <>
              {" "}
              · {formatLastUpdatedLabel(lastUpdatedAt)}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
        <input
          type="text"
          placeholder="Search clubs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm outline-none focus:border-primary flex-1 min-w-0 min-h-[44px]"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-card-border bg-background px-3 py-2 text-sm min-h-[44px] sm:w-auto w-full"
        >
          <option value="members">Most members</option>
          <option value="sessions">Most sessions</option>
          <option value="players">Most players</option>
          <option value="fillRate">Highest fill rate</option>
          <option value="price">Lowest price</option>
        </select>
      </div>

      <div className="flex gap-2 mb-4 sm:mb-6">
        <button
          onClick={() => setViewMode("grid")}
          className={`rounded-lg px-4 py-2.5 sm:py-1.5 text-sm font-medium transition min-h-[44px] ${
            viewMode === "grid"
              ? "bg-primary text-white"
              : "bg-card border border-card-border hover:border-primary/30"
          }`}
        >
          Grid
        </button>
        <button
          onClick={() => setViewMode("map")}
          className={`rounded-lg px-4 py-2.5 sm:py-1.5 text-sm font-medium transition min-h-[44px] ${
            viewMode === "map"
              ? "bg-primary text-white"
              : "bg-card border border-card-border hover:border-primary/30"
          }`}
        >
          Map
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-card border border-card-border animate-pulse" />
          ))}
        </div>
      ) : viewMode === "map" ? (
        <MapView pins={mapPins} className={MAP_HEIGHT_CLASS} showLocateButton />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p className="text-lg mb-2">No clubs found</p>
          <p className="text-sm">Try adjusting your search.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.slice(0, visibleCount).map((c) => (
              <ClubStatsCard key={c.id} club={c} />
            ))}
          </div>
          {filtered.length > visibleCount && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-lg border border-card-border bg-card px-6 py-3 text-sm font-medium text-foreground transition hover:border-primary/40 hover:shadow-sm min-h-[44px]"
              >
                Show more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
