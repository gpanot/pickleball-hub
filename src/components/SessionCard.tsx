"use client";

import { mouseflowTag } from "@/lib/analytics";
import { useIsBookPreviewViewport } from "@/hooks/useBookPreviewViewport";
import { FillRateBar } from "./FillRateBar";
import { SessionScoreBadge } from "./SessionScoreBadge";
import { perkEmoji, parseSessionType, haversineKm, formatDistanceKm } from "@/lib/utils";

interface SessionCardProps {
  userLocation?: { lat: number; lng: number } | null;
  /** Median VND/hr for the session list’s calendar day (from API). */
  hcmMedianCostPerHour: number;
  /** When set and viewport is narrow, "Book on Reclub" opens preview sheet instead of navigating. */
  onMobileBookPreview?: () => void;
  session: {
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
    club: { name: string; slug: string; zaloUrl?: string | null; clubRank?: number };
    duprParticipationPct?: number | null;
    venue: { name: string; address: string; latitude?: number; longitude?: number } | null;
  };
}

export function SessionCard({ session, userLocation, hcmMedianCostPerHour, onMobileBookPreview }: SessionCardProps) {
  const s = session;
  const isBookPreviewViewport = useIsBookPreviewViewport();
  const useMobileBookPreview = Boolean(onMobileBookPreview) && isBookPreviewViewport;
  const fillRate = s.maxPlayers > 0 ? s.joined / s.maxPlayers : 0;
  const sessionType = parseSessionType(s.name);
  const showWaitWarning = fillRate >= 0.9 && sessionType !== "roundrobin";

  const distanceKm =
    userLocation &&
    s.venue?.latitude != null &&
    s.venue?.longitude != null
      ? haversineKm(userLocation.lat, userLocation.lng, s.venue.latitude, s.venue.longitude)
      : null;

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col rounded-xl border border-card-border bg-card p-3 sm:p-4 transition hover:shadow-md hover:border-primary/30">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {s.startTime} - {s.endTime}
              </span>
            </div>
            <h3 className="mb-1 line-clamp-2 break-words text-sm font-semibold leading-tight">{s.name}</h3>
            <p className="mb-1 break-words text-xs text-muted">{s.club.name}</p>
            {s.venue && (
              <p className="truncate text-xs text-muted/70">
                📍 {s.venue.name}
                {distanceKm != null && (
                  <span className="text-muted"> · {formatDistanceKm(distanceKm)} away</span>
                )}
              </p>
            )}
            {s.perks.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {s.perks.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800"
                    title={p}
                  >
                    {perkEmoji(p)} {p}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <SessionScoreBadge
              input={{
                confirmedPlayers: s.joined,
                capacity: s.maxPlayers,
                priceVnd: s.feeAmount,
                durationMinutes: s.durationMin,
                hasZalo: Boolean(s.club.zaloUrl),
                hcmMedianCostPerHour,
                sessionType,
                duprParticipationPct: s.duprParticipationPct,
              }}
            />
          </div>
        </div>
        <div className="min-w-0 w-full">
          <FillRateBar joined={s.joined} maxPlayers={s.maxPlayers} waitlisted={s.waitlisted} />
          {showWaitWarning && (
            <div className="mt-2 min-w-0 break-words rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
              ⚠️ Likely wait between games 15-20min
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 shrink-0 border-t border-card-border pt-3">
        {useMobileBookPreview ? (
          <button
            type="button"
            onClick={() => {
              mouseflowTag("converted:reclub_click");
              onMobileBookPreview?.();
            }}
            className="box-border flex min-h-[44px] w-full max-w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-dark sm:inline-flex sm:w-auto sm:py-1.5 sm:text-xs"
          >
            Book on Reclub
          </button>
        ) : (
          <a
            href={s.eventUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => mouseflowTag("converted:reclub_click")}
            className="box-border flex min-h-[44px] w-full max-w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-primary-dark sm:inline-flex sm:w-auto sm:py-1.5 sm:text-xs"
          >
            Book on Reclub
          </a>
        )}
      </div>
    </div>
  );
}
