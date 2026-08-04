/**
 * Canonical sport level options used for guest skill labels.
 * Mirrors the mobile sportLevels.ts constants.
 *
 * sportId mapping: 1 = Pickleball, 2 = Padel/Paddle, 3 = Badminton
 */

export interface SportLevelOption {
  label: string;
  value: number | null;
}

export const LEVELS_PICKLEBALL: SportLevelOption[] = [
  { label: "2.0", value: 2.0 },
  { label: "2.5", value: 2.5 },
  { label: "3.0", value: 3.0 },
  { label: "3.5", value: 3.5 },
  { label: "4.0", value: 4.0 },
  { label: "4.5", value: 4.5 },
  { label: "5.0", value: 5.0 },
];

export const LEVELS_PADEL: SportLevelOption[] = [
  { label: "1.0", value: 1.0 },
  { label: "2.0", value: 2.0 },
  { label: "3.0", value: 3.0 },
  { label: "4.0", value: 4.0 },
  { label: "5.0", value: 5.0 },
];

export const LEVELS_BADMINTON: SportLevelOption[] = [
  { label: "Beginner", value: 1.0 },
  { label: "Intermediate", value: 3.0 },
  { label: "Advanced", value: 5.0 },
];

export function levelsForSportId(sportId: number | null | undefined): SportLevelOption[] {
  if (sportId === 2) return LEVELS_PADEL;
  if (sportId === 3) return LEVELS_BADMINTON;
  return LEVELS_PICKLEBALL;
}

export function validLabelsForSportId(sportId: number | null | undefined): Set<string> {
  return new Set(levelsForSportId(sportId).map((l) => l.label));
}
