/**
 * In-memory cache for public GET APIs. Survives Next.js soft navigations (same JS bundle).
 * Data is ingested ~twice daily; refetching on every tab change is unnecessary.
 */
const store = new Map<string, { at: number; value: unknown }>();

/** Default TTL: 4h — between typical syncs without holding stale data too long. */
export const PUBLIC_API_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export function readPublicApiCache<T>(url: string, ttlMs = PUBLIC_API_CACHE_TTL_MS): T | undefined {
  const row = store.get(url);
  if (!row) return undefined;
  if (Date.now() - row.at > ttlMs) {
    store.delete(url);
    return undefined;
  }
  return row.value as T;
}

export function writePublicApiCache(url: string, value: unknown) {
  store.set(url, { at: Date.now(), value });
}

/** GET JSON; uses cache on repeat URL within TTL. */
export async function fetchPublicApiJson<T>(url: string, ttlMs = PUBLIC_API_CACHE_TTL_MS): Promise<T> {
  const hit = readPublicApiCache<T>(url, ttlMs);
  if (hit !== undefined) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as T;
  writePublicApiCache(url, json);
  return json;
}
