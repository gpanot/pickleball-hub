export const MIN_POD_NAME_LENGTH = 2;
export const MAX_POD_NAME_LENGTH = 24;
export const MAX_POD_MEMBERS = 4;
// Phase 2 — synergy multiplier not built yet, constant reserved
export const MIN_POD_MEMBERS_FOR_SYNERGY = 2;

export const POD_SUGGESTED_NAMES: Record<string, string[]> = {
  partner:    ['Power Couple', 'Dynamic Duo'],
  friend:     ['Court Crew', 'Rally Mates'],
  group:      ['Morning Queens', 'Weekend Warriors'],
  colleagues: ['Office Warriors', 'Lunch Break League'],
  open_play:  ['Open Play Regulars'],
  solo:       ['Solo Samurai'],
};

export type PlayStyle = keyof typeof POD_SUGGESTED_NAMES;

export const POD_EMOJIS = ['🎯', '🔥', '⚡', '🌊', '💪', '🦅', '🐯', '🏹', '💥', '🌟', '🎮', '🚀'];

export function pickRandomPodEmoji(): string {
  return POD_EMOJIS[Math.floor(Math.random() * POD_EMOJIS.length)];
}

export function generateAutoPodName(playStyle: PlayStyle | null): string {
  const pool =
    playStyle && POD_SUGGESTED_NAMES[playStyle]
      ? POD_SUGGESTED_NAMES[playStyle]
      : Object.values(POD_SUGGESTED_NAMES).flat();
  const base = pool[Math.floor(Math.random() * pool.length)];
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base} ${suffix}`;
}
