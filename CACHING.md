# Caching in pickleball-hub

The app is deployed on **Vercel** (Next.js). Caching is intentional and split across **CDN / browser** (`Cache-Control`), **Next.js** (on-demand and ISR), and a **client-side in-memory** layer. There is no `vercel.json` in the repo; behavior comes from Next.js and response headers Vercel’s edge applies.

---

## 1. HTTP: `Cache-Control` (browser + Vercel CDN)

Defined in `src/lib/http-cache-headers.ts`.

### Public listing APIs (clubs, venues, dashboard JSON, stats)

- **Header:** `public, max-age=300, s-maxage=3600, stale-while-revalidate=14400`
- **Meaning:**
  - **Browser (`max-age=300`):** may reuse a response for up to **5 minutes** before revalidating (cheap when the CDN is warm).
  - **CDN (`s-maxage=3600`):** Vercel’s edge is allowed to treat the response as **fresh for 1 hour** (`s-maxage` applies to shared caches like the CDN, not the browser’s private cache in the same way, but the combined header is the standard pattern).
  - **Stale-while-revalidate (14400s):** for up to **4 hours** after freshness expires, the CDN can **serve a stale copy** while revalidating in the background.

These routes attach `CACHE_CONTROL_PUBLIC_LISTINGS` on successful JSON responses, for example:

- `/api/clubs`, `/api/clubs/[slug]`
- `/api/venues`, `/api/venues/[id]`
- `/api/dashboard/organizer`, `/api/dashboard/venue`
- `/api/dashboard/compare-clubs`, `/api/dashboard/compare-venues`
- `/api/dashboard/organizer/stats`, `/api/dashboard/organizer/market-median-series`

Rationale in code comments: public listings change on the order of **~twice per day**, so short browser TTL + 1h CDN + SWR reduces load while staying reasonably fresh.

### Sessions list API

- **Header:** `public, max-age=60, s-maxage=300, stale-while-revalidate=3600` (via `CACHE_CONTROL_SESSIONS` in `src/lib/http-cache-headers.ts`)
- **File:** `src/app/api/sessions/route.ts` — `export const dynamic = "force-dynamic"` is **not** set so the response is not forced uncacheable at the framework level.
- The home page client `fetch` uses `next: { revalidate: 300 }` where the Next build supports the extended `fetch` cache, and the API `Cache-Control` also allows a short public cache for **browser / CDN** hits (LCP).

The sessions list still revalidates after scrapes (on-demand) and the TTLs are short to limit staleness of booking-related data.

---

## 2. On-demand revalidation (Next.js cache, triggered after scrapes)

**Route:** `POST /api/revalidate` — `src/app/api/revalidate/route.ts`

- Protected by header `x-revalidate-token` matching `REVALIDATE_SECRET` (set on Vercel and on the scraper side).
- Calls `revalidatePath` for: `/`, `/clubs`, `/dashboard/organizer`, `/dashboard/venue`, and `revalidatePath("/sessions/[referenceCode]", "page")` for **all public session detail pages** (the `[referenceCode]` segment is a Next.js App Router path pattern, not a literal URL).
- The **Railway scraper** (see `scraper/entrypoint.py`, `trigger_vercel_revalidation()`) best-effort POSTs to `VERCEL_APP_URL/api/revalidate` after a successful run so the **static / full route cache** in Next is invalidated for those entry points when new data lands, **including session detail pages** so they match fresh ingests without waiting for ISR or a new deploy.

This does not replace `Cache-Control` on API responses; it targets **Next.js cache** for the listed route segments. **Per-club** URLs (e.g. `/clubs/[slug]`) are still not on-demand revalidated as a group here—only the paths above.

---

## 3. Client in-memory cache (`public-api-cache`)

**File:** `src/lib/public-api-cache.ts`

- A **per-browser-tab `Map`**: key = request URL, value = `{ at, data }` with a default TTL of **4 hours** (`PUBLIC_API_CACHE_TTL_MS`).
- **Purpose:** avoid refetching the same API URL on every client navigation or filter tweak while the user stays in the same JS session (soft navigation).
- **Limitation:** in-memory only — **clears on full page reload** and is **not shared** across tabs or users.

`fetchPublicApiJson` wraps `fetch` and fills this cache. Several pages also call `readPublicApiCache` / `writePublicApiCache` around `fetch`.

### Important: home page sessions fetch

On the home page (`src/app/page.tsx`), the client:

1. Tries `readPublicApiCache` for `/api/sessions?...` for instant paint.
2. Fetches with **`cache: "no-store"`** so the **browser’s own HTTP cache** does not stick stale session lists despite the in-memory map.

The API still sends `no-store` on the response for defense in depth.

### Club profile default `fetch`

`src/app/clubs/[slug]/page.tsx` uses `fetch(url)` **without** `no-store` for the club API (which has the public listing `Cache-Control`). Browsers may cache that GET according to `max-age`; the in-memory cache is layered on top for repeat visits in the same session.

---

## 4. Incremental Static Regeneration (ISR) — one route

**File:** `src/app/sessions/[referenceCode]/page.tsx`

- `export const revalidate = 3600` → Next.js may serve a cached version of the **public session detail page** and regenerate it in the background, with a time window on the order of **one hour** (per Next’s ISR semantics).

In practice, session details change slowly; 3600s is a balance between static performance and freshness. **On-demand revalidation** (section 2) also runs `revalidatePath` for the dynamic session detail route after each successful scraper run, so those pages are refreshed in step with new data; ISR remains a backstop for visitors between scrapes.

---

## 5. Summary table

| Layer | What | Typical duration / behavior |
|--------|------|-----------------------------|
| Vercel CDN | `s-maxage` on public list APIs | ~1h fresh, up to 4h stale-while-revalidate |
| Browser | `max-age=300` on those same APIs | ~5 min before rechecking |
| Browser / Next `fetch` | `Cache-Control` on `/api/sessions` + home `fetch` with `next: { revalidate: 300 }` | ~60s browser, 5m CDN; Next data cache where applicable |
| Client JS | `public-api-cache` | Up to 4h per URL, same tab / bundle lifetime |
| Next | `revalidatePath` from scraper | After ingest: `/`, `/clubs`, dashboards, and `"/sessions/[referenceCode]"` (page) |
| Next | ISR on `/sessions/[referenceCode]` | `revalidate = 3600` (1h); complemented by on-demand revalidation after scrapes |

---

## 6. Environment variables (caching-related)

| Variable | Role |
|----------|------|
| `REVALIDATE_SECRET` | Token for `POST /api/revalidate` |
| `VERCEL_APP_URL` | Scraper: base URL of the deployed app (no trailing slash), e.g. `https://…vercel.app` |

See `pickleball-hub/.env.example` for comments.

---

## 7. Files to read when changing behavior

- `src/lib/http-cache-headers.ts` — CDN + browser policy strings
- `src/lib/public-api-cache.ts` — in-memory TTL and helpers
- `src/app/api/revalidate/route.ts` — which paths on-demand revalidate
- `scraper/entrypoint.py` — `trigger_vercel_revalidation()`

If you add new public JSON routes that are safe to cache, attach `CACHE_CONTROL_PUBLIC_LISTINGS` (or a new constant with its own numbers) and document the choice here.
