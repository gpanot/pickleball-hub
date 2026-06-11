# SQUADD — Current Implementation Handoff Document

**Purpose:** Reference for upgrading the Squadd feature and the broader SQUADD mobile app.  
**Repo:** `pickleball-hub/` inside `Scraprer Reclub` workspace  
**Last reviewed:** June 11, 2026

---

## 1. Product context

**SQUADD** is a social-first pickleball companion app (Expo React Native) for HCMC players. It shares a backend and PostgreSQL database with **HCM Pickleball Hub** (Next.js web app).

| Layer | Technology |
|-------|------------|
| Mobile | Expo 52, React Native 0.76, TypeScript, Zustand |
| Backend | Next.js 16 App Router on **Railway** |
| Database | **PostgreSQL** via Prisma |
| Auth | Google + Apple Sign-In → JWT (90-day, HS256) |
| Push | Firebase FCM + Expo Notifications |
| Session data | Python scraper ingesting Reclub |
| Prod API | `https://pickleball-hub-mobile-i9ag-production.up.railway.app` |
| Bundle ID | `com.squadd.thehub.app` |
| Firebase project | `squadd-1c344` |

The **Squadd tab** is **pre-launch waitlist only** — no live squads, XP, leaderboards, or chest mechanics yet. It is marketing / lead-gen for a future gamified squad system.

---

## 2. Mobile navigation architecture

### Bottom tabs (left → right)

| Tab ID | Label | Screen component | File |
|--------|-------|------------------|------|
| `circle` | Circle | `CircleScreen` | `mobile/src/screens/CircleScreen.tsx` |
| `squadd` | Squadd | `SquaddOnboarding` | `mobile/src/screens/SquaddOnboarding.tsx` |
| `swipe` | Play | `SwipeScreen` | `mobile/src/screens/SwipeScreen.tsx` |

Wired in `mobile/App.tsx` + `mobile/src/components/NavBar.tsx`.

### Overlay / flow screens (not tabs)

| Flow | Component | Trigger |
|------|-----------|---------|
| Splash | `SplashScreen` | App boot |
| Onboarding | `OnboardingScreen` | Post sign-up (4 steps: DUPR, time prefs, gender, Reclub link) |
| People you may know | `PeopleYouMayKnowScreen` | After onboarding if Reclub linked |
| Profile sheet | `ProfileSheet` | Profile menu |
| Gear setup | `GearSetupScreen` | Profile / Circle teaser |
| Explore sessions | `ExploreSessionsScreen` | `onOpenExplore` prop exists but **never called** in `SwipeScreen` |
| Push debug | `PushDebugScreen` | Profile (dev) |
| Activity | `ActivityScreen` | Overlay from Circle (kudos + followers) |

**Dead code:** `ShortlistScreen.tsx` — merged into Play → Friends; unused.

---

## 3. Squadd tab — detailed implementation

### Entry point

```tsx
// mobile/App.tsx
<View style={{ flex: 1, display: activeTab === 'squadd' ? 'flex' : 'none' }}>
  <SquaddOnboarding />
</View>
```

Single component: `SquaddOnboarding` (~1068 lines). Design reference: `squadd_carousel_final.html`.

### Visual system

- Dark gradient background (`#1a1a1a` → `#000`)
- **Bangers** font for titles (`assets/fonts/Bangers_400Regular.ttf`)
- Gold CTA buttons (`#facc15`) with 3D border
- Floating emoji animations, pickleball chest image (`pickleball_chest_clash_of_clan.png`)
- Mock leaderboard data (hardcoded, not live)

### Carousel screens (8 total)

| # | Name | Purpose | Interactive |
|---|------|---------|-------------|
| 0 | Screen1 | "The first real pickleball squads" — 8-player crews | Auto-advance |
| 1 | Screen2 | Choose identity: name, animal, district | Auto-advance |
| 2 | Screen3 | Play together, earn together — chests, XP | Auto-advance |
| 3 | Screen4 | Mock leaderboard (D1 VIPERS, D2 LIONS, SKY HAWKS) | Auto-advance |
| 4 | Screen5 | "Founding Squads opening soon" + perks + **RESERVE MY SQUADD** | CTA → Screen 6 |
| 5 | Screen6 | Create squad: name (max 24, uppercase) + emoji picker | Back / Next |
| 6 | Screen7 | Select region: country + city | Back / Confirm |
| 7 | Screen8 | Confirmation: "You are in the game!" | Terminal state |

**Auto-advance:** Screens 0–4 cycle every 6 seconds until user taps a dot or CTA.

### Regional data (hardcoded)

```typescript
const REGIONAL_DATA: Record<CountryKey, { flag: string; cities: string[] }> = {
  Vietnam: { flag: '🇻🇳', cities: ['Ho Chi Minh City', 'Hanoi Capital', 'Da Nang'] },
  Philippines: { flag: '🇵🇭', cities: ['Metro Manila', 'Cebu', 'Cavite'] },
  Malaysia: { flag: '🇲🇾', cities: ['Kuala Lumpur', 'Selangor', 'Penang'] },
};
```

### Emoji options

- Row 1: 🦁 🐉 🦅 🐺 🐯 🦈 🦄 🦋 🐻
- Row 2: 🐱 🦊 🐰 🦩 🐼 🐨 🦢 🌸 💫 🐝 🦔 🐙

### Founding perks (marketing copy only)

- Founder Badge
- Early Access
- First Squad Name Selection

### Registration flow

1. User fills squad name + emoji (Screen 6)
2. User picks country + city (Screen 7)
3. On confirm:
   - `POST /api/squad-waitlist` (authenticated if signed in)
   - Local persistence in AsyncStorage
   - Navigate to Screen 8

**POST body:**

```json
{
  "squadName": "D2 LIONS",
  "emoji": "🦁",
  "country": "Vietnam",
  "city": "Ho Chi Minh City",
  "friendCount": 0,
  "playerName": "<displayName from auth>",
  "playerDupr": "<duprRating from auth>"
}
```

**Error handling:** API failure is swallowed — confirmation still shown (optimistic UX).

### Local persistence

| Key | Storage | Content |
|-----|---------|---------|
| `squadd_waitlist_registered` | AsyncStorage | `{ squadName, emoji, country, city, friendCount, registeredAt }` |

On app reopen, if key exists → skip carousel, show Screen 8 only.

**Dev reset:** Profile sheet has "Reset squadd registration (dev)" → clears AsyncStorage key.

### Auth coupling

- Uses `useAuthStore.authedFetch` — JWT sent if user is signed in
- Works without sign-in (API accepts unauthenticated POST; `profileId` = null)
- Player name/DUPR resolved server-side from profile when authenticated

### What is NOT implemented

- No `Squad` model in DB (only `SquadWaitlist`)
- No squad membership, invites, or friend count
- No XP, chests, district ownership, or live leaderboard
- No duplicate-registration guard (same user can POST multiple times)
- No squad name uniqueness check
- `friendCount` always sent as `0`

---

## 4. Backend — Squadd-specific

### Public API

**`POST /api/squad-waitlist`**  
File: `src/app/api/squad-waitlist/route.ts`

| Field | Required | Notes |
|-------|----------|-------|
| `squadName` | Yes | Stored as-is |
| `emoji` | Yes | Single emoji string |
| `country` | Yes | Free text |
| `city` | Yes | Free text |
| `friendCount` | No | Defaults to 0 |
| `playerName` | No | Overridden by profile if authed |
| `playerEmail` | No | From auth user email if authed |
| `playerDupr` | No | Resolved: Reclub DUPR → preferences.dupr → body |

Auth: optional Bearer JWT via `getMobileUser()`.

Player resolution: `src/lib/squad-waitlist-player.ts`.

Response: `{ ok: true }` on success, `400` if missing fields.

### Admin API

**`GET /api/admin/squad-waitlist`**  
File: `src/app/api/admin/squad-waitlist/route.ts`  
Requires admin session cookie. Returns `{ count, registrations }`.

### Admin web page

**`/admin/squadd`**  
File: `src/app/admin/squadd/page.tsx`

- Table: Squad (emoji + name), Player (name + email), DUPR, Region, Registered (VN timezone)
- Country breakdown chips
- Linked from `AdminNav` → "Squadd"

---

## 5. Database schema

**Provider:** PostgreSQL  
**ORM:** Prisma (`prisma/schema.prisma`)  
**Connection:** `DATABASE_URL` env var

### Squadd-specific table

```prisma
model SquadWaitlist {
  id          Int      @id @default(autoincrement())
  squadName   String   @map("squad_name")
  emoji       String
  country     String
  city        String
  friendCount Int      @map("friend_count")
  profileId   String?  @map("profile_id")
  playerName  String?  @map("player_name")
  playerEmail String?  @map("player_email")
  playerDupr  Decimal? @map("player_dupr") @db.Decimal(5, 3)
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("squad_waitlist")
}
```

**Migrations:**

1. `20260604120000_add_squad_waitlist` — base table
2. `20260605120000_add_squad_waitlist_region` — `country`, `city`
3. `20260606120000_add_squad_waitlist_player` — `profile_id`, `player_name`, `player_email`, `player_dupr`

**No FK** from `profile_id` → `player_profiles` (loose reference only).

### Full schema — models relevant to mobile

| Model | Table | Role |
|-------|-------|------|
| `User` | `auth_users` | NextAuth / mobile OAuth identity |
| `Account` | `auth_accounts` | Google/Apple provider links |
| `PlayerProfile` | `player_profiles` | SQUADD user profile (links to User + optional Reclub Player) |
| `Player` | `players` | Reclub players (DUPR, rosters) — keyed by `userId` (BigInt) |
| `Follow` | `follows` | Social graph (profile → Reclub player) |
| `Kudos` | `kudos` | Fistbump / flame / star |
| `FeedItem` | `feed_items` | Persisted feed events |
| `PlayIntent` | `play_intents` | "I want to play" signals |
| `PlayerGear` | `player_gear` | Cosmetic loadout |
| `NotificationSent` | `notifications_sent` | Push throttle log |
| `Block` / `Report` | `blocks` / `reports` | Moderation |
| `Session` | `sessions` | Scraped Reclub sessions |
| `SessionRoster` | `session_rosters` | Who is on each session |
| `SessionDuprStat` | `session_dupr_stats` | Aggregated DUPR per session |
| `Club` / `Venue` | `clubs` / `venues` | Session metadata |
| `SquadWaitlist` | `squad_waitlist` | Squadd waitlist only |

### `PlayerProfile` key fields

```
id, userId, reclubUserId, displayName, gender, preferences (JSON),
onboardingCompleted, pushToken, pushTokenIos, streakData,
suspended, banned, createdAt, lastSeen
```

`preferences` JSON holds: `dupr`, `timeSlots`, `market` (`hcm` | `kl`), etc.

---

## 6. Mobile state management

| Store | File | Responsibility |
|-------|------|------------------|
| `authStore` | `src/stores/authStore.ts` | JWT (SecureStore), profile, `authedFetch`, sign-in/out |
| `sessionStore` | `src/stores/sessionStore.ts` | Play tab sessions, swipe deck |
| `uiStore` | `src/stores/uiStore.ts` | Theme, notifications toggle, pending PN targets |
| `avatarCacheStore` | `src/stores/avatarCacheStore.ts` | Avatar URL cache |

### Squadd-related AsyncStorage keys

| Key | Used by |
|-----|---------|
| `squadd_waitlist_registered` | SquaddOnboarding |
| `squadd_location_permission_asked` | LocationPermissionPopup |
| `squadd_notif_permission_asked` | NotificationPermissionSheet |
| `squadd_has_seen_feed` | CircleScreen |
| `squadd_gear_profile` | Gear constants |
| `pns_debug_logs` | FCM debug (App.tsx) |

---

## 7. Full mobile API surface

| Area | Endpoints |
|------|-----------|
| Auth | `POST /api/auth/mobile-token`, `GET ?dev=1`, `GET ?reviewer=1` |
| Profile | `POST /api/profile`, `POST /api/players/profile`, `POST /api/profile/delete` |
| Play | `GET /api/play`, `GET /api/sessions/swipe-deck` |
| Social | `GET /api/feed`, `GET /api/feed/friends-going`, `GET /api/feed/presence` |
| Follows | `GET/POST/DELETE /api/follows`, `GET /api/follows/followers` |
| Players | `GET /api/players/search`, `GET /api/players/{id}/profile`, `GET /api/players/{id}/co-players` |
| Sessions | `GET /api/sessions/{id}/roster`, `GET /api/sessions/overlap` |
| Intent | `POST/DELETE /api/play-intent`, `GET /api/play-intent/feed` |
| Kudos | `POST /api/kudos`, `GET /api/kudos/givers` |
| Gear | `GET/PUT /api/players/{profileId}/gear` |
| Push | `POST /api/players/push-token`, `POST /api/notifications/test` |
| Activity | `GET /api/activity` |
| **Waitlist** | **`POST /api/squad-waitlist`** |

### Auth pattern

- JWT in `Authorization: Bearer <token>`
- Signed with `AUTH_SECRET` or `NEXTAUTH_SECRET`
- 90-day expiry
- `getMobileUser()` validates and returns `{ userId, profileId, reclubUserId, suspended }`

### Cron jobs (push)

- `session-finished-kudos` (PN6)
- `you-are-playing` (PN7)
- `weekly-recap`
- `push-notifications`

---

## 8. Play tab & Circle tab (brief)

### Play (`SwipeScreen`)

- Sub-tabs: **Top 5** (`GET /api/play`) and **Friends** (friends-going, saved sessions, play intents)
- Filters: DUPR min, time slots, today/tomorrow, GPS distance
- Session cards → Reclub `eventUrl` (external booking)
- Match score: ~55% DUPR + ~30% fill + ~15% returning players

### Circle (`CircleScreen`)

- Feed (`GET /api/feed`) with kudos
- Presence (`GET /api/feed/presence`)
- Player search, follows, co-players
- Block/report on player profiles

---

## 9. Infrastructure

| Service | Role |
|---------|------|
| Railway | Next.js API + PostgreSQL |
| Firebase (`squadd-1c344`) | FCM push, `google-services.json` / `GoogleService-Info.plist` |
| PostHog | Analytics + session replay |
| UXCam | Session recording (optional) |
| EAS | Mobile builds (`eas.json`) |
| Reclub scraper | `ingest.py` → sessions, rosters, DUPR |

---

## 10. Upgrade considerations (gaps for next LLM)

### Squadd-specific

1. **No Squad entity** — only flat waitlist rows; need `Squad`, `SquadMember`, possibly `SquadXP`, `SquadChest`
2. **No uniqueness** — squad names not reserved; duplicate signups allowed
3. **No link waitlist → squad** — when squads launch, need migration from `squad_waitlist`
4. **Multi-country UI vs HCMC data** — Play API tuned for `market: hcm`; PH/MY are waitlist-only
5. **Mock UI promises real features** — leaderboard, XP, chests, districts are visual only
6. **`friendCount` unused** — always 0; no invite flow
7. **Offline-first registration** — AsyncStorage is source of truth for "registered" state, not server

### Broader app

1. Explore swipe deck wired in `App.tsx` but no UI trigger in `SwipeScreen`
2. `ShortlistScreen` dead code
3. No in-app booking (Reclub external only)
4. No map on mobile
5. No premium / subscription
6. English-only UI

### Suggested schema for Squadd MVP upgrade

```
Squad (id, name, emoji, country, city, founderProfileId, createdAt, xp, level)
SquadMember (squadId, profileId, role: founder|member, joinedAt)
SquadWaitlist → optionally link to Squad on activation
```

Consider: unique `(country, city, squadName)`, one squad per profile, invite codes.

---

## 11. Key file index

```
pickleball-hub/
  mobile/
    App.tsx                          # Root navigation, tab mounting
    src/screens/SquaddOnboarding.tsx # Squadd tab (all 8 screens)
    src/components/NavBar.tsx        # Bottom tabs
    src/stores/authStore.ts          # JWT + API base
  src/app/api/squad-waitlist/route.ts
  src/app/api/admin/squad-waitlist/route.ts
  src/app/admin/squadd/page.tsx
  src/lib/squad-waitlist-player.ts
  src/lib/mobile-auth.ts
  prisma/schema.prisma
  docs/SQUADD_MOBILE_PRODUCT.md      # Existing product doc (June 2025)
```

---

## 12. Related documentation

A longer product overview already exists at `docs/SQUADD_MOBILE_PRODUCT.md` (user journeys, metrics, roadmap gaps). This handoff doc adds **implementation-level detail** on the Squadd screen, backend routes, and DB schema for upgrade planning.

**Update this file when:**

- Squadd moves from waitlist to live squads
- New DB models or API routes are added
- Mobile navigation or screen structure changes
- New markets go live beyond HCMC
