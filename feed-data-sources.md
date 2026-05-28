# Feed data sources & notification storage

Reference for how the Circle **My Feed** is built on server and client, and how push notifications relate to feed items.

**Primary API:** `GET /api/feed` — `src/app/api/feed/route.ts`  
**Primary client:** `mobile/src/screens/CircleScreen.tsx`  
**Types:** `mobile/src/data.ts`

There is **no `feed_items` table**. Items are assembled in memory on each request from `Follow`, `SessionRoster`, `Session`, `Player`, and `Kudos`.

---

## 1. Feed API endpoint

### 1.1 Feed item types returned (7)

| Type | Source |
|------|--------|
| `joining` | `sessionRoster` + upcoming sessions |
| `played` | Aggregated from past `sessionRoster` (last 30 days, not today) |
| `played_today` | `sessionRoster` for today's ended sessions |
| `you_are_playing` | Current user's live `sessionRoster` row |
| `streak_milestone` | Computed per followee from roster history |
| `just_followed` | `Follow` rows you created (last 30 days) |
| `new_follower` | `Follow` rows where you are followee (last 30 days) |

**Not returned by API:** `dupr_update` (client type/UI only).

---

### 1.2 Prisma queries per type

#### Shared setup

```ts
const follows = await prisma.follow.findMany({
  where: { followerId: user.profileId },
  select: { followeeId: true },
});
```

If `follows.length === 0` → `{ items: [], hasFollows: false }`.

#### `joining`

`sessionRoster.findMany`:

- **where:** `userId in followeeIds`, `session.scrapedDate >= todayStr`
- **include:** `player`, `session` (id, name, startTime, scrapedDate, eventUrl, maxPlayers, club.name, latest snapshot)
- **orderBy:** session `startTime` asc, **take:** 15
- One item per roster row (loop ~lines 86–103)

#### `played`

1. `sessionRoster.findMany` (`recentRosters`):
   - **where:** followees, `session.scrapedDate` between `cutoffStr` (30d ago) and **&lt; today**
   - **take:** 40
2. **Server-side aggregation** in `playedMap` keyed by `userId + club.name` → one `played` item per player+venue with `sessionCount`

#### `played_today`

`sessionRoster.findMany` (`todayCompletedRosters`):

- **where:** followees, `scrapedDate = today`, `endTime <= nowTimeVN` (VN HH:mm)
- **take:** 20
- Deduped by `userId_sessionId`

#### `you_are_playing`

Only if `user.reclubUserId`:

1. `sessionRoster.findFirst` — user on session where `scrapedDate = today`, `startTime <= now`, `endTime > now`
2. `player.findUnique` for current user profile

#### `streak_milestone`

Per `followeeId` (loop):

1. `sessionRoster.findMany` — up to 200 past sessions (`scrapedDate < today`)
2. **In-memory** week keys, streak count, milestone check against `[4, 8, 12, 26, 52]`
3. `player.findUnique` when milestone hits

#### `just_followed`

`follow.findMany` (`recentFollowing`):

- **where:** `followerId = user.profileId`, `createdAt >= thirtyDaysAgo`
- **include:** `followee` (Player)
- **take:** 10

#### `new_follower`

Only if `user.reclubUserId`:

- `follow.findMany` — `followeeId = user.reclubUserId`, `createdAt >= thirtyDaysAgo`
- **include:** `follower.reclubPlayer`
- **take:** 10

#### Post-processing (all types)

1. **Sort:** `you_are_playing` first, then `joining`, then timestamp desc
2. **Cap:** max **2 items per player** except `just_followed`, `new_follower`, `played_today`, `you_are_playing`
3. **Slice** to **20** items
4. **Kudos** batch: `kudos.groupBy` + `kudos.findMany` by `feedItemId`

---

### 1.3 Response JSON shape per type

**Common fields (all types after kudos merge):**

```json
{
  "id": "string",
  "type": "<FeedItemType>",
  "player": {
    "userId": "string",
    "displayName": "string | null",
    "imageUrl": "string",
    "duprDoubles": "number | null"
  },
  "isFollowing": "boolean",
  "timestamp": "ISO string",
  "kudos": {
    "fistbump": 0,
    "flame": 0,
    "star": 0,
    "myReactions": []
  }
}
```

**Type-specific fields:**

| Type | Extra fields |
|------|----------------|
| `joining` | `sessionName`, `venueName`, `sessionTime`, `spotsLeft`, `sessionId`, `eventUrl` |
| `played` | `venueName`, `sessionCount` |
| `played_today` | `venueName`, `sessionId` |
| `you_are_playing` | `sessionName`, `venueName`, `sessionId`, `eventUrl`; `isFollowing: false` |
| `streak_milestone` | `streakCount`, `weeklyPlayed` (boolean[]) |
| `just_followed` | (common only) |
| `new_follower` | (common only); `isFollowing: false` |

**Top-level response:**

```json
{ "items": [...], "hasFollows": true }
```

(or `{ "items": [], "hasFollows": false }` when the user follows nobody)

---

### 1.4 Server-generated vs table-backed

| Pattern | Examples |
|---------|----------|
| **Direct from DB rows** | `joining`, `played_today`, `just_followed`, `new_follower` |
| **Aggregated in handler** | `played` (count by player+venue), `streak_milestone` (streak math) |
| **Conditional / computed** | `you_are_playing` (live window), `spotsLeft` from snapshot |
| **Enrichment pass** | `kudos` from `Kudos` table |

Nothing is read from a dedicated feed or notifications table for item content.

---

## 2. Feed state management (client)

### Where `feedItems` lives

`useState` in **`CircleScreen.tsx` only** — not a Zustand feed store:

```ts
const [feedItems, setFeedItems] = useState<FeedItem[]>([])
```

Related: `pendingNewFollower` in **`uiStore`** (`mobile/src/stores/uiStore.ts`) — bridge for PN4 tap, not persisted feed data.

### Initialization on launch

- Default: **`[]`**
- No global feed load on app start
- Load runs when: `jwt` exists, `subTab === 'feed'`, and `feedLoadedRef.current` is false

`feedLoadedRef` resets to `false` only after a successful **unfollow**, so leaving/re-entering the feed tab does not refetch unless that happens or the user pull-to-refreshes.

### After `loadFeed()`

```ts
const res = await authedFetch('/api/feed')
setFeedItems(data.items ?? [])
```

**Full replace** of `feedItems` from API — no merge with existing local items on load.

### Local merge (prepend only)

| Location | Type | Trigger |
|----------|------|---------|
| `useEffect` on `pendingNewFollower` | `new_follower` | PN4 notification tap |
| `prependJustFollowedFeedItem` | `just_followed` | Follow from suggestions or player search |

On `loadFeed()`, local prepends are **wiped** when `setFeedItems(data.items ?? [])` runs.

### AsyncStorage

**Feed items are not persisted.** AsyncStorage in this flow is only for `hasSeenAvatarTip` (avatar tip UI), not feed content.

---

## 3. The `just_followed` feed item

### Two creation paths

#### A) Server (persistent across reload)

`GET /api/feed` reads `Follow` rows created in the last 30 days:

```ts
items.push({
  id: `just_followed_${f.followeeId}`,
  type: "just_followed",
  player: toPlayerPayload(f.followee),
  isFollowing: true,
  timestamp: f.createdAt.toISOString(),
});
```

Backed by **`POST /api/follows`** (creates `Follow` row).

#### B) Client (instant UI)

`prependJustFollowedFeedItem` in `CircleScreen.tsx`:

```ts
const newItem: FeedItem = {
  id: `follow_${userId}_${Date.now()}`,
  type: 'just_followed',
  // ...
}
setFeedItems((prev) => [newItem, ...prev])
```

Called from `handleFollowFromSuggestion` and `handleFollowFromSearch`.

### Storage

| Mechanism | Used? |
|-----------|--------|
| Prepend to `feedItems` state | Yes |
| AsyncStorage | No |
| Dedicated feed API write | No (only `Follow` row) |

### Survives reload?

| Scenario | Result |
|----------|--------|
| App kill / reinstall + `loadFeed()` | Local prepend **gone**; **may** reappear from API if follow was within 30 days |
| Pull-to-refresh / `loadFeed()` | Local item replaced; API version shows if still in window |
| Component unmount | State lost; no auto refetch until `feedLoadedRef` reset or manual refresh |

---

## 4. Local-only feed item creation

No `feedItems.unshift(...)` in the mobile app.

All `setFeedItems(prev => [newItem, ...prev])` locations:

| File | Line | Type | Trigger |
|------|------|------|---------|
| `CircleScreen.tsx` | ~165 | `new_follower` | `pendingNewFollower` from PN4 tap |
| `CircleScreen.tsx` | ~321 | `just_followed` | `prependJustFollowedFeedItem` |

**`gear_update`:** not defined in feed types.

**`streak_milestone`:** API only — no local creation.

**`dupr_update`:** `FeedItemRow` UI only — never created locally or by `/api/feed`.

---

## 5. API types vs `data.ts`

### `FeedItemType` in `mobile/src/data.ts`

```
'joining' | 'played' | 'played_today' | 'you_are_playing' |
'dupr_update' | 'just_followed' | 'streak_milestone' | 'new_follower'
```

### Returned by server AND in `data.ts` (7)

`joining`, `played`, `played_today`, `you_are_playing`, `just_followed`, `streak_milestone`, `new_follower`

### In `data.ts` but NEVER returned by server (1)

| Type | Notes |
|------|--------|
| **`dupr_update`** | Render path in `FeedItemRow`; no API builder; no local creator |

### Never in `data.ts`

- **`gear_update`**

### Notable mismatches

| Issue | Detail |
|-------|--------|
| **`just_followed` id** | Client: `follow_${userId}_${Date.now()}` vs API: `just_followed_${followeeId}` — duplicates possible until refresh |
| **`new_follower` id** | Push client: `new_follower_${userId}_${Date.now()}` vs API: `new_follower_${f.follower.id}` (profile id) |
| **`new_follower` player** | Push prepend sets `duprDoubles: null`; API includes full player payload |
| **`kudos`** | Always added server-side; optional on `FeedItem` in `data.ts` |

---

## 6. Notification persistence

### Do push notifications add feed items?

| Event | Feed impact |
|-------|-------------|
| **Notification received** (foreground) | **No** — only `console.log` in `App.tsx` |
| **Notification tapped — PN4** (`type === 'pn4'`, `screen === 'Circle'`) | **Yes, indirectly** — `setPendingNewFollower` → prepend local `new_follower` |
| **PN1** (friend joining) | **No** — navigates to `Shortlist` |
| **PN5** (weekly recap) | **No** feed wiring in mobile |

Receiving a push does **not** insert into the feed unless the user **taps** PN4 and the prepend effect runs.

### Notifications table in DB

**`NotificationSent`** (`notifications_sent` in `prisma/schema.prisma`):

- `recipientId`, `senderId`, `type`, `sentAt`
- Used for **push delivery logging and throttling** (`pn1`, `pn4`, `pn5` in `src/lib/notifications/`)
- **Not** used as feed content

### Does `/api/feed` read `notifications_sent`?

**No.** Follow-related feed items (`just_followed`, `new_follower`) come from the **`Follow`** table (`createdAt` last 30 days).

---

## Architecture summary

```
GET /api/feed
  Follow, SessionRoster, Session, Player
    → in-memory items (+ aggregation for played / streak)
    → Kudos enrichment
    → JSON { items, hasFollows }

CircleScreen
  loadFeed() → setFeedItems(API)     // full replace
  PN4 tap → pendingNewFollower → prepend new_follower
  follow UI → prepend just_followed  // instant; API on refresh

NotificationSent
  throttle/log for push only — not read by feed API
```

**Persistence rule:** To survive reinstall, the event must be reconstructable from DB sources the feed API queries (e.g. `Follow`). Local prepends are **session UI only** until the next `loadFeed()`.

---

## Key file index

| Area | Path |
|------|------|
| Feed API | `src/app/api/feed/route.ts` |
| Feed UI state | `mobile/src/screens/CircleScreen.tsx` |
| Feed types | `mobile/src/data.ts` |
| Feed row render | `mobile/src/components/FeedItemRow.tsx` |
| PN4 push handler | `src/lib/notifications/pn4-new-follower.ts` |
| Push tap → feed bridge | `mobile/App.tsx` |
| Notification log schema | `prisma/schema.prisma` (`NotificationSent`) |
| Follow model | `prisma/schema.prisma` (`Follow`) |
