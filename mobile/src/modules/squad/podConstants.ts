/**
 * Mobile-local copy of Pod constants.
 * Source of truth: pickleball-hub/src/lib/pod-constants.ts
 * Keep these values in sync with that file when adding/changing names or limits.
 */

export const MIN_POD_NAME_LENGTH = 2;
export const MAX_POD_NAME_LENGTH = 24;
export const MAX_POD_MEMBERS = 4;

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
