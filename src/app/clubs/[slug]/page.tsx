"use client";

import { useState, useEffect, use } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FillRateBar } from "@/components/FillRateBar";
import { formatVND } from "@/lib/utils";

const MapView = dynamic(() => import("@/components/MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-[50dvh] sm:h-[600px] rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />,
});

type ClubDetail = {
  id: number;
  name: string;
  slug: string;
  numMembers: number;
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

export default function ClubProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [club, setClub] = useState<ClubDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clubs/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setClub)
      .catch(() => setClub(null))
      .finally(() => setLoading(false));
  }, [slug]);

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
        <h1 className="text-xl font-bold mb-2">Club not found</h1>
        <Link href="/clubs" className="text-primary hover:underline">Back to clubs</Link>
      </div>
    );
  }

  const todaySessions = club.sessions.filter(
    (s) => s.scrapedDate === new Date().toISOString().split("T")[0]
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
        ← Back to clubs
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{club.name}</h1>
          <p className="text-sm text-muted mt-1">
            {club.numMembers.toLocaleString()} members
          </p>
        </div>
        <a
          href={`https://reclub.co/clubs/@${club.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium bg-primary text-white px-4 py-2.5 rounded-lg hover:bg-primary-dark transition min-h-[44px] text-center w-full sm:w-auto shrink-0"
        >
          View on Reclub
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <Stat label="Sessions / week" value={totalSessionsWeek.toString()} />
        <Stat label="Avg fill rate" value={`${Math.round(avgFillRate * 100)}%`} />
        <Stat label="Avg price" value={formatVND(Math.round(avgFee))} />
        <Stat
          label="Price range"
          value={priceRange ? `${formatVND(priceRange.min)} - ${formatVND(priceRange.max)}` : "N/A"}
        />
      </div>

      {venueLocations.length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">Venues</h2>
          <MapView pins={venueLocations} zoom={13} className="h-[50dvh] sm:h-[600px] w-full" showLocateButton />
        </div>
      )}

      <div>
        <h2 className="font-semibold mb-3">Today&apos;s Sessions ({todaySessions.length})</h2>
        {todaySessions.length === 0 ? (
          <p className="text-sm text-muted py-4">No sessions scheduled today.</p>
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
                    <div className="text-right text-sm font-bold shrink-0">
                      {formatVND(s.feeAmount)}
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
                      Book →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
