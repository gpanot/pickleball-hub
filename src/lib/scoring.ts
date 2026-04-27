export type DuprBadge = "competitive" | "mixed" | "casual";

export interface SessionScoreInput {
  confirmedPlayers: number;
  capacity: number;
  priceVnd: number;
  durationMinutes: number;
  hasZalo: boolean;
  /** Median VND/hour for the session's calendar day (compute once, pass to all sessions). */
  hcmMedianCostPerHour: number;
  /** When set (e.g. from roster scrape), drives DUPR badge thresholds. */
  duprParticipationPct?: number | null;
  /** Legacy shape from spec; prefer duprParticipationPct when wired. */
  duprRatedCount?: number;
  totalPlayersWithProfile?: number;
}

export interface SessionScoreResult {
  score: number;
  fillScore: number;
  valueScore: number;
  zaloScore: number;
  breakdown: Record<string, number>;
  duprBadge: DuprBadge | null;
  duprPercent: number | null;
}

/** Fallback median (VND/hr) when sample is too small; only used inside `computeHcmMedianCostPerHour`. */
export const HCM_MEDIAN_COST_FALLBACK = 35000;

export type HcmMedianSessionSample = {
  feeAmount: number;
  durationMinutes: number;
  /** Ranking position by est. revenue (lower = better); omit if club has no stat for the day. */
  clubRank?: number;
};

/**
 * Median cost/hour (VND) from session samples, preferring clubs ranked in the top 100 by revenue.
 * Falls back to all sessions if the top-100 pool has fewer than MIN_SAMPLE rows.
 */
export function computeHcmMedianCostPerHour(
  sessions: HcmMedianSessionSample[],
): number {
  const MIN_SAMPLE = 20;

  const top100Sessions = sessions.filter(
    (s) => s.clubRank !== undefined && s.clubRank <= 100,
  );

  const pool =
    top100Sessions.length >= MIN_SAMPLE ? top100Sessions : sessions;

  const costPerHours = pool
    .filter((s) => s.feeAmount > 0 && s.durationMinutes > 0)
    .map((s) => (s.feeAmount / s.durationMinutes) * 60);

  if (costPerHours.length < MIN_SAMPLE) return HCM_MEDIAN_COST_FALLBACK;

  const sorted = [...costPerHours].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function computeSessionScore(input: SessionScoreInput): SessionScoreResult {
  const {
    confirmedPlayers,
    capacity,
    priceVnd,
    durationMinutes,
    hasZalo,
    hcmMedianCostPerHour,
    duprParticipationPct,
    duprRatedCount,
    totalPlayersWithProfile,
  } = input;

  const fillRate = capacity > 0 ? Math.min(confirmedPlayers / capacity, 1) : 0;
  const costPerHour = durationMinutes > 0 ? (priceVnd / durationMinutes) * 60 : 0;

  let fillScore = 0;
  if (fillRate >= 0.9) fillScore = 85;
  else if (fillRate >= 0.7) fillScore = 100;
  else if (fillRate >= 0.5) fillScore = 75;
  else if (fillRate >= 0.3) fillScore = 50;
  else fillScore = 20;
  const weightedFill = fillScore * 0.35;

  const median = hcmMedianCostPerHour > 0 ? hcmMedianCostPerHour : HCM_MEDIAN_COST_FALLBACK;
  const minBand = median * 0.5;
  const maxBand = median * 1.75;

  let valueScore: number;
  if (costPerHour === 0) {
    valueScore = 100;
  } else if (costPerHour <= minBand) {
    valueScore = 100;
  } else if (costPerHour >= maxBand) {
    valueScore = 30;
  } else {
    const ratio = (costPerHour - minBand) / (maxBand - minBand);
    valueScore = Math.round(100 - ratio * 70);
  }
  const weightedValue = valueScore * 0.3;

  const zaloScore = hasZalo ? 100 : 0;
  const weightedZalo = zaloScore * 0.2;

  const retentionScore = 50;
  const weightedRetention = retentionScore * 0.15;

  const score = Math.round(weightedFill + weightedValue + weightedZalo + weightedRetention);

  let duprBadge: DuprBadge | null = null;
  let duprPercent: number | null = null;

  if (duprParticipationPct != null && !Number.isNaN(duprParticipationPct)) {
    duprPercent = Math.round(duprParticipationPct);
    if (duprPercent >= 30) duprBadge = "competitive";
    else if (duprPercent >= 10) duprBadge = "mixed";
    else duprBadge = "casual";
  } else if (
    duprRatedCount !== undefined &&
    totalPlayersWithProfile !== undefined &&
    totalPlayersWithProfile > 0
  ) {
    duprPercent = Math.round((duprRatedCount / totalPlayersWithProfile) * 100);
    if (duprPercent >= 30) duprBadge = "competitive";
    else if (duprPercent >= 10) duprBadge = "mixed";
    else duprBadge = "casual";
  }

  return {
    score,
    fillScore,
    valueScore,
    zaloScore,
    breakdown: {
      fill: weightedFill,
      value: weightedValue,
      zalo: weightedZalo,
      retention: weightedRetention,
    },
    duprBadge,
    duprPercent,
  };
}

export type ScoreRatingTier = "excellent" | "good" | "average" | "belowAvg";

const TIER_COLOR: Record<ScoreRatingTier, string> = {
  excellent: "#22c55e",
  good: "#84cc16",
  average: "#f59e0b",
  belowAvg: "#ef4444",
};

export function getScoreRatingTier(score: number): ScoreRatingTier {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 50) return "average";
  return "belowAvg";
}

/** Use `getScoreRatingTier` + i18n for the visible label. */
export function getScoreLabel(score: number): { color: string; ratingTier: ScoreRatingTier } {
  const ratingTier = getScoreRatingTier(score);
  return { color: TIER_COLOR[ratingTier], ratingTier };
}

/**
 * Color for “price vs HCM median” UI (e.g. breakdown bar). Uses {@link SessionScoreResult.valueScore} only,
 * not the composite session score, so the bar hue matches value vs market instead of overall tier.
 */
export function getValueScoreColor(valueScore: number): string {
  return TIER_COLOR[getScoreRatingTier(valueScore)];
}

/** English labels + emoji for DUPR tier; UI uses i18n for visible copy and omits emoji in pills. */
export function getDuprBadgeDisplay(badge: DuprBadge): { label: string; emoji: string } {
  switch (badge) {
    case "competitive":
      return { label: "Competitive", emoji: "🎯" };
    case "mixed":
      return { label: "Mixed", emoji: "🎾" };
    case "casual":
      return { label: "Casual", emoji: "😊" };
  }
}
