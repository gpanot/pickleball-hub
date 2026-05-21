# Caching in pickleball-hub

The app is deployed on **Vercel** (Next.js). Caching is split across **static HTML** (ISR for `/`, `/clubs`, `/heatmap`), **CDN / browser** (`Cache-Control` on API routes), **on-demand revalidation** after the Railway scraper, and a **client-side in-memory** layer on some routes. There is no `vercel.json` in the repo.

**ISR cost optimization:** API routes use CDN `Cache-Control` only (no `revalidate` export) to avoid ISR write units on Vercel. Pages use `revalidate = false` and rely on on-demand revalidation from the scraper.

---

## 1. HTTP: `Cache-Control` (browser + Vercel CDN)

Defined in `src/lib/http-cache-headers.ts`.

### Public listing APIs (clubs, venues, dashboard JSON, stats)

- **Header:** `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400`
- **Meaning:**
  - **Browser (`max-age=300`):** may reuse a response for up to **5 minutes** before revalidating.
  - **CDN (`s-maxage=3600`):** Vercel's edge treats the response as **fresh for 1 hour**.
  - **Stale-while-revalidate (86400s):** for up to **24 hours** after freshness expires, the CDN can serve a stale copy while revalidating in the background.

These routes attach `CACHE_CONTROL_PUBLIC_LISTINGS` on successful JSON responses, for example:

- `/api/clubs`, `/api/clubs/[slug]`
- `/api/venues`, `/api/venues/[id]`
- `/api/dashboard/organizer`, `/api/dashboard/venue`
- `/api/dashboard/compare-clubs`, `/api/dashboard/compare-venues`
- `/api/dashboard/organizer/stats`, `/api/dashboard/organizer/market-median-series`

### Sessions list API

- **Header:** `public, max-age=60, s-maxage=300, stale-while-revalidate=7200` (via `CACHE_CONTROL_SESSIONS`)
- **File:** `src/app/api/sessions/route.ts`

### DUPR distribution API

- **Header:** `public, s-maxage=86400, stale-while-revalidate=604800` (24h fresh, 7d SWR)
- **File:** `src/app/api/clubs/[slug]/dupr/route.ts`
- DUPR data updates weekly; long CDN cache is appropriate.

### Heatmap API

- **Header:** `public, s-maxage=3600, stale-while-revalidate=86400`
- **File:** `src/app/api/heatmap/route.ts`
- `export const dynamic = "force-dynamic"` — no ISR, CDN only.

---

## 2. On-demand revalidation (Next.js ISR cache, triggered after scrapes)

**Route:** `POST /api/revalidate` — `src/app/api/revalidate/route.ts`

- Protected by header `x-revalidate-token` matching `REVALIDATE_SECRET`.
- **Heatmap tag** (`?tag=heatmap`): revalidates `/heatmap` only.
- **Default (no tag):** revalidates `/`, `/clubs`, `/heatmap`.
- Only ISR-cached pages are revalidated. API routes use CDN `Cache-Control` and don't need `revalidatePath`.
- Routes like `/sessions/[referenceCode]` are `force-dynamic` and don't use ISR.
- Dashboard pages are client-side rendered and don't use ISR.

The **Railway scraper** (`scraper/entrypoint.py`, `trigger_vercel_revalidation()`) POSTs to this endpoint after each successful ingest.

---

## 3. Client in-memory cache (`public-api-cache`)

**File:** `src/lib/public-api-cache.ts`

- A per-browser-tab `Map`: key = request URL, value = `{ at, data }` with a default TTL of **4 hours** (`PUBLIC_API_CACHE_TTL_MS`).
- Clears on full page reload; not shared across tabs or users.

---

## 4. ISR page strategy

### Pages with `revalidate = false` (on-demand only)

| Page | File | Notes |
|------|------|-------|
| `/` | `src/app/page.tsx` | Home — on-demand revalidation after scraper runs |
| `/clubs` | `src/app/clubs/page.tsx` | Clubs directory — on-demand only |
| `/heatmap` | `src/app/heatmap/page.tsx` | Heatmap — on-demand only |

These pages are server-rendered once, cached until the scraper triggers `POST /api/revalidate`, then re-rendered on the next request.

### Pages with `force-dynamic` (no caching)

| Page | File |
|------|------|
| `/sessions/[referenceCode]` | `src/app/sessions/[referenceCode]/page.tsx` |
| `/admin/*` | Various admin pages |

### Client-only pages (no server caching needed)

| Page | Notes |
|------|-------|
| `/clubs/[slug]` | `"use client"` — fetches from `/api/clubs/[slug]` |
| `/dashboard/*` | Client-side with auth |

### API routes — NO ISR (CDN `Cache-Control` only)

| Route | CDN cache | Reason |
|-------|-----------|--------|
| `/api/heatmap` | 1h + 24h SWR | Avoid ISR write units |
| `/api/clubs/[slug]` | 1h + 24h SWR | Avoid ISR write units |
| `/api/clubs/[slug]/dupr` | 24h + 7d SWR | Weekly data, long cache |

---

## 5. Summary table

| Layer | What | Duration |
|-------|------|----------|
| Vercel CDN | `s-maxage` on public list APIs | 1h fresh, up to 24h SWR |
| Browser | `max-age=300` on list APIs | 5 min before rechecking |
| CDN (DUPR) | `s-maxage=86400` | 24h fresh, 7d SWR |
| Client JS | `public-api-cache` | Up to 4h per URL |
| Next ISR | `revalidate = false` on `/`, `/clubs`, `/heatmap` | On-demand via scraper only |
| Next | `force-dynamic` on session detail, admin | No caching |

---

## 6. Environment variables (caching-related)

| Variable | Role |
|----------|------|
| `REVALIDATE_SECRET` | Token for `POST /api/revalidate` |
| `VERCEL_APP_URL` | Scraper: base URL of the deployed app (no trailing slash) |

---

## 7. Files to read when changing behavior

- `src/lib/http-cache-headers.ts` — CDN + browser policy strings
- `src/lib/public-api-cache.ts` — in-memory TTL and helpers
- `src/app/api/revalidate/route.ts` — which paths on-demand revalidate
- `scraper/entrypoint.py` — `trigger_vercel_revalidation()`

---

## 8. ISR cost optimization notes

To minimize Vercel ISR read/write units:

1. **No time-based revalidation** — all ISR pages use `revalidate = false` and rely on on-demand revalidation from the scraper (3x/day).
2. **API routes use CDN only** — `export const dynamic = "force-dynamic"` + `Cache-Control` headers. This avoids ISR write units entirely for API responses.
3. **No non-deterministic output** — `vnCalendarDateString()` returns the same value within a VN calendar day, ensuring ISR rewrites only occur when actual data changes.
4. **Targeted revalidation** — `POST /api/revalidate` only purges ISR-cached pages (`/`, `/clubs`, `/heatmap`), not force-dynamic or client-only routes.
