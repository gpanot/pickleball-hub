"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { FillRateBar } from "@/components/FillRateBar";
import { SessionScoreAndDuprBadges, SessionScoreBreakdownPanel } from "@/components/SessionScoreBadge";
import { useI18n } from "@/lib/i18n";
import { buildSessionShareText } from "@/lib/share-session-text";
import { mouseflowTag } from "@/lib/analytics";
import {
  formatVND,
  formatDistanceKm,
  haversineKm,
  parseSessionType,
} from "@/lib/utils";
import type { SessionScoreInput } from "@/lib/scoring";
import { BOOK_PREVIEW_MAX_PX } from "@/hooks/useBookPreviewViewport";

const PREVIEW_BREAKPOINT_PX = BOOK_PREVIEW_MAX_PX;
const TRANSITION_MS = 300;

export type BookPreviewSession = {
  id: number;
  referenceCode: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  maxPlayers: number;
  feeAmount: number;
  costPerHour: number | null;
  joined: number;
  waitlisted: number;
  club: { name: string; slug: string; zaloUrl?: string | null; clubRank?: number };
  duprParticipationPct?: number | null;
  returningPlayerPct?: number | null;
  venue: { name: string; address: string; latitude?: number; longitude?: number } | null;
};

function reclubMeetUrl(referenceCode: string): string {
  return `https://reclub.co/m/${referenceCode}`;
}

export function SessionBookPreviewSheet({
  session,
  open,
  onClose,
  hcmMedianCostPerHour,
  userLocation,
  onShareClipboardToast,
}: {
  session: BookPreviewSession | null;
  open: boolean;
  onClose: () => void;
  hcmMedianCostPerHour: number;
  userLocation: { lat: number; lng: number } | null;
  onShareClipboardToast: () => void;
}) {
  const { t } = useI18n();
  const [entered, setEntered] = useState(false);

  const BREAKDOWN_KEY = "score_breakdown_open";
  const [breakdownOpen, setBreakdownOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(BREAKDOWN_KEY);
    return stored === null ? true : stored === "true";
  });

  const toggleBreakdown = useCallback(() => {
    setBreakdownOpen((prev) => {
      const next = !prev;
      localStorage.setItem(BREAKDOWN_KEY, String(next));
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !session) {
      setEntered(false);
      return;
    }
    setEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open, session]);

  // Sheet works on all viewports; no auto-close on resize.

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const scoreInput: SessionScoreInput | null = useMemo(() => {
    if (!session) return null;
    const sessionType = parseSessionType(session.name);
    return {
      confirmedPlayers: session.joined,
      capacity: session.maxPlayers,
      priceVnd: session.feeAmount,
      durationMinutes: session.durationMin,
      hasZalo: Boolean(session.club.zaloUrl),
      hcmMedianCostPerHour,
      sessionType,
      duprParticipationPct: session.duprParticipationPct,
      returningPlayerPct: session.returningPlayerPct,
    };
  }, [session, hcmMedianCostPerHour]);

  const shareSession = useCallback(async () => {
    if (!session || !scoreInput) return;
    const shareText = buildSessionShareText(
      {
        name: session.name,
        venue: session.venue,
        club: session.club,
        startTime: session.startTime,
        endTime: session.endTime,
        feeAmount: session.feeAmount,
        referenceCode: session.referenceCode,
        costPerHour: session.costPerHour,
        durationMin: session.durationMin,
      },
      scoreInput,
      t,
    );

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: shareText });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      onShareClipboardToast();
    }
  }, [session, scoreInput, t, onShareClipboardToast]);

  const onContinue = useCallback(() => {
    if (!session) return;
    mouseflowTag("converted:reclub_click");
    window.open(reclubMeetUrl(session.referenceCode), "_blank", "noopener,noreferrer");
    onClose();
  }, [session, onClose]);

  if (!open || !session || !scoreInput || typeof document === "undefined") {
    return null;
  }

  const distanceKm =
    userLocation &&
    session.venue?.latitude != null &&
    session.venue?.longitude != null
      ? haversineKm(
          userLocation.lat,
          userLocation.lng,
          session.venue.latitude,
          session.venue.longitude,
        )
      : null;

  const overlayClass =
    "fixed inset-0 z-[120] bg-black/50 transition-opacity ease " +
    (entered ? "opacity-100" : "opacity-0");
  const sheetTransform = entered ? "translateY(0)" : "translateY(100%)";

  const portal = (
    <>
      <button
        type="button"
        aria-label={t("close")}
        className={overlayClass}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-book-preview-title"
        className="fixed bottom-0 left-0 right-0 z-[121] flex flex-col rounded-t-[16px] bg-white font-sans shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform ease dark:border-t dark:border-card-border dark:bg-card"
        style={{
          transform: sheetTransform,
          transitionDuration: `${TRANSITION_MS}ms`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-col items-center pt-3 pb-1" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-muted-foreground/35" />
        </div>
        <div className="shrink-0 px-4 pb-3">
          <h2 id="session-book-preview-title" className="text-base font-bold leading-snug text-foreground">
            {session.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {session.club.name}
            {session.venue?.name ? ` · ${session.venue.name}` : ""}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {session.startTime} – {session.endTime}
            {distanceKm != null && <> · {formatDistanceKm(distanceKm)}</>}
          </p>
          <div className="mt-1">
            <span className="text-lg font-bold tabular-nums">{formatVND(session.feeAmount)}</span>
          </div>
          <div className="mt-2">
            <FillRateBar joined={session.joined} maxPlayers={session.maxPlayers} waitlisted={session.waitlisted} />
          </div>
          <div className="mt-2">
            <SessionScoreAndDuprBadges input={scoreInput} />
          </div>
          <div className="mt-3 border-t border-card-border pt-3">
            <button
              type="button"
              onClick={toggleBreakdown}
              className="mb-2 flex w-full items-center justify-between text-left"
            >
              <span className="text-xs font-medium text-muted-foreground">{t("scoreHowCalculated")}</span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted-foreground transition-transform duration-200"
                style={{ transform: breakdownOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {breakdownOpen && <SessionScoreBreakdownPanel input={scoreInput} />}
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t border-card-border bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:bg-card">
          <button
            type="button"
            onClick={() => void shareSession()}
            className="box-border flex min-h-[44px] w-full items-center justify-center rounded-lg border-2 border-primary bg-transparent px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-primary/5"
          >
            {t("shareThisSession")}
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="box-border flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-dark"
          >
            {t("continueToReclub")}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(portal, document.body);
}
