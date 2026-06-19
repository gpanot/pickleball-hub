# Technical Export — Onboarding Flow & Chest Reward System
> Generated: 2026-06-19 | Source: `pickleball-hub/` monorepo

---

## 1. ONBOARDING FLOW

There are **two distinct onboarding flows** in the app: the **Player Profile Onboarding** (appears after first login) and the **Squad Onboarding / Squadd Waitlist** carousel (accessed via the Squad tab).

---

### 1.1 App Entry & Auth Gate (`SplashScreen → main app`)

**File:** `mobile/src/screens/SplashScreen.tsx`  
**Component:** `SplashScreen`

- Pure animated intro screen (lion logo, wordmark, tagline).
- Duration: ~3 seconds (fade-out at 2700ms via `withDelay`).
- Calls `onFinish()` prop via `runOnJS` when animation ends.
- No data collection, no state writes.
- **Navigation trigger:** `screenOpacity` animates to 0, calls `onFinish()` → parent renders main screen.

After splash, the auth store (`mobile/src/stores/authStore.ts`) determines the route:
- No JWT → shows Google/Apple sign-in
- Has JWT + `hasCompletedOnboarding === false` → renders `OnboardingScreen`
- Has JWT + `hasCompletedOnboarding === true` → renders main tab app

---

### 1.2 Player Profile Onboarding (5-step flow)

**File:** `mobile/src/screens/OnboardingScreen.tsx`  
**Component:** `OnboardingScreen`  
**Exported from:** rendered by the app root when `authStore.onboardingCompleted === false`

**TOTAL_STEPS = 5**. Each step is rendered conditionally by `step` state variable (0–4).

| Step | Index | Screen title | Data collected | State written |
|------|-------|-------------|----------------|---------------|
| 0 | `step === 0` | "What is your DUPR?" | `dupr: string` (optional, 0.0–8.0) | local `dupr` state |
| 1 | `step === 1` | "Where do you play?" | `market: 'hcm' | 'kl'` | local `market` state (pre-guessed from locale) |
| 2 | `step === 2` | "When do you usually play?" | `timeSlots: Array<'morning'|'afternoon'|'evening'>` (multi-select, optional) | local `timeSlots` state |
| 3 | `step === 3` | "Choose your avatar" | `gender: 'man' | 'female'` (required — clicking an avatar auto-advances to step 4) | local `gender` state |
| 4 | `step === 4` | "Find your Reclub name" | `selectedPlayer: SearchResult | null` (optional Reclub account link) | local `selectedPlayer` state |

**Navigation trigger for each step:**
- Steps 0–2: tap "Next" / "Skip" button → `nextStep()` validates and increments `step`
- Step 3: tap avatar image → immediately calls `setGender(...)` and `setStep(4)` (no Next button)
- Step 4: tap "Continue" / "Skip" → calls `handleFinish()`

**`handleFinish()` function** (step 4 completion):

```typescript
// OnboardingScreen.tsx — lines 113-164
const handleFinish = async () => {
  const prefs: Record<string, unknown> = {
    dupr: dupr ? parseFloat(dupr) : null,
    timeSlots: timeSlots.length > 0 ? timeSlots : null,
    gender: gender ?? null,
    market,
  }

  const res = await authedFetch('/api/profile', {
    method: 'POST',
    body: JSON.stringify({
      profileId,
      preferences: prefs,
      gender: gender ?? null,
      market,
      reclubUserId: selectedPlayer?.userId ?? undefined,
    }),
  })

  // On success:
  if (selectedPlayer) setReclubUserId(selectedPlayer.userId)
  setDuprRating(dupr ? parseFloat(dupr) : null)
  saveGenderToStore(gender)
  saveMarketToStore(market)
  setOnboardingComplete()  // writes to authStore + AsyncStorage
  onComplete()             // parent re-renders to main app
}
```

**API endpoint called:** `POST /api/profile`  
**State written to `authStore`:** `onboardingCompleted = true`, `reclubUserId`, `duprRating`, `gender`, `market`  
**DB record updated:** `player_profiles.onboarding_completed = true`, `preferences` JSON, `gender`, `reclub_user_id`

**Conflict handling:** If `reclubUserId` is already linked to another profile → API returns `409` → `OnboardingScreen` displays: `"⚠️ This Reclub account is already linked to another player."`

---

### 1.3 Squad Module Onboarding (in-tab, post-profile-onboarding)

**File:** `mobile/src/modules/squad/SquadModule.tsx`  
**Component:** `SquadModule` (default export)  
**Screen state machine:** `SquadScreen` union type controls which screen renders

The Squadd tab always renders `SquadModule`. Internally, it manages a `screen` state variable of type `SquadScreen`:

```typescript
// mobile/src/modules/squad/types.ts — lines 135-161
export type SquadScreen =
  | 'carousel'       // Intro carousel (first-time users who haven't seen it)
  | 'gate'           // Locked: not enough follows (FOLLOWS_THRESHOLD = 4)
  | 'ready'          // Eligible: no squad yet, can create/join
  | 'nickname'       // Set squad nickname before creating
  | 'create'         // Create squad form
  | 'invite'         // Invite members screen
  | 'created'        // Post-creation confirmation
  | 'home'           // Main squad home (has squad)
  | 'invite-receive' // Incoming invite from deeplink/push
  | 'disbanded'      // Squad was disbanded by founder
  | 'disband-confirm'
  | 'browse'         // Browse nearby squads
  | 'leave-confirm'
  | 'chest-detail'   // View a specific chest
  | 'chest-open'     // Chest open animation + rewards
  | 'leaderboard'
  | 'manage'
  | 'edit'
  // Phase 4 conquest screens...
```

**Squad Onboarding Sequence (new user without squad):**

| Step | SquadScreen | File | What it shows | Navigation trigger |
|------|-------------|------|---------------|-------------------|
| 0 | `'carousel'` | `screens/SquadCarouselScreen.tsx` | 5-slide marketing carousel (same visuals as `SquaddOnboarding.tsx` waitlist flow but integrated) | Tap "Create a Squad" CTA on slide 5 → `onCreateSquad()` |
| 1 | `'gate'` | `screens/SquadGateScreen.tsx` | Follow-gate: must follow ≥4 players. Shows progress bar + "Find players" CTA. | When `followCount >= FOLLOWS_THRESHOLD` (currently 4) → user can proceed; "Find players" navigates to Circle tab |
| 2 | `'ready'` | `screens/SquadReadyScreen.tsx` | Landing for eligible users: nearby squads list + Create button + pending invite card | "Create a Squad" → `'nickname'`; tap "Join" on a nearby squad → `joinByCode(code)`; accept invite → `'invite-receive'` |
| 3 | `'nickname'` | `screens/SquadNicknameScreen.tsx` | Set unique squad nickname (shown in squad contexts). Auto-suggests from displayName. Debounced availability check via `/api/squads/nickname`. | Nickname confirmed → `onConfirmed(nickname)` → `'create'` |
| 4 | `'create'` | `screens/SquadCreateScreen.tsx` | Form: squad name (2–24 chars), emoji picker (12 options), public/private toggle, DUPR toggle. Requests location for geo. | Tap "Create" → `onCreated(payload)` → calls `POST /api/squads` |
| 5 | `'invite'` | `screens/SquadInviteScreen.tsx` | Invite members from follows list. Can skip. | Tap "Skip" or after inviting → `'created'` |
| 6 | `'created'` | `screens/SquadCreatedScreen.tsx` | Confirmation screen showing squad code. | Tap "Go to my squad" → `'home'` |
| 7 | `'home'` | `screens/SquadHomeScreen.tsx` | Full squad home: XP bar, active chest, feed, members, check-in button | Persistent after squad membership |

**Carousel "has seen" persistence:**

```typescript
// mobile/src/modules/squad/squadOnboarding.ts
export const HAS_SEEN_CAROUSEL_KEY = 'squadd_has_seen_carousel';
```

AsyncStorage key `squadd_has_seen_carousel` — if set, skips carousel and goes directly to `'gate'` or `'ready'`.

---

### 1.4 Squad Creation Logic

**File:** `src/app/api/squads/route.ts`  
**Endpoint:** `POST /api/squads`

```typescript
// Full function — 115 lines
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req);
  // Validates name (MIN_SQUAD_NAME_LENGTH=2, MAX_SQUAD_NAME_LENGTH=24)
  // Validates emoji (ALLOWED_EMOJIS list)
  // Validates color (ALLOWED_COLORS list)

  // Guard: reject if already in a squad
  const existingMembership = await prisma.squadMember.findFirst({
    where: { profileId: user.profileId, leftAt: null,
              squad: { appSlug: "squadd", disbandedAt: null } }
  });
  if (existingMembership) → 409

  // Generate unique join code
  const code = await generateSquadCode();

  // Transaction: create squad + code + founder membership
  const result = await prisma.$transaction(async (tx) => {
    const squad = await tx.squad.create({ data: { name, emoji, color, isPublic, showDupr, founderId: user.profileId, latitude?, longitude? } });
    await tx.squadCode.create({ data: { squadId: squad.id, code } });
    const member = await tx.squadMember.create({ data: { squadId: squad.id, profileId: user.profileId, role: "founder" } });
    return { squad: { ...squad, code }, member };
  });

  // Award +40 XP to squad for the founding member
  await awardSquadXp(prisma, result.squad.id, user.profileId, "new_member", XP_AMOUNTS.new_member); // 40 XP

  return NextResponse.json(result, { status: 201 });
}
```

---

### 1.5 Squad Join Logic

**File:** `src/app/api/squads/join-by-code/route.ts`  
**Endpoint:** `POST /api/squads/join-by-code`  
**Body:** `{ code: string }`

Steps:
1. Auth check
2. Reject if already in a squad → `409`
3. Look up `SquadCode` by `code.toUpperCase()`
4. Reject if squad disbanded or not found → `404`
5. Reject if `members.length >= MAX_SQUAD_MEMBERS` (8) → `400`
6. Transaction: `squadMember.create` (role: "member") + resolve any pending invites for this user
7. Check `hasReceivedNewMemberXp(profileId)` — if first time ever joining a squad → award `+40 XP`
8. Return full squad object

**`MAX_SQUAD_MEMBERS` constant:** from `src/lib/squad-constants.ts` (value: 8)

---

### 1.6 How a New User Gets Assigned to a Squad

There are two paths, no automatic assignment:

| Path | How | API |
|------|-----|-----|
| **Manual creation** | User goes through Nickname → Create flow, enters squad name + emoji | `POST /api/squads` |
| **Join by code** | User scans/receives a 6-char invite code from an existing member | `POST /api/squads/join-by-code` |

There is also an invite-receive flow via push notification / deeplink:
- Deep link: `squadd://invite?code=XXXXXX&inviteId=N` → SquadModule detects `deeplinkCode` prop → shows `'invite-receive'` screen → user taps Accept → calls `joinByCode(code)` same as above.

---

### 1.7 Squadd Waitlist Flow (legacy / marketing screen)

**File:** `mobile/src/screens/SquaddOnboarding.tsx` (used for the waitlist before full squad launch)  
**Component:** `SquaddOnboarding` (default export)  
**AsyncStorage key:** `squadd_waitlist_registered`

This is a **separate, self-contained component** — a 8-screen horizontal scroll carousel that pre-registers user interest. It is distinct from the real squad creation flow in `SquadModule`.

| Screen | Index | Component | Content | Navigation trigger |
|--------|-------|-----------|---------|-------------------|
| Intro 1 | 0 | `Screen1` | "The first real pickleball squads" | Auto-advance every 6s or swipe |
| Intro 2 | 1 | `Screen2` | "Choose your identity" (name, animal, district) | Auto-advance or swipe |
| Intro 3 | 2 | `Screen3` | "Play together. Earn together." (chest image) | Auto-advance or swipe |
| Intro 4 | 3 | `Screen4` | "Own your district." (mock leaderboard) | Auto-advance or swipe |
| Reserve CTA | 4 | `Screen5` | Perks card + "RESERVE MY SQUADD" button | Tap button → `handleReserve()` → jumps to screen index 5 |
| Create squad form | 5 | `Screen6` | Squad Name input + emoji picker | Tap "Next: Region" → `handleNextRegion(name, emoji)` → goes to index 6 |
| Region select | 6 | `Screen7Region` | Country flags (Vietnam/Philippines/Malaysia) + city pills | Tap "Confirm Reservation" → `handleConfirm(country, city)` → API call + goes to index 7 |
| Confirmation | 7 | `Screen8` | "You are in the game!" + country flag + "Founding Member Status: ACTIVE" | Terminal screen |

**Data collected:** `{ squadName, emoji, country, city, friendCount: 0, registeredAt }`  
**State written:** AsyncStorage `squadd_waitlist_registered` (full registration object)  
**API called:** `POST /api/squad-waitlist` (body: `{ squadName, emoji, country, city, friendCount, playerName, playerDupr }`)  
**Context/store reads:** `useAuthStore` → `authedFetch`, `displayName`, `duprRating`

If `squadd_waitlist_registered` already exists in AsyncStorage on mount → skips to Screen8 (confirmation) immediately.

---

## 2. CHEST REWARD SYSTEM

### 2.1 How Chests Are Created (Check-In)

**File:** `src/app/api/squads/checkin/route.ts`  
**Endpoint:** `POST /api/squads/checkin`  
**Body:** `{ squadId: string, venueName?: string, venueId?: number, taggedProfileIds?: string[] }`

Flow:
1. Validate caller is active squad member
2. **Daily cap:** one chest per `(squadId, earnerId, checkinDate)` — unique constraint prevents duplicates
3. **1-hour spam guard:** reject if a chest was created by this player in this squad within the last hour
4. Create `SquadChest` record with `expiresAt = now + 24 hours`
5. Create `SquadChestOpening` rows for **every active squad member** (status: `'pending'`)
6. Award `+60 XP` to squad via `awardSquadXp(..., "checkin", 60)`
7. Fire-and-forget push notifications to all other members

**Response:**
```json
{
  "chest": { "id": "uuid", "expiresAt": "ISO8601" },
  "xpAwarded": 60
}
```

---

### 2.2 Chest Tap (Start Unlock Timer)

**File:** `src/app/api/squads/chests/[chestId]/tap/route.ts`  
**Endpoint:** `POST /api/squads/chests/{chestId}/tap`

- Validates chest exists and hasn't expired
- Validates caller has an opening row for this chest
- Rejects if opening status is not `'pending'` → `409 "Already tapped"`
- Sets `status = 'unlocking'`, `tappedAt = now`, `unlocksAt = now + 2 minutes` (**note: currently 2min for testing, production value should be 4 hours**)

```typescript
// Current unlock delay (tap/route.ts line 39)
const unlocksAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes (DEV)
// Production value should be: 4 * 60 * 60 * 1000 (4 hours)
```

**Response:**
```json
{
  "opening": {
    "status": "unlocking",
    "unlocksAt": "ISO8601"
  }
}
```

**Auto-tap on detail screen:** `SquadChestDetailScreen` auto-calls `tap()` immediately on mount if status is `'pending'`.

---

### 2.3 Chest Open (Claim Rewards)

**File:** `src/app/api/squads/chests/[chestId]/open/route.ts`  
**Endpoint:** `POST /api/squads/chests/{chestId}/open`

```typescript
// Full function (70 lines)
export async function POST(req, { params }) {
  const user = await getMobileUser(req);
  const { chestId } = await params;

  // Check chest exists + not expired
  const chest = await prisma.squadChest.findUnique({...});
  if (chest.expiresAt < new Date()) → 410 "Chest expired"

  // Check opening record
  const opening = await prisma.squadChestOpening.findUnique({...});
  if (!opening) → 403

  // Allow open if status='ready' OR (status='unlocking' AND unlocksAt <= now)
  const isReady = opening.status === "ready" ||
    (opening.status === "unlocking" && opening.unlocksAt && opening.unlocksAt <= new Date());
  if (!isReady) → 403 "Chest not ready yet"

  // Determine reward amounts
  const isEarner = chest.earnerId === user.profileId;
  const kudos = isEarner ? EARNER_CHEST_KUDOS : CONTRIBUTOR_CHEST_KUDOS;   // 12 or 8
  const xp = rollChestXp(isEarner);  // random: 30–80 (earner) or 10–30 (contributor)

  // Persist opening result
  await prisma.squadChestOpening.update({
    data: { status: "opened", openedAt: new Date(), kudosAwarded: kudos, xpAwarded: xp }
  });

  // Award XP to squad
  await awardSquadXp(prisma, chest.squadId, user.profileId, "chest", xp);

  return { kudosAwarded: kudos, xpAwarded: xp, squadLevel, squadXp };
}
```

---

### 2.4 Reward Structure

**File:** `src/lib/squad-xp.ts`

```typescript
// Exact constants (lines 64–76)
export const EARNER_CHEST_XP_MIN = 30;
export const EARNER_CHEST_XP_MAX = 80;
export const EARNER_CHEST_KUDOS = 12;

export const CONTRIBUTOR_CHEST_XP_MIN = 10;
export const CONTRIBUTOR_CHEST_XP_MAX = 30;
export const CONTRIBUTOR_CHEST_KUDOS = 8;

export function rollChestXp(isEarner: boolean): number {
  const min = isEarner ? EARNER_CHEST_XP_MIN : CONTRIBUTOR_CHEST_XP_MIN;
  const max = isEarner ? EARNER_CHEST_XP_MAX : CONTRIBUTOR_CHEST_XP_MAX;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

| Role | Kudos | XP (random range) |
|------|-------|------------------|
| **Earner** (the player who checked in) | 12 | 30–80 |
| **Contributor** (all other squad members) | 8 | 10–30 |

**There is no rarity/tier system.** All chests are the same type. No `rarity` field exists in the schema. The only differentiation is earner vs. contributor rewards.

---

### 2.5 Chest Opening Status State Machine

```
pending → (auto-tap on open) → unlocking → (timer expires) → ready → opened
                                                                    ↑
                                          (status='unlocking' AND unlocksAt <= now is also treated as 'ready' by server)
```

`ChestOpeningStatus` type (from `mobile/src/modules/squad/types.ts`):
```typescript
export type ChestOpeningStatus = 'pending' | 'tapped' | 'unlocking' | 'ready' | 'opened' | 'expired';
```

---

### 2.6 Where Chests Are Persisted

**Tables:**

`squad_chests` — one row per check-in event:
```sql
id           TEXT PRIMARY KEY (UUID)
squad_id     TEXT (FK → squads)
earner_id    TEXT (FK → player_profiles)
session_id   INTEGER (nullable, FK → sessions)
source       TEXT DEFAULT 'checkin'
venue_name   TEXT
checkin_date DATE
created_at   TIMESTAMPTZ
expires_at   TIMESTAMPTZ
UNIQUE(squad_id, earner_id, checkin_date)
```

`squad_chest_openings` — one row per member per chest:
```sql
id            SERIAL PRIMARY KEY
chest_id      TEXT (FK → squad_chests)
profile_id    TEXT (FK → player_profiles)
status        TEXT DEFAULT 'pending'
tapped_at     TIMESTAMPTZ
unlocks_at    TIMESTAMPTZ
opened_at     TIMESTAMPTZ
kudos_awarded INTEGER
xp_awarded    INTEGER
UNIQUE(chest_id, profile_id)
```

---

### 2.7 Chest UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `SquadChestDetailScreen` | `mobile/src/modules/squad/screens/SquadChestDetailScreen.tsx` | Full chest detail view: floating chest image, unlock timer, member status grid, "Open chest" button, nudge button |
| `SquadChestOpenScreen` | `mobile/src/modules/squad/screens/SquadChestOpenScreen.tsx` | Thin wrapper: renders `ChestOpenAnimation` + "Collect 🎁" button |
| `ChestOpenAnimation` | `mobile/src/modules/squad/components/ChestOpenAnimation.tsx` | Full-screen animation: chest burst, 32 confetti particles, +Kudos / +Squad XP reward cards |
| `SquadChestCard` | `mobile/src/modules/squad/components/SquadChestCard.tsx` | Compact chest card shown in squad home feed |
| `SquadChestMemberGrid` | `mobile/src/modules/squad/components/SquadChestMemberGrid.tsx` | Grid of member avatars with opening status indicators |
| `SquadPlaceholderChest` | `mobile/src/modules/squad/components/SquadPlaceholderChest.tsx` | Empty state when no active chest |

**Chest image asset:** `mobile/assets/images/pickleball_chest_clash_of_clan.png` (Clash of Clans-style chest)

---

### 2.8 Chest List API

**Endpoint:** `GET /api/squads/{squadId}/chests?status=active`  
**File:** `src/app/api/squads/[id]/chests/route.ts`

Returns up to 20 chests (ordered by `createdAt DESC`) with full `openings` array including each member's status, `unlocksAt`, `kudosAwarded`, `xpAwarded`. Also computes `myOpening` for the requesting user.

---

## 3. XP AND LEVELING

### 3.1 XP Sources and Amounts

**File:** `src/lib/squad-xp.ts`

```typescript
// Lines 46–62
export type XpSource =
  | "checkin"         // Player checks in at a venue
  | "scraper_session" // Scraper detects a session with squad members
  | "chest"           // Player opens a chest (variable — see rollChestXp)
  | "new_member"      // A new member joins the squad
  | "streak";         // Daily streak bonus

export const XP_AMOUNTS: Record<XpSource, number> = {
  checkin: 60,
  scraper_session: 80,
  chest: 50,        // Note: this value is NOT used for chest opens — rollChestXp() is used instead
  new_member: 40,
  streak: 20,
};

export const STREAK_DAILY_XP = XP_AMOUNTS.streak; // 20
```

| Source | XP | When triggered |
|--------|----|----------------|
| `checkin` | 60 | Player manually checks in via app |
| `scraper_session` | 80 | Scraper (`squad_chests.py`) detects session participation |
| `chest` (open) | 10–80 (random via `rollChestXp`) | Player opens a chest |
| `new_member` | 40 | Someone joins the squad (one-time per player lifetime) |
| `streak` | 20 | Daily cron if squad played consecutively |

**New member XP deduplication:**
```typescript
// squad-xp.ts lines 82–91
export async function hasReceivedNewMemberXp(prisma, profileId): Promise<boolean> {
  const existing = await prisma.squadXpLog.findFirst({
    where: { profileId, source: "new_member" },
    select: { id: true },
  });
  return existing !== null;
}
```
A player who leaves and rejoins a different squad does **not** get `new_member` XP again.

---

### 3.2 Level Thresholds

**File:** `src/lib/squad-xp.ts`

```typescript
// Line 3
export const LEVEL_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];
```

| Level | XP required (cumulative) | XP to next level |
|-------|--------------------------|-----------------|
| 1 | 0 | 300 |
| 2 | 300 | 400 |
| 3 | 700 | 700 |
| 4 | 1,400 | 1,100 |
| 5 | 2,500 | 1,500 |
| 6 | 4,000 | 2,000 |
| 7 | 6,000 | 2,500 |
| 8 | 8,500 | 3,000 |
| 9 | 11,500 | 3,500 |
| 10 | 15,000 | — |
| 10+ | 15,000 + N×4,000 | +4,000 per level (infinite scaling) |

```typescript
// getLevelFromXp (lines 5–22)
export function getLevelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  // Level 10+ = previous threshold + 4000 XP per level
  if (xp >= LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]) {
    let threshold = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
    level = LEVEL_THRESHOLDS.length;
    while (true) {
      threshold += 4000;
      if (xp >= threshold) level++;
      else break;
    }
  }
  return level;
}
```

---

### 3.3 Where Level Affects Gameplay

**Squad level is stored** in `squads.level` (DB) and `squad.level` (API response). It is updated on every XP award via `awardSquadXp()`:

```typescript
// squad-xp.ts lines 93–118
export async function awardSquadXp(prisma, squadId, profileId, source, amount) {
  const squad = await prisma.squad.findUnique({ where: { id: squadId }, select: { totalXp: true } });
  const newTotalXp = squad.totalXp + amount;
  const newLevel = getLevelFromXp(newTotalXp);

  await prisma.$transaction([
    prisma.squadXpLog.create({ data: { squadId, profileId, source, xpAmount: amount } }),
    prisma.squad.update({ where: { id: squadId }, data: { totalXp: newTotalXp, level: newLevel } }),
  ]);
}
```

**Where level is used / displayed:**
- `SquadHomeScreen` — displayed as "Level N" with XP progress bar
- `CityLeaderboardScreen` — each squad shows their level
- `GET /api/squads/leaderboard` — `level` included in response
- `GET /api/squads/nearby` — `level` included in response (shown to potential joiners)
- **Phase 4 Conquest:** `SquadCardState.cardLevelMultiplier` — the level influences `cardLevelMultiplier` which multiplies INF (influence) during venue battles (computed in `src/lib/conquest/card-recompute.ts`)

**Level does NOT unlock new features** in the current implementation — it is purely a display/progression metric.

---

### 3.4 Player-Level XP (Separate from Squad XP)

**There is no separate player-level XP system.** The only XP that exists is Squad XP stored in `squads.total_xp`. Individual player contributions are tracked in `squad_xp_log.profile_id` and surfaced as `myContribution.xpEarned` in the squad home response, but there is no `player_xp` field, no player level, and no player XP table.

---

## 4. KUDOS SYSTEM

### 4.1 Two Distinct "Kudos" Concepts

There are **two separate things called "kudos"** in this codebase that should not be confused:

**Kudos Type A — Social reactions** (the `kudos` DB table):
- Players react to other players' feed items with emoji reactions: `fistbump` (🤜), `flame` (🔥), `star` (⭐)
- Toggled (create on first tap, delete on second tap)
- Stored in `kudos` table, keyed by `(fromPlayerId, toPlayerId, type, feedItemId)`
- **Does NOT appear in squad profiles** — it is a social graph reaction, not a currency

**Kudos Type B — Chest reward currency** (stored in `squad_chest_openings.kudos_awarded`):
- Awarded when opening a chest: `12` (earner) or `8` (contributor)
- Stored as an integer in `squad_chest_openings.kudos_awarded`
- **Currently NOT persisted anywhere as a running total** — the integer is stored on the individual opening row but there is no `player_kudos_balance` field, no `player_kudos` table, and no aggregation endpoint
- Displayed in the `ChestOpenAnimation` as `+{kudosAwarded} KUDOS`

### 4.2 Social Kudos — Where Awarded

**File:** `src/app/api/kudos/route.ts`  
**Endpoints:**
- `POST /api/kudos` — toggle a kudos reaction (create or delete)
- `GET /api/kudos?toPlayerId=&feedItemId=` — get kudos counts and my reactions for a player/feed item

```typescript
// POST body
{ toPlayerId: string, type: 'fistbump' | 'flame' | 'star', feedItemId?: string }
```

### 4.3 Kudos DB Schema

**Table:** `kudos` (from migration `add_kudos/migration.sql`)

```sql
CREATE TABLE IF NOT EXISTS kudos (
  id SERIAL PRIMARY KEY,
  from_player_id TEXT NOT NULL,
  to_player_id BIGINT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fistbump', 'flame', 'star')),
  feed_item_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_player_id, to_player_id, type, feed_item_id)
);
CREATE INDEX IF NOT EXISTS kudos_to_idx ON kudos (to_player_id, type);
CREATE INDEX IF NOT EXISTS kudos_from_idx ON kudos (from_player_id, created_at);
```

**Prisma model** (`schema.prisma` lines 432–444):
```prisma
model Kudos {
  id           Int      @id @default(autoincrement())
  fromPlayerId String   @map("from_player_id")
  toPlayerId   BigInt   @map("to_player_id")
  type         String
  feedItemId   String?  @map("feed_item_id")
  createdAt    DateTime @default(now()) @map("created_at")

  @@unique([fromPlayerId, toPlayerId, type, feedItemId])
  @@index([toPlayerId, type])
  @@index([fromPlayerId, createdAt])
  @@map("kudos")
}
```

### 4.4 Chest Kudos — Where Stored

The `kudos_awarded` integer (12 or 8) is stored in `squad_chest_openings.kudos_awarded`. **It is never summed or displayed in the squad profile.** The chest open animation shows the per-opening value, and that is the end of it. There is no running Kudos balance anywhere.

---

## 5. DATA MODELS

### 5.1 User (NextAuth)

```prisma
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      AuthSession[]
  profile       PlayerProfile?
  @@map("auth_users")
}
```

### 5.2 PlayerProfile

```prisma
model PlayerProfile {
  id                    String    @id @default(uuid())
  userId                String?   @unique           // links to auth_users
  zaloId                String?   @unique
  reclubUserId          BigInt?   @unique           // links to reclub players table
  displayName           String?
  gender                String?
  preferences           Json      @default("{}")    // { dupr, timeSlots, market, gender }
  onboardingCompleted   Boolean   @default(false)
  pushToken             String?
  pushTokenIos          String?
  pushTokenUpdatedAt    DateTime?
  lastActiveAt          DateTime?
  streakData            Json?
  streakComputedAt      DateTime?
  squadNickname         String?   @unique           // in-squad display name
  squadNicknameSetAt    DateTime?
  reportFlaggedAt       DateTime?
  suspended             Boolean   @default(false)
  banned                Boolean   @default(false)
  createdAt             DateTime  @default(now())
  lastSeen              DateTime  @updatedAt

  // Relations
  user             User?
  reclubPlayer     Player?
  following        Follow[]
  foundedSquads    Squad[]       @relation("SquadFounder")
  squadMemberships SquadMember[]
  chestsEarned     SquadChest[]       @relation("ChestEarner")
  chestOpenings    SquadChestOpening[]
  // ...other relations
  @@map("player_profiles")
}
```

### 5.3 Squad

```prisma
model Squad {
  id           String        @id @default(uuid())
  name         String
  emoji        String
  color        String
  isPublic     Boolean       @default(true)
  showDupr     Boolean       @default(true)
  appSlug      String        @default("squadd")
  founderId    String
  totalXp      Int           @default(0)
  level        Int           @default(1)
  city         String        @default("hcm")
  streakDays   Int           @default(0)
  streakLastUpdated DateTime?  @db.Date
  latitude     Float?
  longitude    Float?
  createdAt    DateTime      @default(now())
  disbandedAt  DateTime?

  founder      PlayerProfile @relation("SquadFounder", ...)
  members      SquadMember[]
  code         SquadCode?
  invites      SquadInvite[]
  chests       SquadChest[]
  xpLog        SquadXpLog[]
  // ...Phase 4 conquest relations
  @@map("squads")
}
```

### 5.4 SquadChest

```prisma
model SquadChest {
  id          String              @id @default(uuid())
  squadId     String
  earnerId    String
  sessionId   Int?                // nullable: scraper-generated chests link to sessions
  source      String              @default("checkin")  // 'checkin' | 'scraper'
  venueName   String?
  checkinDate DateTime?           @db.Date
  createdAt   DateTime            @default(now())
  expiresAt   DateTime            // now + 24 hours

  squad       Squad
  earner      PlayerProfile       @relation("ChestEarner", ...)
  openings    SquadChestOpening[]

  @@unique([squadId, earnerId, checkinDate])
  @@map("squad_chests")
}
```

### 5.5 SquadChestOpening

```prisma
model SquadChestOpening {
  id           Int           @id @default(autoincrement())
  chestId      String
  profileId    String
  status       String        @default("pending")  // pending|unlocking|ready|opened|expired
  tappedAt     DateTime?
  unlocksAt    DateTime?     // when chest becomes openable
  openedAt     DateTime?
  kudosAwarded Int?          // 12 (earner) or 8 (contributor) — set on open
  xpAwarded    Int?          // 30–80 (earner) or 10–30 (contributor) — set on open

  chest        SquadChest
  profile      PlayerProfile

  @@unique([chestId, profileId])
  @@map("squad_chest_openings")
}
```

### 5.6 SquadXpLog

```prisma
model SquadXpLog {
  id        Int           @id @default(autoincrement())
  squadId   String
  profileId String?       // null for streak/system sources
  source    String        // "checkin" | "scraper_session" | "chest" | "new_member" | "streak"
  xpAmount  Int
  createdAt DateTime      @default(now())

  squad     Squad
  @@map("squad_xp_log")
}
```

### 5.7 SquadMember

```prisma
model SquadMember {
  id        Int           @id @default(autoincrement())
  squadId   String
  profileId String
  role      String        @default("member")  // "founder" | "member"
  joinedAt  DateTime      @default(now())
  leftAt    DateTime?     // null = currently active

  @@unique([squadId, profileId])
  @@map("squad_members")
}
```

### 5.8 SquadCode

```prisma
model SquadCode {
  id        Int      @id @default(autoincrement())
  squadId   String   @unique
  code      String   @unique    // 6-char uppercase alphanumeric
  appSlug   String   @default("squadd")
  createdAt DateTime @default(now())

  @@map("squad_codes")
}
```

### 5.9 SquadInvite

```prisma
model SquadInvite {
  id             Int       @id @default(autoincrement())
  squadId        String
  inviterId      String
  inviteeId      String?   // null for "not on app" invites
  inviteeName    String?
  inviteChannel  String    @default("push")
  status         String    @default("pending")  // pending|accepted|declined|cancelled
  createdAt      DateTime  @default(now())
  resolvedAt     DateTime?
  lastResentAt   DateTime?

  @@map("squad_invites")
}
```

### 5.10 Kudos

```prisma
model Kudos {
  id           Int      @id @default(autoincrement())
  fromPlayerId String                    // PlayerProfile.id
  toPlayerId   BigInt                    // Player.userId (Reclub user)
  type         String                    // 'fistbump' | 'flame' | 'star'
  feedItemId   String?
  createdAt    DateTime @default(now())

  @@unique([fromPlayerId, toPlayerId, type, feedItemId])
  @@map("kudos")
}
```

### 5.11 TypeScript Client Types (Mobile)

```typescript
// mobile/src/modules/squad/types.ts

export interface Squad {
  id: string; name: string; emoji: string; color: string;
  isPublic: boolean; showDupr: boolean; appSlug: string;
  founderId: string; totalXp: number; level: number;
  city?: string; streakDays?: number; cityRank?: number;
  createdAt: string; disbandedAt: string | null;
  code?: SquadCode | null; members?: SquadMemberWithProfile[];
  invites?: SquadInviteEnriched[];
}

export interface SquadChest {
  id: string; squadId?: string; earnerId: string; earnerName: string;
  source: 'checkin' | 'scraper'; venueName: string | null;
  createdAt: string; expiresAt: string;
  openings: SquadChestOpening[];
  myOpening?: { status: ChestOpeningStatus; unlocksAt: string | null } | null;
}

export interface ChestOpenResult {
  kudosAwarded: number;
  xpAwarded: number;
  squadLevel: number;
  squadXp: number;
}

export type ChestOpeningStatus = 'pending' | 'tapped' | 'unlocking' | 'ready' | 'opened' | 'expired';
```

---

## 6. RELEVANT API ENDPOINTS

### 6.1 Authentication

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/mobile-token` | `src/app/api/auth/mobile-token/route.ts` | Verify Google/Apple idToken, create/find User + PlayerProfile, return JWT + `hasCompletedOnboarding` |
| `GET` | `/api/auth/mobile-token?dev=1` | Same | Dev shortcut: return JWT for dev account |

**Response shape:**
```json
{
  "jwt": "...",
  "userId": "cuid",
  "profileId": "uuid",
  "displayName": "...",
  "imageUrl": "...",
  "reclubUserId": "12345" | null,
  "hasCompletedOnboarding": false,
  "duprRating": 3.5 | null,
  "gender": "man" | "female" | null,
  "market": "hcm" | "kl"
}
```

### 6.2 Onboarding Completion

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/profile` | `src/app/api/profile/route.ts` | Save onboarding preferences + mark `onboarding_completed = true`. Also links Reclub user. |

**Request body:**
```json
{
  "profileId": "uuid",
  "preferences": { "dupr": 3.5, "timeSlots": ["morning"], "gender": "man", "market": "hcm" },
  "gender": "man",
  "market": "hcm",
  "reclubUserId": "12345678"
}
```

### 6.3 Squad Creation & Management

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/squads` | `src/app/api/squads/route.ts` | Create a new squad (founder role, generates join code, awards 40 XP) |
| `PATCH` | `/api/squads/{id}` | `src/app/api/squads/[id]/route.ts` | Edit squad (founder only: name, emoji, isPublic, showDupr) |
| `GET` | `/api/squads/my` | `src/app/api/squads/my/route.ts` | Get caller's current squad + active chest + recent feed + streak + contribution stats |
| `POST` | `/api/squads/join-by-code` | `src/app/api/squads/join-by-code/route.ts` | Join squad by 6-char code (awards 40 XP if first squad ever) |
| `GET` | `/api/squads/by-code/{code}` | `src/app/api/squads/by-code/route.ts` | Preview a squad by code (before joining) |
| `GET` | `/api/squads/nearby` | `src/app/api/squads/nearby/route.ts` | List nearby squads with open spots (uses lat/lng) |
| `POST` | `/api/squads/{id}/leave` | squad route | Leave a squad |
| `POST` | `/api/squads/{id}/disband` | squad route | Disband squad (founder only) |
| `GET` | `/api/squads/nickname` | `src/app/api/squads/nickname/route.ts` | Get/suggest nickname for current user |
| `POST` | `/api/squads/nickname` | Same | Set/update squad nickname |
| `POST` | `/api/squads/{id}/invite/{inviteId}/accept` | squad route | Accept squad invite |

### 6.4 Squad Waitlist (Legacy / Marketing)

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/squad-waitlist` | `src/app/api/squad-waitlist/route.ts` | Register interest in Squadd (saves to `squad_waitlist` table) |

### 6.5 Chest System

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/squads/checkin` | `src/app/api/squads/checkin/route.ts` | Check in at a venue: create chest + openings for all members + award 60 XP |
| `GET` | `/api/squads/{id}/chests` | `src/app/api/squads/[id]/chests/route.ts` | List chests for a squad (`?status=active` to filter non-expired) |
| `POST` | `/api/squads/chests/{chestId}/tap` | `src/app/api/squads/chests/[chestId]/tap/route.ts` | Start the unlock timer (pending → unlocking, currently 2min dev / 4h prod) |
| `POST` | `/api/squads/chests/{chestId}/open` | `src/app/api/squads/chests/[chestId]/open/route.ts` | Claim rewards (kudos + XP), writes to `squad_chest_openings` and awards squad XP |
| `POST` | `/api/squads/{id}/nudge` | squad route | Send push notification to squad members who haven't tapped yet |
| `POST` | `/api/squads/chests/{chestId}/notify-created` | chest route | (Scraper/cron) notify squad members a new chest is ready |

### 6.6 XP

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/squads/{id}/award-xp` | `src/app/api/squads/[id]/award-xp/route.ts` | Admin/cron: manually award XP to a squad with a given source |
| `GET` | `/api/squads/leaderboard` | `src/app/api/squads/leaderboard/route.ts` | City leaderboard: squads ranked by XP |

### 6.7 Kudos

| Method | Endpoint | File | Description |
|--------|----------|------|-------------|
| `POST` | `/api/kudos` | `src/app/api/kudos/route.ts` | Toggle reaction (fistbump/flame/star) on a feed item |
| `GET` | `/api/kudos?toPlayerId=&feedItemId=` | Same | Get reaction counts + my reactions for a player/item |

---

## 7. MIGRATION FILES

Key migrations related to the documented systems:

| Migration | File | What it adds |
|-----------|------|-------------|
| Phase 1 squads | `prisma/migrations/20260611021303_add_squads_phase1/migration.sql` | `squads`, `squad_members`, `squad_codes`, `squad_invites` tables |
| Phase 2 chests | `prisma/migrations/20260613_add_squads_phase2/migration.sql` | `squad_chests`, `squad_chest_openings`, `squad_xp_log`; adds `city`, `streak_days`, `streak_last_updated` to squads |
| Squad geo | `prisma/migrations/20260612093010_add_squad_geo/migration.sql` | `latitude`, `longitude` on squads |
| Squad nickname | `prisma/migrations/20260611_add_squad_nickname/migration.sql` | `squad_nickname`, `squad_nickname_set_at` on `player_profiles` |
| Kudos | `prisma/migrations/add_kudos/migration.sql` | `kudos` table (social reactions) |
| Waitlist | `prisma/migrations/20260604120000_add_squad_waitlist/migration.sql` | `squad_waitlist` table |

---

## 8. NOTABLE GAPS / THINGS THAT DON'T EXIST YET

1. **No chest rarity/tiers** — every chest is identical. No `rarity` field anywhere.
2. **No player-level XP** — only squad XP exists. No player progression system.
3. **No Kudos balance** — chest `kudos_awarded` integers are stored per-opening but never summed into a player currency. They cannot be spent, traded, or displayed as a running total in the squad profile.
4. **Unlock timer is currently 2 minutes** (dev mode) — should be 4 hours for production. See `tap/route.ts` line 39.
5. **No chest for scraper sessions yet in prod flow** — `SquadChest.source` can be `'scraper'` and `squad_chests.py` exists in the scraper, but the primary prod path is player-initiated `checkin`.
6. **Squad profile does not show Kudos** — confirmed, the squad home/profile has no Kudos display. Only `totalXp`, `level`, `streakDays`, `myContribution` are shown.
