export const HAS_SEEN_CAROUSEL_KEY = 'squadd_has_seen_carousel';

type ResetListener = () => void;
const resetListeners = new Set<ResetListener>();

/** Dev reset / storage clear — SquadModule listens to return to carousel slide 1. */
export function notifySquaddOnboardingReset() {
  resetListeners.forEach((listener) => listener());
}

export function subscribeSquaddOnboardingReset(listener: ResetListener) {
  resetListeners.add(listener);
  return () => {
    resetListeners.delete(listener);
  };
}
