export type PaddleBrand = 'joola' | 'selkirk' | 'gearbox' | 'six_zero' | 'crbn' | 'vatic_pro' | 'facolos' | 'sypik';

export const PADDLE_BRANDS: PaddleBrand[] = ['joola', 'selkirk', 'gearbox', 'six_zero', 'crbn', 'vatic_pro', 'facolos', 'sypik'];

/**
 * Shared XP-to-level lookup. Works for both squad XP and brand XP.
 * Returns 1-based level. Thresholds[0] must be 0.
 * Above the last threshold, levels keep incrementing every `overflowStep` XP.
 */
export function getLevelFromThresholds(
  xp: number,
  thresholds: readonly number[],
  overflowStep = 4000,
): number {
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) {
    if (xp >= thresholds[i]) level = i + 1;
    else break;
  }
  if (xp >= thresholds[thresholds.length - 1]) {
    let threshold = thresholds[thresholds.length - 1];
    level = thresholds.length;
    while (true) {
      threshold += overflowStep;
      if (xp >= threshold) level++;
      else break;
    }
  }
  return level;
}

// 10 support levels; no overflow (brand level caps at 10 in Phase 1)
export const BRAND_LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500, 11500] as const;

export function getBrandLevelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < BRAND_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= BRAND_LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(level, BRAND_LEVEL_THRESHOLDS.length);
}

export const BRAND_BONUSES: Record<
  PaddleBrand,
  { pvpRewardPct: number; territoryInfPct: number; label: string }
> = {
  joola:     { pvpRewardPct: 5, territoryInfPct: 3, label: 'Aggressive — fast attacks' },
  selkirk:   { pvpRewardPct: 3, territoryInfPct: 5, label: 'Balanced — reliable defense' },
  gearbox:   { pvpRewardPct: 4, territoryInfPct: 4, label: 'Consistency — streak bonuses' },
  six_zero:  { pvpRewardPct: 2, territoryInfPct: 6, label: 'Team play — Pod synergy' },
  crbn:      { pvpRewardPct: 7, territoryInfPct: 1, label: 'High risk — power spikes' },
  vatic_pro: { pvpRewardPct: 4, territoryInfPct: 4, label: 'Underdog — efficient leveling' },
  facolos:   { pvpRewardPct: 3, territoryInfPct: 6, label: 'Precision — control & placement' },
  sypik:     { pvpRewardPct: 6, territoryInfPct: 2, label: 'Dynamic — momentum builder' },
};

export const BRAND_SWITCH_RESET_THRESHOLD_LEVEL = 1;
