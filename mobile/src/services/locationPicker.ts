import * as Location from 'expo-location';
import { useAuthStore } from '../stores/authStore';

export interface CurrentLocation {
  lat: number;
  lng: number;
  label: string; // "Current location"
}

export interface RecentSpot {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  lastUsedAt: string; // ISO
}

export interface PreferredPlace {
  lat: number;
  lng: number;
  label: string;
  pinnedAt: string; // ISO
}

function authedFetch(path: string, init?: RequestInit) {
  return useAuthStore.getState().authedFetch(path, init);
}

/**
 * Request foreground location permission and return current GPS coords.
 * Returns null if permission is denied or unavailable.
 */
export async function getCurrentLocation(): Promise<CurrentLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      label: 'Current location',
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the 10 most recent distinct Conquest venue spots for this player.
 * Returns [] on error.
 */
export async function getRecentSpots(): Promise<RecentSpot[]> {
  try {
    const res = await authedFetch('/api/play-intent/places/history');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.history as RecentSpot[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch the player's pinned preferred places.
 * Returns [] on error.
 */
export async function getPreferredPlaces(): Promise<PreferredPlace[]> {
  try {
    const res = await authedFetch('/api/play-intent/places');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.places as PreferredPlace[]) ?? [];
  } catch {
    return [];
  }
}

/**
 * Pin a new preferred place. Returns updated list or throws.
 */
export async function addPreferredPlace(
  lat: number,
  lng: number,
  label: string
): Promise<PreferredPlace[]> {
  const res = await authedFetch('/api/play-intent/places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, label }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to add place');
  }
  const data = await res.json();
  return (data.places as PreferredPlace[]) ?? [];
}

/**
 * Delete a pinned preferred place by 0-based index.
 */
export async function removePreferredPlace(index: number): Promise<PreferredPlace[]> {
  const res = await authedFetch(`/api/play-intent/places/${index}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to remove place');
  const data = await res.json();
  return (data.places as PreferredPlace[]) ?? [];
}
