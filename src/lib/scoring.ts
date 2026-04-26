export type DuprBadge = "competitive" | "mixed" | "casual";

export interface SessionScoreInput {
  confirmedPlayers: number;
  capacity: number;
  priceVnd: number;
  durationMinutes: number;
  hasZalo: boolean;
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

const HCM_AVG_COST_PER_HOUR = 35000;

export function computeSessionScore(input: SessionScoreInput): SessionScoreResult {
  const {
    confirmedPlayers,
    capacity,
    priceVnd,
    durationMinutes,
    hasZalo,
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

  let valueScore = 0;
  if (costPerHour === 0) valueScore = 80;
  else if (costPerHour <= HCM_AVG_COST_PER_HOUR * 0.6) valueScore = 100;
  else if (costPerHour <= HCM_AVG_COST_PER_HOUR * 0.8) valueScore = 85;
  else if (costPerHour <= HCM_AVG_COST_PER_HOUR) valueScore = 70;
  else if (costPerHour <= HCM_AVG_COST_PER_HOUR * 1.3) valueScore = 50;
  else valueScore = 30;
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

const DUPR_BADGE_EMOJI: Record<DuprBadge, string> = {
  competitive: "\u{1F3AF}",
  mixed: "\u{1F3BE}",
  casual: "\u{1F60A}",
};

export function getDuprBadgeEmoji(badge: DuprBadge): string {
  return DUPR_BADGE_EMOJI[badge];
}
