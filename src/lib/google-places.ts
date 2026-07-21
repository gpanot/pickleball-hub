import { prisma } from "@/lib/db";
import { haversineKm } from "@/lib/squad-geo";

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

export type GooglePlaceCandidate = {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export type NearbyVenueResult = GooglePlaceCandidate & {
  id: number | null;
  distanceKm: number;
  source: "google" | "database";
};

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }
  return key;
}

/** Strip `places/ChIJ...` → `ChIJ...` */
export function normalizePlaceId(raw: string): string {
  return raw.startsWith("places/") ? raw.slice("places/".length) : raw;
}

type PlacesTextSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
};

export async function searchPickleballPlaces(
  lat: number,
  lng: number,
  query = "pickleball court",
): Promise<GooglePlaceCandidate[]> {
  const key = getApiKey();
  const res = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 25000,
        },
      },
      maxResultCount: 20,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Google Places search failed:", res.status, body);
    throw new Error("Failed to search venues");
  }

  const data = (await res.json()) as PlacesTextSearchResponse;
  const places = data.places ?? [];

  return places
    .map((place) => {
      const placeId = place.id ? normalizePlaceId(place.id) : null;
      const name = place.displayName?.text?.trim();
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      if (!placeId || !name || latitude == null || longitude == null) return null;
      return {
        placeId,
        name,
        address: place.formattedAddress?.trim() || name,
        latitude,
        longitude,
      };
    })
    .filter((p): p is GooglePlaceCandidate => p !== null);
}

type PlaceDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

export async function fetchGooglePlaceDetails(placeId: string): Promise<GooglePlaceCandidate> {
  const key = getApiKey();
  const normalized = normalizePlaceId(placeId);
  const res = await fetch(`${PLACES_DETAILS_URL}/${encodeURIComponent(normalized)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("Google Place details failed:", res.status, body);
    throw new Error("Failed to load venue details");
  }

  const place = (await res.json()) as PlaceDetailsResponse;
  const name = place.displayName?.text?.trim();
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!name || latitude == null || longitude == null) {
    throw new Error("Incomplete venue details from Google");
  }

  return {
    placeId: place.id ? normalizePlaceId(place.id) : normalized,
    name,
    address: place.formattedAddress?.trim() || name,
    latitude,
    longitude,
  };
}

export async function resolveVenueFromGooglePlace(placeId: string) {
  const normalized = normalizePlaceId(placeId);

  const existing = await prisma.venue.findUnique({
    where: { googlePlaceId: normalized },
    select: { id: true, name: true, address: true, latitude: true, longitude: true, googlePlaceId: true },
  });
  if (existing) return existing;

  const details = await fetchGooglePlaceDetails(normalized);

  return prisma.venue.upsert({
    where: { googlePlaceId: details.placeId },
    create: {
      name: details.name,
      address: details.address,
      latitude: details.latitude,
      longitude: details.longitude,
      googlePlaceId: details.placeId,
    },
    update: {
      name: details.name,
      address: details.address,
      latitude: details.latitude,
      longitude: details.longitude,
    },
    select: { id: true, name: true, address: true, latitude: true, longitude: true, googlePlaceId: true },
  });
}

export async function findNearbyVenues(lat: number, lng: number, query?: string): Promise<NearbyVenueResult[]> {
  const [googlePlaces, dbVenues] = await Promise.all([
    searchPickleballPlaces(lat, lng, query?.trim() || "pickleball court"),
    prisma.venue.findMany({
      select: { id: true, name: true, address: true, latitude: true, longitude: true, googlePlaceId: true },
      take: 200,
    }),
  ]);

  const dbByPlaceId = new Map(
    dbVenues.filter((v) => v.googlePlaceId).map((v) => [v.googlePlaceId as string, v]),
  );

  const googlePlaceIds = new Set(googlePlaces.map((p) => p.placeId));

  const googleResults: NearbyVenueResult[] = googlePlaces.map((place) => {
    const linked = dbByPlaceId.get(place.placeId);
    return {
      ...place,
      id: linked?.id ?? null,
      distanceKm: haversineKm(lat, lng, place.latitude, place.longitude),
      source: linked ? "database" as const : "google" as const,
    };
  });

  const nearbyDbOnly: NearbyVenueResult[] = dbVenues
    .filter((v) => !v.googlePlaceId || !googlePlaceIds.has(v.googlePlaceId))
    .map((v) => ({
      placeId: v.googlePlaceId ?? `db-${v.id}`,
      id: v.id,
      name: v.name,
      address: v.address,
      latitude: v.latitude,
      longitude: v.longitude,
      distanceKm: haversineKm(lat, lng, v.latitude, v.longitude),
      source: "database" as const,
    }))
    .filter((v) => v.distanceKm <= 25)
    .filter((v) => {
      if (!query?.trim()) return true;
      const q = query.trim().toLowerCase();
      return v.name.toLowerCase().includes(q) || v.address.toLowerCase().includes(q);
    });

  const seen = new Set<string>();
  const merged: NearbyVenueResult[] = [];

  for (const item of [...googleResults, ...nearbyDbOnly]) {
    const key = item.id != null ? `id:${item.id}` : `place:${item.placeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  merged.sort((a, b) => a.distanceKm - b.distanceKm);
  return merged.slice(0, 25);
}
