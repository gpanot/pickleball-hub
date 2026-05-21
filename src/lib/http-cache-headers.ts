/**
 * Browser + CDN caching for public listings that update ~3x per day via scraper.
 * s-maxage=3600: CDN serves fresh for 1 hour.
 * stale-while-revalidate=86400: serve stale for up to 24h while revalidating in background.
 * max-age=300: browser re-checks after 5 minutes (fast since CDN hit).
 */
export const CACHE_CONTROL_PUBLIC_LISTINGS =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

/**
 * Sessions list API: moderate CDN cache + generous SWR window.
 * Data updates ~3x/day from scraper; between scrapes, stale is acceptable.
 */
export const CACHE_CONTROL_SESSIONS =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=7200";
