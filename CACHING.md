# Caching in pickleball-hub

The app is deployed on **Vercel** (Next.js). Caching is split across **static HTML** (SSG for `/` and `/clubs` + selected session details), **CDN / browser** (`Cache-Control` on API routes), **on-demand revalidation** after the Railway scraper, and a **client-side in-memory** layer on some routes. There is no `vercel.json` in the repo.
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
- **File:** `src/app/api/sessions/route.ts` — kept for **dashboards, tooling, and other consumers** (not the public home page).
- **Home page** (`/`) no longer calls `/api/sessions`. It is a **server component** that loads data with `getSessions({ date })` in `page.tsx` and passes the result to `HomeClient` as props; filtering, sorting, and search run **entirely on the client** against that data.

---

## 2. On-demand revalidation (Next.js cache, triggered after scrapes)

**Route:** `POST /api/revalidate` — `src/app/api/revalidate/route.ts`

- Protected by header `x-revalidate-token` matching `REVALIDATE_SECRET` (set on Vercel and on the scraper side).
- Calls `revalidatePath` in this order: `/`, `/clubs`, `revalidatePath("/sessions/[referenceCode]", "page")` (all public session detail pages — `[referenceCode]` is the dynamic segment, not a literal path), `/dashboard/organizer`, `/dashboard/venue`.
- The **Railway scraper** (see `scraper/entrypoint.py`, `trigger_vercel_revalidation()`) best-effort POSTs to `VERCEL_APP_URL/api/revalidate` after a successful run so the **static / full route cache** in Next is invalidated for those entry points when new data lands, **including session detail pages** so they match fresh ingests without waiting for ISR or a new deploy.

This does not replace `Cache-Control` on API responses; it targets **Next.js cache** for the listed route segments. **Per-club** URLs (e.g. `/clubs/[slug]`) are still not on-demand revalidated as a group here—only the paths above.

---

## 3. Client in-memory cache (`public-api-cache`)

**File:** `src/lib/public-api-cache.ts`

- A **per-browser-tab `Map`**: key = request URL, value = `{ at, data }` with a default TTL of **4 hours** (`PUBLIC_API_CACHE_TTL_MS`).
- **Purpose:** avoid refetching the same API URL on every client navigation or filter tweak while the user stays in the same JS session (soft navigation).
- **Limitation:** in-memory only — **clears on full page reload** and is **not shared** across tabs or users.

`fetchPublicApiJson` wraps `fetch` and fills this cache. `readPublicApiCache` / `writePublicApiCache` are still used on some routes (e.g. **club profile** `src/app/clubs/[slug]/page.tsx`); the **home and clubs directory** no longer use them for their primary data (that data is server-props).

### Club profile default `fetch`

`src/app/clubs/[slug]/page.tsx` uses `fetch(url)` **without** `no-store` for the club API (which has the public listing `Cache-Control`). Browsers may cache that GET according to `max-age`; the in-memory cache is layered on top for repeat visits in the same session.

---

## 4. Session detail route (`/sessions/[referenceCode]`)

**File:** `src/app/sessions/[referenceCode]/page.tsx`

- `export const revalidate = false` — no time-based ISR; freshness comes from **on-demand** `revalidatePath` after each scraper run and from build-time/ISR for paths not in `generateStaticParams` as needed.
- `generateStaticParams` pre-renders up to `STATIC_SESSION_DETAIL_MAX` (default **40** in code; override via env) **distinct** `referenceCode` values for “today’s” `scrapedDate` at build time so the first request can be static HTML. Other codes are generated on demand. If `next build` hits `too many database connections`, lower `STATIC_SESSION_DETAIL_MAX` or use a pooler.

---

## 5. Summary table

| Layer | What | Typical duration / behavior |
|--------|------|-----------------------------|
| Vercel CDN | `s-maxage` on public list APIs | ~1h fresh, up to 4h stale-while-revalidate |
| Browser | `max-age=300` on those same APIs | ~5 min before rechecking |
| API `/api/sessions` | `Cache-Control` on responses | For API consumers; home does not use this for initial HTML |
| Client JS | `public-api-cache` | Up to 4h per URL where still used (e.g. some club fetches) |
| Next SSG + on-demand | `revalidate = false` on `/`, `/clubs`, session detail | Stale-while revalidate = scraper’s `POST /api/revalidate` (paths in §2) |
| Next | `generateStaticParams` on session detail | Caps at `STATIC_SESSION_DETAIL_MAX` (default 40) to avoid build DB connection exhaustion |

---

## 6. Environment variables (caching-related)

| Variable | Role |
|----------|------|
| `REVALIDATE_SECRET` | Token for `POST /api/revalidate` |
| `VERCEL_APP_URL` | Scraper: base URL of the deployed app (no trailing slash), e.g. `https://…vercel.app` |
| `STATIC_SESSION_DETAIL_MAX` (optional) | `next build`: max session detail pages to pre-render (default 40) |

See `pickleball-hub/.env.example` for comments.

---

## 7. Files to read when changing behavior

- `src/lib/http-cache-headers.ts` — CDN + browser policy strings
- `src/lib/public-api-cache.ts` — in-memory TTL and helpers
- `src/app/api/revalidate/route.ts` — which paths on-demand revalidate
- `scraper/entrypoint.py` — `trigger_vercel_revalidation()`

If you add new public JSON routes that are safe to cache, attach `CACHE_CONTROL_PUBLIC_LISTINGS` (or a new constant with its own numbers) and document the choice here.

---

## 8. Static page rendering (home + clubs)

`/` and `/clubs` are **fully server-rendered** with `export const revalidate = false` in their `page.tsx` files, then **cached** at the Vercel edge until the next on-demand revalidation. They are **not** on a time-based revalidate interval.

**Data flow:** Railway scraper → successful ingest → `POST /api/revalidate` (with `REVALIDATE_SECRET`) → Vercel purges the cached full-route + RSC data for the paths in **section 2** → the next request runs a **fresh** server render → result is cached again.

**Client behavior:** Filtering, sorting, search, tabs (Today/Tomorrow), map/list, Free Tonight collapse, and the rest of the home UI run **entirely in the browser** on props already in the first response — **no** `/api/sessions` or `/api/clubs` call after the initial page load for those two routes.
