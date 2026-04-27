"use client";

import { createPortal } from "react-dom";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  computeSessionScore,
  getScoreLabel,
  type DuprBadge,
  type SessionScoreInput,
  type SessionScoreResult,
} from "@/lib/scoring";
import { scoreRatingTranslationKey } from "@/lib/score-translations";
import { useI18n, type TranslationKey } from "@/lib/i18n";

const FILL_GREEN = "#22c55e";
const COMMUNITY_ACTIVE = "#22c55e";
const COMMUNITY_INACTIVE = "#9ca3af";
const VIBE_GREY = "#9ca3af";

const MOBILE_MAX_PX = 767;

const RATING_PILL_SURFACE_CLASS =
  "inline-flex max-w-full flex-col items-end gap-0.5 rounded-lg border px-2 py-1 text-left";

function ratingPillSurfaceStyle(scoreColor: string) {
  return {
    backgroundColor: `${scoreColor}20`,
    borderColor: scoreColor,
    color: scoreColor,
  } as const;
}

function isDuprParticipationLoading(duprParticipationPct: number | null | undefined): boolean {
  return duprParticipationPct == null || (typeof duprParticipationPct === "number" && Number.isNaN(duprParticipationPct));
}

function duprTierLabel(badge: DuprBadge, t: (key: TranslationKey) => string): string {
  switch (badge) {
    case "competitive":
      return t("scoreDuprTierCompetitive");
    case "mixed":
      return t("scoreDuprTierMixed");
    case "casual":
      return t("scoreDuprTierCasual");
  }
}

function RatingPillBody({
  result,
  scoreLabel,
  duprParticipationPct,
  t,
}: {
  result: SessionScoreResult;
  scoreLabel: string;
  duprParticipationPct: number | null | undefined;
  t: (key: TranslationKey) => string;
}) {
  const duprLoading = isDuprParticipationLoading(duprParticipationPct);

  return (
    <>
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold leading-tight sm:text-xs">
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          className="shrink-0 opacity-90"
          aria-hidden
          fill="currentColor"
        >
          <path d="M12 2l2.39 7.26h7.72l-6.25 4.54 2.39 7.26-6.25-4.54-6.25 4.54 2.39-7.26-6.25-4.54h7.72L12 2z" />
        </svg>
        <span>
          {result.score} · {scoreLabel}
        </span>
      </span>
      {duprLoading ? (
        <span className="max-w-[180px] truncate text-[10px] font-normal leading-tight text-muted-foreground">
          {t("scoreDuprLineLoading")}
        </span>
      ) : result.duprBadge != null && result.duprPercent != null ? (
        <span className="max-w-[180px] truncate text-[10px] font-normal leading-tight text-muted-foreground">
          {`${result.duprPercent}% DUPR · ${duprTierLabel(result.duprBadge, t)}`}
        </span>
      ) : null}
    </>
  );
}

function pctWidth(score: number): number {
  return Math.min(100, Math.max(0, score));
}

const SCORE_BREAK_LABEL_COL = "flex w-[6.75rem] shrink-0 flex-col gap-0.5 text-left sm:w-[7.25rem]";

function ScoreBreakRow({
  label,
  subtitle,
  placeholder,
  pct,
  fillColor,
  trackClassName,
}: {
  label: string;
  subtitle: string;
  placeholder?: boolean;
  pct?: number;
  fillColor?: string;
  trackClassName?: string;
}) {
  return (
    <div className="flex min-h-[48px] items-start gap-3">
      <div className={SCORE_BREAK_LABEL_COL}>
        <span className="text-[11px] font-normal leading-tight text-foreground">{label}</span>
        <span className="text-[10px] leading-snug text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex min-h-[48px] min-w-0 flex-1 items-start justify-center self-stretch px-1 pt-[3px]">
        {placeholder ? (
          <div
            className="relative h-2 w-full max-w-[9rem] rounded border border-dashed opacity-90"
            style={{ borderColor: VIBE_GREY, backgroundColor: `${VIBE_GREY}18` }}
          />
        ) : (
          <div
            className={`relative h-2 w-full max-w-[9rem] overflow-hidden rounded-full ${trackClassName ?? "bg-muted/35"}`}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${pctWidth(pct ?? 0)}%`, backgroundColor: fillColor }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerLevelsRow({
  duprParticipationPct,
  result,
  t,
}: {
  duprParticipationPct: number | null | undefined;
  result: SessionScoreResult;
  t: (key: TranslationKey) => string;
}) {
  const loading = isDuprParticipationLoading(duprParticipationPct);

  return (
    <div className="flex min-h-[48px] items-start gap-3 pt-0.5">
      <div className={SCORE_BREAK_LABEL_COL}>
        <span className="text-[11px] font-normal leading-tight text-foreground">{t("scorePlayerLevels")}</span>
        <span className="text-[10px] leading-snug text-muted-foreground">{t("scoreDuprRosterSubtitle")}</span>
      </div>
      <div className="flex min-h-[48px] min-w-0 flex-1 items-start justify-end self-stretch px-1 pt-[3px]">
        {loading ? (
          <span className="max-w-full text-right text-[10px] leading-snug text-muted-foreground">
            {t("scoreDuprLineLoading")}
          </span>
        ) : result.duprPercent != null && result.duprBadge ? (
          <span className="max-w-full text-right text-[11px] font-normal leading-tight text-foreground">
            {`${result.duprPercent}% DUPR · ${duprTierLabel(result.duprBadge, t)}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ScoreBreakdownContent({
  result,
  input,
  communityColor,
  scoreColor,
  scoreLabel,
  showHeaderRatingPill,
  t,
}: {
  result: SessionScoreResult;
  input: SessionScoreInput;
  communityColor: string;
  scoreColor: string;
  /** Localized label for the session score tier. */
  scoreLabel: string;
  /** When true (mobile sheet), show the same rating pill as the trigger, right-aligned in the header row. */
  showHeaderRatingPill?: boolean;
  t: (key: TranslationKey) => string;
}) {
  return (
    <>
      {showHeaderRatingPill ? (
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{t("scoreHowCalculated")}</p>
          <div
            className={`${RATING_PILL_SURFACE_CLASS} pointer-events-none shrink-0`}
            style={ratingPillSurfaceStyle(scoreColor)}
            aria-hidden
          >
            <RatingPillBody
              result={result}
              scoreLabel={scoreLabel}
              duprParticipationPct={input.duprParticipationPct}
              t={t}
            />
          </div>
        </div>
      ) : (
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{t("scoreHowCalculated")}</p>
      )}
      <div className="flex flex-col gap-2">
        <div className="h-px w-full shrink-0 bg-card-border" aria-hidden />
        <ScoreBreakRow
          label={t("scoreBreakFillLabel")}
          subtitle={t("scoreBreakFillSubtitle")}
          pct={result.fillScore}
          fillColor={FILL_GREEN}
        />
        <ScoreBreakRow
          label={t("scoreBreakPriceLabel")}
          subtitle={t("scoreBreakPriceSubtitle")}
          pct={result.valueScore}
          fillColor={scoreColor}
        />
        <ScoreBreakRow
          label={t("scoreBreakOrganisedLabel")}
          subtitle={t("scoreBreakOrganisedSubtitle")}
          pct={result.zaloScore}
          fillColor={communityColor}
        />
        <ScoreBreakRow
          label={t("scoreBreakRegularsLabel")}
          subtitle={t("scoreBreakRegularsSubtitle")}
          placeholder
        />
        <div className="h-px w-full shrink-0 bg-card-border" aria-hidden />
        <PlayerLevelsRow duprParticipationPct={input.duprParticipationPct} result={result} t={t} />
      </div>
    </>
  );
}

function useIsMobileSheet(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX_PX}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isMobile;
}

export function SessionScoreBadge({
  input,
  className = "",
}: {
  input: SessionScoreInput;
  className?: string;
}) {
  const { t } = useI18n();
  const result = computeSessionScore(input);
  const { color, ratingTier } = getScoreLabel(result.score);
  const scoreTextLabel = t(scoreRatingTranslationKey(ratingTier));
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const isMobile = useIsMobileSheet();
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (isMobile) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const closeSheet = useCallback(() => {
    setOpen(false);
    setDragY(0);
    dragStartY.current = null;
  }, []);

  const communityColor = input.hasZalo ? COMMUNITY_ACTIVE : COMMUNITY_INACTIVE;

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    setDragY(0);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    const delta = e.clientY - dragStartY.current;
    setDragY(Math.max(0, delta));
  };

  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current == null) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (dragY > 72) {
      closeSheet();
    } else {
      setDragY(0);
    }
    dragStartY.current = null;
  };

  const renderBreakdown = (showHeaderRatingPill: boolean) => (
    <ScoreBreakdownContent
      result={result}
      input={input}
      communityColor={communityColor}
      scoreColor={color}
      scoreLabel={scoreTextLabel}
      showHeaderRatingPill={showHeaderRatingPill}
      t={t}
    />
  );

  const sheetContent = open && isMobile && (
    <>
      <button
        type="button"
        aria-label={t("close")}
        className="fixed inset-0 z-[100] bg-black/50"
        onClick={closeSheet}
      />
      <div
        role="dialog"
        aria-modal="true"
        id={popoverId}
        className="fixed bottom-0 left-0 right-0 z-[101] max-h-[88vh] overflow-y-auto rounded-t-[16px] bg-white px-4 pb-6 pt-2 font-sans text-xs shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:border-t dark:border-card-border dark:bg-card"
        style={{ transform: `translateY(${dragY}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 flex cursor-grab touch-none flex-col items-center gap-2 active:cursor-grabbing"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="h-1 w-10 shrink-0 rounded-full bg-muted-foreground/35" aria-hidden />
        </div>
        {renderBreakdown(true)}
      </div>
    </>
  );

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggle}
        className={`${RATING_PILL_SURFACE_CLASS} transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
        style={ratingPillSurfaceStyle(color)}
        title={t("scoreHowCalculated")}
      >
        <RatingPillBody
          result={result}
          scoreLabel={scoreTextLabel}
          duprParticipationPct={input.duprParticipationPct}
          t={t}
        />
      </button>

      {open && !isMobile && (
        <div
          id={popoverId}
          role="dialog"
          className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,260px)] rounded-lg border border-card-border bg-card p-4 font-sans text-xs shadow-lg"
        >
          {renderBreakdown(false)}
        </div>
      )}

      {typeof document !== "undefined" && open && isMobile && createPortal(sheetContent, document.body)}
    </div>
  );
}
