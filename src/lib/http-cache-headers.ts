/**
 * Browser + CDN caching for public listings that update ~twice per day.
 * - s-maxage=3600: Vercel CDN serves fresh for 1 hour
 * - stale-while-revalidate=14400: serve stale for up to 4 hours while revalidating in background
 * - max-age=300: browser re-checks after 5 minutes (fast since CDN hit)
 */
export const CACHE_CONTROL_PUBLIC_LISTINGS =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=14400";

/**
 * Sessions list API: short public cache (LCP) + SWR. On-demand revalidation / scrapes
 * still refresh the app; `export const dynamic = "force-dynamic"` is not used on this
 * route so this header is not stripped by Next.
 */
export const CACHE_CONTROL_SESSIONS =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=3600";
