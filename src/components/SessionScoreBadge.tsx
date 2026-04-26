"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  computeSessionScore,
  getDuprBadgeLabel,
  getScoreLabel,
  type SessionScoreInput,
} from "@/lib/scoring";
import { useI18n } from "@/lib/i18n";

const FILL_GREEN = "#22c55e";
const COMMUNITY_ACTIVE = "#22c55e";
const COMMUNITY_INACTIVE = "#9ca3af";
const VIBE_GREY = "#9ca3af";

function pctWidth(score: number): number {
  return Math.min(100, Math.max(0, score));
}

function ScoreBarRow({
  label,
  pct,
  fillColor,
  trackClassName,
}: {
  label: string;
  pct: number;
  fillColor: string;
  trackClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[4.5rem] shrink-0 text-left text-[11px] text-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 justify-center px-1">
        <div
          className={`relative h-2 w-full max-w-[9rem] overflow-hidden rounded-full ${trackClassName ?? "bg-muted/35"}`}
        >
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${pctWidth(pct)}%`, backgroundColor: fillColor }}
          />
        </div>
      </div>
    </div>
  );
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
  const { label, color } = getScoreLabel(result.score);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
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
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((v) => !v);
  }, []);

  const communityColor = input.hasZalo ? COMMUNITY_ACTIVE : COMMUNITY_INACTIVE;

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={toggle}
        className="inline-flex max-w-full flex-col items-end gap-0.5 rounded-lg border px-2 py-1 text-left transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{
          backgroundColor: `${color}20`,
          borderColor: color,
          color,
        }}
        title={t("scoreHowCalculated")}
      >
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
            {result.score} · {label}
          </span>
        </span>
        {result.duprBadge && (
          <span className="max-w-[140px] truncate text-[10px] font-normal leading-tight text-muted">
            {getDuprBadgeLabel(result.duprBadge).emoji}{" "}
            {getDuprBadgeLabel(result.duprBadge).label}
            {result.duprPercent !== null && ` · ${result.duprPercent}%`}
          </span>
        )}
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,260px)] rounded-lg border border-card-border bg-card p-4 font-sans text-xs shadow-lg"
        >
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{t("scoreHowCalculated")}</p>
          <div className="flex flex-col gap-2">
            <div className="h-px w-full shrink-0 bg-card-border" aria-hidden />
            <ScoreBarRow label={t("scoreFill")} pct={result.fillScore} fillColor={FILL_GREEN} />
            <ScoreBarRow label={t("scoreValue")} pct={result.valueScore} fillColor={color} />
            <ScoreBarRow
              label={t("scoreCommunity")}
              pct={result.zaloScore}
              fillColor={communityColor}
            />
            <div className="flex items-center gap-3">
              <span className="w-[4.5rem] shrink-0 text-left text-[11px] text-foreground">
                {t("scoreVibe")}
              </span>
              <div className="flex min-w-0 flex-1 justify-center px-1">
                <div className="flex w-full max-w-[9rem] flex-col items-center gap-1">
                  <div
                    className="h-2 w-full rounded border border-dashed opacity-90"
                    style={{ borderColor: VIBE_GREY, backgroundColor: `${VIBE_GREY}18` }}
                  />
                  <span className="text-[10px] italic text-muted-foreground">{t("scoreSoon")}</span>
                </div>
              </div>
            </div>
          </div>
          {result.duprBadge && (
            <p className="mt-2 border-t border-card-border pt-2 text-[11px] text-muted-foreground">
              DUPR: {getDuprBadgeLabel(result.duprBadge).emoji}{" "}
              {getDuprBadgeLabel(result.duprBadge).label}
              {result.duprPercent !== null && ` · ${result.duprPercent}%`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
