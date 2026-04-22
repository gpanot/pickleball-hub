"use client";

import { fillRateBgColor, fillRateLabel } from "@/lib/utils";

interface FillRateBarProps {
  joined: number;
  maxPlayers: number;
  waitlisted?: number;
  showLabel?: boolean;
}

export function FillRateBar({ joined, maxPlayers, waitlisted = 0, showLabel = true }: FillRateBarProps) {
  const rate = maxPlayers > 0 ? joined / maxPlayers : 0;
  const pct = Math.min(rate * 100, 100);
  const bgColor = fillRateBgColor(rate);
  const label = fillRateLabel(rate);

  return (
    <div className="flex min-w-0 w-full max-w-full items-center gap-1.5 sm:gap-2">
      <div className="min-w-0 flex-1 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${bgColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium tabular-nums whitespace-nowrap">
        {joined}/{maxPlayers}
        {waitlisted > 0 && <span className="text-red-400"> +{waitlisted}w</span>}
      </span>
      {showLabel && (
        <span className={`shrink-0 text-xs font-semibold ${rate >= 1 ? "text-red-500" : rate >= 0.75 ? "text-yellow-500" : "text-green-500"}`}>
          {label}
        </span>
      )}
    </div>
  );
}
