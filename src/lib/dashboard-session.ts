/** Client-only localStorage keys for organizer / venue dashboard gate + logout */

export const ORGANIZER_UNLOCK_KEY = "pickleball-hub:organizer-unlocked";
export const VENUE_UNLOCK_KEY = "pickleball-hub:venue-unlocked";

export const SELECTED_CLUB_KEY = "pickleball-hub:selected-club";
export const SELECTED_VENUE_KEY = "pickleball-hub:selected-venue";

export const ORG_RIVALS_STORAGE_KEY = "pickleball-hub:org-rivals";
export const VENUE_RIVALS_STORAGE_KEY = "pickleball-hub:venue-rivals";

export function isOrganizerUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ORGANIZER_UNLOCK_KEY) === "1";
}

export function isVenueUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(VENUE_UNLOCK_KEY) === "1";
}

export function setOrganizerUnlocked(): void {
  localStorage.setItem(ORGANIZER_UNLOCK_KEY, "1");
}

export function setVenueUnlocked(): void {
  localStorage.setItem(VENUE_UNLOCK_KEY, "1");
}

/** Clears gate + club picker + rival picks for organizer flow */
export function clearOrganizerSession(): void {
  localStorage.removeItem(ORGANIZER_UNLOCK_KEY);
  localStorage.removeItem(SELECTED_CLUB_KEY);
  localStorage.removeItem(ORG_RIVALS_STORAGE_KEY);
}

/** Clears gate + venue picker + rival picks for venue flow */
export function clearVenueSession(): void {
  localStorage.removeItem(VENUE_UNLOCK_KEY);
  localStorage.removeItem(SELECTED_VENUE_KEY);
  localStorage.removeItem(VENUE_RIVALS_STORAGE_KEY);
}
