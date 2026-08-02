# My Feed Items — Implementation Guide

Last updated: **Friday July 31, 2026**

This document describes every feed item type shown in **Circle → My Feed**, how each one is built, and how it is saved in the database. Use it as the source of truth when debugging missing items or duplicate timestamps.

---

## Architecture overview

```
GET /api/feed
  ├─ Live query (rebuilt every request)
  │    SessionRoster, Follow, Player, PlayerDuprHistory, …
  │    → up to 20 items after per-player cap
  │    → fire-and-forget upsert into feed_items (create once, payload-only update)
  │
  └─ Historical query
       feed_items WHERE profile_id = viewer
       → items no longer in live set (except you_are_playing is excluded)
       → merged with live, sorted by timestamp DESC, max 200

Push cron / API hooks (PN6, PN7, PN8)
  → upsert feed_items directly at event time
  → survive even when live query no longer returns the item

GET /api/recap/weekly
  → client-only card prepended by CircleScreen on first feed open per week
  → not stored in feed_items; uses PlayerProfile.preferences for seen-flag
```

**Primary API:** `GET /api/feed` — `pickleball-hub/src/app/api/feed/route.ts`  
**DB table:** `feed_items` (`FeedItem` in Prisma)  
**Mobile types:** `pickleball-hub/mobile/src/data.ts` → `FeedItemType`  
**UI render:** `pickleball-hub/mobile/src/components/FeedItemRow.tsx`

### `feed_items` schema

| Column | Purpose |
|--------|---------|
| `id` | Primary key — must be unique **per recipient** (see played_today rule) |
| `profile_id` | Viewer who sees this item in their feed |
| `type` | Feed item type string |
| `player_user_id` | Reclub user id of the player the item is about |
| `payload` | Full JSON blob returned to the mobile client |
| `timestamp` | Sort key — **immutable after first insert** (see persistence rules) |
| `created_at` | Row insert time (audit only; not used for sorting) |

---

## Feed item types (13 + 1 client-only)

| # | Type | Who sees it | Primary source | Persisted? |
|---|------|-------------|----------------|------------|
| 1 | `joining` | Followers | Live query | On feed load |
| 2 | `played_today` | Followers (+ self via PN6) | Live query **+ PN6 cron** | PN6 at session end; live on feed load |
| 3 | `played` | Followers | Live query | On feed load |
| 4 | `you_are_playing` | Self only | Live query **+ PN7 cron** | PN7 at session start; live on feed load |
| 5 | `played_self` | Self only | Live query **+ PN6 cron** | PN6 at session end; live on feed load |
| 6 | `just_followed` | Self | Live query (`Follow`) | On feed load |
| 7 | `new_follower` | Self | Live query (`Follow`) | On feed load |
| 8 | `streak_milestone` | Followers | Live query (computed) | On feed load |
| 9 | `dupr_update` | Followers | Live query (`PlayerDuprHistory`) | On feed load |
| 10 | `gear_setup` | Followers | PN8 on gear save | PN8 only |
| 11 | `comeback` *(Phase B)* | Followers | Live query (`played_today` path) | On feed load |
| 12 | `first_venue` *(Phase B)* | Followers | Live query (`played_today` path) | On feed load |
| 13 | `first_host` *(Phase B)* | Followers | Club Session PATCH hook | On session publish |
| — | `weekly_recap` *(Phase C, client-only)* | Self | `GET /api/recap/weekly` | Never persisted in `feed_items` |

---

## Persistence rules (all types)

### Rule 1 — Timestamp is immutable after create

Once a `feed_items` row exists, **`timestamp` must not change**. The feed is sorted by this field; overwriting it makes old events look new (e.g. a `just_followed` from May 30 appearing as “today”).

| Writer | Create | Update |
|--------|--------|--------|
| `GET /api/feed` persist step | Sets `timestamp` from item | **`payload` only** — no timestamp overwrite |
| PN6 `played_today` / `played_self` | Sets `timestamp` = session end | `update: {}` — no-op |
| PN7 `you_are_playing` | Sets `timestamp` = session start | Refreshes payload **and timestamp** ⚠️ |
| PN8 `gear_setup` | Sets `timestamp` = gear save time | Overwrites payload **and timestamp** on re-save ⚠️ |

### Rule 2 — ID must include the recipient when one event fan-outs to many viewers

If the same player+session event creates a feed item for **each follower**, the id **must** include the viewer's `profile_id`:

```
played_today_{playerUserId}_{sessionId}_{followerProfileId}   ✅ PN6 (fixed June 7)
gear_setup_{playerUserId}_{followerProfileId}                 ✅ PN8
```

**Bug fixed June 7:** PN6 previously used `played_today_{playerUserId}_{sessionId}` without the follower id, so only the first follower in the loop got a row.

### Rule 3 — One row per logical event per recipient

Use a deterministic id so `upsert` deduplicates retries. Never use `Date.now()` in persisted ids.

### Rule 4 — Live vs historical merge

On each `GET /api/feed`:

1. Build **live items** from DB queries (rosters, follows, etc.).
2. Load up to 30 **persisted** rows for this viewer (cursor when paginating).
3. Drop persisted rows whose `id` is already in the live set.
4. Drop persisted `you_are_playing` (always live-only in merge).
5. Merge, sort by `timestamp` DESC, attach kudos, return max 200.

Items that fall out of the live query window (e.g. follow older than 5 days, session ended yesterday) **remain visible** only if they were previously persisted.

---

## Per-type specification

### 1. `joining`

**UI:** “{name} · joining” + mini session card with **Join too** button.

**Trigger:** A followed player is on an upcoming session roster (`scrapedDate >= today`).

**Live query:** `sessionRoster` for followees, sessions today or future, take 15.

**ID:** `joining_{playerUserId}_{sessionId}`

**Timestamp:** `sessionRoster.firstSeenAt` (when we first saw them on that roster), fallback `now`.

**Saved:** Upserted when item appears in the live top-20 after cap — `GET /api/feed` persist step.

**Push:** PN1 — “{name} is joining tonight” (does **not** create a feed item; navigates to Shortlist).

**Cap:** Counts toward max **2 items per player**.

---

### 2. `played_today`

**UI:** “{name} just finished playing at {venue} · give them some kudos 🤜”

**Trigger:** A followed player finished a session today (`endTime <= now` VN).

**Two builders (important):**

| Source | ID format | When |
|--------|-----------|------|
| Live query | `played_today_{playerUserId}_{sessionId}_{viewerProfileId}` | Every feed load while session still “today ended” |
| PN6 cron | `played_today_{playerUserId}_{sessionId}_{followerProfileId}` | Within ~70 min after session end |

**Timestamp:** Session end time in VN — `sessionEndTimestamp(scrapedDate, endTime)`.

**Saved:**
- **PN6** (`pn6-session-finished.ts`): upsert per follower, `update: {}` — immutable.
- **Feed route**: upsert if in live top-20.

**Push:** PN6 — “{name} just finished playing 🏓”. Dedup `pn6:{sessionId}:{followeeUserId}`. Max 2 PN6 pushes per recipient per 4 h.

**Cap:** **Exempt** — one item per session per follower is allowed (multiple sessions same day = multiple items).

---

### 3. `played`

**UI:** “{name} played at {venue} · {N} times this month” (aggregated).

**Trigger:** Followee played at a venue in the last **5 days** (not today).

**Live query:** Aggregate `sessionRoster` by `playerUserId + club.name`, count sessions.

**ID:** `played_{playerUserId}_{venueName}`

**Timestamp:** Most recent session end in that group.

**Saved:** On feed load persist step only.

**Push:** None.

**Cap:** Max **2 items per player** (this type counts).

---

### 4. `you_are_playing`

**UI:** “You are playing at {venue}” + **Show me** button (opens session roster).

**Trigger:** Viewer's own roster row on a **live** session (`startTime <= now < endTime`).

**Live query:** `sessionRoster` for `user.reclubUserId`, filtered with `isSessionLive()`.

**ID:** `you_are_playing_{sessionId}`

**Timestamp:** Session start — `sessionStartTimestamp(today, startTime)`.

**Saved:**
- **PN7** (`pn7-you-are-playing.ts`): upsert when cron detects live session.
- **Feed route**: live build + persist if in top-20.

**Push:** PN7 — “You are playing 🏓”. Dedup `pn7:{sessionId}`.

**Cap:** **Exempt**.

**Merge note:** Historical persisted `you_are_playing` rows are **excluded** from merge — always rebuilt live.

---

### 5. `played_self`

**UI:** “You finished playing at {venue} 🏓” (kudos row dimmed).

**Trigger:** Viewer finished a session (today ended, or last 5 days).

**Live query:** `sessionRoster` for self, past + today ended. Skipped if `you_are_playing` exists for same session.

**ID:** `played_self_{playerUserId}_{sessionId}`

**Timestamp:** Session end time.

**Saved:**
- **PN6**: upsert for the player's own profile when session ends.
- **Feed route**: live fallback if PN6 missed.

**Push:** None (PN6 push goes to **followers**, not self).

**Cap:** **Exempt**.

---

### 6. `just_followed`

**UI:** “You are now following {name} · tap their avatar to see their profile”

**Trigger:** User followed someone in the last **5 days**.

**Live query:** `Follow` where `followerId = viewer`, `createdAt >= fiveDaysAgo`.

**ID:** `just_followed_{followeeUserId}`

**Timestamp:** `Follow.createdAt` — must stay fixed; do not refresh on re-persist.

**Saved:** On feed load persist step.

**Client-only prepend:** `follow_{userId}_{Date.now()}` — instant UI, wiped on next `loadFeed()`.

**Push:** None.

**Cap:** **Exempt**.

---

### 7. `new_follower`

**UI:** “{name} is now following you · tap their avatar to see their profile”

**Trigger:** Someone followed the viewer in the last **5 days**.

**Live query:** `Follow` where `followeeId = viewer.reclubUserId`.

**ID:** `new_follower_{followerProfileId}` (profile id, not reclub user id)

**Timestamp:** `Follow.createdAt`.

**Saved:** On feed load persist step.

**Client-only prepend:** PN4 tap → `new_follower_{userId}_{Date.now()}` via `pendingNewFollower` in `uiStore`.

**Push:** PN4 — “Someone is following your game”. Does not write `feed_items`; tap prepends locally.

**Cap:** **Exempt**.

---

### 8. `streak_milestone`

**UI:** “{name} hit a 🔥 {N}-week streak · playing every week” + mini streak card.

**UI (Phase A):** Gold milestone card — "{name} has played {N} weeks in a row" + W1–W6 week dots + labeled "Cheer them on" CTA.

**Trigger:** Followee hit milestone week count ∈ {3, 5, 10} **and** has a `played_today` for the current window, **and** `preferences.milestone_streak_N` is unset.

**Live query:** Computed from up to 90 days of roster history per followee. Only fires for followees who played today.

**ID:** `streak_{followeeUserId}_{streakCount}`

**Timestamp:** Latest session date/time used in streak calc.

**Saved:** On feed load persist step only.

**Push (Phase A):** PN6 fires "{name} just reached a {N}-week streak 🔥" per follower at session end. Flag `milestone_streak_N` set on player prefs to prevent re-emit.

**Priority:** Lower than `session_count` — if same player has both in same session window, streak row is suppressed.

**Cap:** Max **2 items per player**.

**Legacy rows (4, 8, 12, 26, 52):** Remain in `feed_items` from before Phase A; no new rows emitted.

---

### 9. `dupr_update`

**UI:** “DUPR updated {old} → {new} after last night”

**Trigger:** Followee's DUPR doubles increased in the last 30 days (`PlayerDuprHistory`).

**Live query:** Last 2 history rows per followee; emit only if `new > old`.

**ID:** `dupr_update_{followeeUserId}_{historyRowId}`

**Timestamp:** `recordedAt` of the latest history row.

**Saved:** On feed load persist step only.

**Push:** None.

**Cap:** Max **2 items per player**.

---

### 10. `gear_setup`

**UI:** “{name} set up their gear · want to have a look?” + **See Gear** button → read-only `GearViewSheet`.

**Trigger:** A followed player completes gear setup (`PUT /api/players/[id]/gear`, all 4 zones filled).

**Writer:** PN8 only (`pn8-gear-setup.ts`) — not in live feed query.

**ID:** `gear_setup_{playerUserId}_{followerProfileId}`

**Timestamp:** Time of gear save (first create). Re-save updates payload + timestamp ⚠️.

**Saved:** PN8 upsert per follower immediately on gear PUT.

**Push:** PN8 — “{name} set up their gear 🏓 / Want to have a look at it?”. Dedup `pn8:{gearOwnerProfileId}` — one push per gear owner, not per follower session.

**Cap:** **Exempt**.

---

### 11. `comeback` *(Phase B)*

**UI:** Blue-lime milestone card — "{name} is back on the court after {N} days!" + CTA "Welcome them back".

**Trigger (priority 3):** Followee has a `played_today` and no higher-priority milestone (session count or streak), **and** their most recent prior session was ≥ 14 days ago.

**Payload fields:** `daysSince` (whole days, floor), `venueName`, `clubName`.

**ID:** Same as `played_today` — `played_today_{playerUserId}_{sessionId}_{followerProfileId}`.

**Timestamp:** Session end time.

**Saved:** Upserted via feed route (same upsert as `played_today`; type field changed to `comeback`).

**Push:** None (no extra push for this type; PN6 still fires as normal `played_today`).

**Cap:** **Exempt**.

---

### 12. `first_venue` *(Phase B)*

**UI:** Teal milestone card — "{name} played at {club} for the first time!" + CTA "Check it out".

**Trigger (priority 4):** Followee has a `played_today`, no higher-priority milestone, no comeback condition, **and** has zero prior sessions at this club (case-insensitive, trimmed club name).

**Payload fields:** `venueName`, `clubName`.

**ID:** Same as `played_today` — `played_today_{playerUserId}_{sessionId}_{followerProfileId}`.

**Saved:** Same upsert flow; type changed to `first_venue`.

**Push:** None.

**Edge case:** Players with ≤ 1 lifetime session are excluded (no prior-session baseline for comparison).

**Cap:** **Exempt**.

---

### 13. `first_host` *(Phase B)*

**UI:** Gold milestone card — "{name} just hosted their first session! 🎉" + deep-link CTA to session detail.

**Trigger:** `PATCH /api/club-sessions/[id]` transitions status to `published`, host has `preferences.milestone_first_host` unset, and this is their first published session (count = 1).

**Writer:** `PATCH /api/club-sessions/[id]` — fires `triggerFirstHost()` helper.

**ID:** `first_host_{sessionId}_{followerProfileId}`

**Timestamp:** Time of session publish.

**Saved:** Upserted per follower in `feed_items`. Idempotent (second publish is silent because flag is already set).

**Push:** "🎉 {name} just hosted their first session" → navigates to Sessions tab session detail. One push per follower.

**Dedup flag:** `milestone_first_host` set on host's `PlayerProfile.preferences`.

**Cap:** **Exempt**.

---

### — `weekly_recap` (client-only, Phase C)

**UI:** Lime-accented card — "YOUR CIRCLE THIS WEEK" · four stat tiles (sessions, co-players, kudos, clubs) · top club · optional most-improved followee · lime "Share my week" button.

**Source:** `GET /api/recap/weekly` — fetched by CircleScreen on initial feed load (once per app session, gated by server-side seen flag).

**Window:** Previous Mon–Sun in Asia/Ho_Chi_Minh (UTC+7).

**Stats returned:** `sessionsPlayed`, `uniqueCoPlayers`, `kudosReceived`, `clubsVisited`, `topClub`, `mostImproved`.

**Seen dedup:** `PlayerProfile.preferences.lastRecapSeenWeek = currentISOWeekKey` set on first `show: true` response. Subsequent calls return `{ show: false }`.

**Not persisted in `feed_items`** — card lives only in CircleScreen's `weeklyRecap` state. Dismissed immediately (local state cleared) when the user taps "×".

**Share text:** `"I played {N} session(s) with {N} friends this week on SQUADD 🏓 squadd.app"` via `Share.share()`.

---

## Milestone system (Phase A–B)

### Dedup flags in `PlayerProfile.preferences`

| Flag key | Set when | Prevents |
|---|---|---|
| `milestone_streak_N` (N = 3/5/10) | Player reaches N-week streak; first emit only | Re-emitting same streak milestone on subsequent sessions |
| `milestone_sessions_N` (N = 10/50/100/200) | Player reaches N lifetime sessions | Re-emitting same session count milestone |
| `milestone_dupr_X_Y` (X_Y = 3_0/3_5/4_0/4_5) | Player crosses DUPR threshold X.Y | Re-emitting same DUPR threshold cross |
| `milestone_first_host` | Host's first session published | Re-triggering first_host feed/push on subsequent publishes |
| `lastRecapSeenWeek` | Weekly recap shown | Showing recap card more than once per week |

### Priority within `played_today` path (per player per session)

```
1. session_count milestone   → milestoneKind: "session_count" on played_today card
2. streak_milestone          → separate streak card (played_today card suppressed)
3. comeback                  → played_today card becomes comeback type
4. first_venue               → played_today card becomes first_venue type
5. plain played_today        → no milestone annotations
```

### Shared helper

`pickleball-hub/src/lib/feed-milestones.ts` — threshold constants, preference key builders, threshold detectors, batch preference fetch/set, lifetime session count, streak computation.

---

## Post-processing (feed API)

Applied to **live items** before persist and response:

1. **Sort:** newest `timestamp` first (no special pinning).
2. **Per-player cap:** max 2 items per `player.userId`, except exempt types (see table above).
3. **Slice:** live list capped at **20** before persist.
4. **Kudos:** attached from `Kudos` table by `feedItemId`.
5. **Final merge:** live + historical, max **200** items (30 when paginating with `?before=`).

---

## Push notification ↔ feed item map

| PN | Feed item created? | Type | Notes |
|----|-------------------|------|-------|
| PN1 | No | — | Opens Shortlist |
| PN4 | No (client prepend) | `new_follower` | Tap → local prepend |
| PN5 | No | — | Weekly recap push (separate from `/api/recap/weekly` card) |
| PN6 | **Yes** | `played_today` / milestone variants | One item per follower per session; also fires streak/session-count milestone pushes (Phase A) |
| PN7 | **Yes** | `you_are_playing` | Self only |
| PN8 | **Yes** | `gear_setup` | One item **per follower** |
| first_host hook | **Yes** | `first_host` | One item per follower on first session publish (Phase B) |

`notifications_sent` is for push dedup/throttle only — **not** read by `/api/feed`.

---

## Client behaviour (mobile)

| Action | Effect |
|--------|--------|
| Open Circle → Feed tab | `GET /api/feed` → replaces `feedItems` state |
| Pull to refresh | Same — full replace |
| Follow from search/suggestions | Local prepend `just_followed` (temporary id) |
| PN4 tap | Local prepend `new_follower` |
| Unfollow | Resets feed load ref → refetch on next visit |

Feed items are **not** stored in AsyncStorage.

---

## Debugging checklist

When a user reports a missing feed item:

1. **Check `feed_items`** for their `profile_id` and expected `id` pattern.
2. **Check live query** — is the underlying data still in window? (e.g. follow > 5 days, session not today).
3. **For `played_today`** — was PN6 cron running? Check `notifications_sent` for `pn6:{sessionId}:{followeeId}`.
4. **For multi-follower events** — confirm id includes `followerProfileId` (PN6, PN8).
5. **Compare `timestamp` vs `created_at`** — if timestamp is newer than the event, something overwrote it (should not happen on feed-route persist after June 7 fix).
6. **Scraper gap** — roster only refreshes at full scrape slots (6am, 12pm, 3pm, 9pm VN). Late bookings won't appear until next scrape.

### Example queries

```sql
-- All feed items for a user, last 24h
SELECT id, type, player_user_id, timestamp, created_at
FROM feed_items
WHERE profile_id = '<profile_uuid>'
  AND timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- PN6 pushes sent to a user today
SELECT type, sent_at
FROM notifications_sent
WHERE recipient_id = '<profile_uuid>'
  AND type LIKE 'pn6:%'
ORDER BY sent_at DESC;
```

---

## Key files

| Area | Path |
|------|------|
| Feed API (live + merge + persist) | `pickleball-hub/src/app/api/feed/route.ts` |
| PN6 — played_today / played_self / milestone pushes (Phase A) | `pickleball-hub/src/lib/notifications/pn6-session-finished.ts` |
| PN7 — you_are_playing | `pickleball-hub/src/lib/notifications/pn7-you-are-playing.ts` |
| PN8 — gear_setup | `pickleball-hub/src/lib/notifications/pn8-gear-setup.ts` |
| Push cron orchestrator | `pickleball-hub/src/lib/notifications/push-cron.ts` |
| Session time helpers | `pickleball-hub/src/lib/notifications/session-time.ts` |
| Milestone helper (Phase A+) | `pickleball-hub/src/lib/feed-milestones.ts` |
| Club Session PATCH — first_host hook (Phase B) | `pickleball-hub/src/app/api/club-sessions/[id]/route.ts` |
| Weekly recap API (Phase C) | `pickleball-hub/src/app/api/recap/weekly/route.ts` |
| Prisma schema | `pickleball-hub/prisma/schema.prisma` (`FeedItem`) |
| Mobile types | `pickleball-hub/mobile/src/data.ts` |
| Feed row UI | `pickleball-hub/mobile/src/components/FeedItemRow.tsx` |
| Circle screen state | `pickleball-hub/mobile/src/screens/CircleScreen.tsx` |
| Presence (On court / Next 8h) | `pickleball-hub/src/app/api/feed/presence/route.ts` |

---

## Changelog

**Friday July 31, 2026**

*Phase A — Milestone emit fixes (existing types)*
- `streak_milestone` thresholds changed from {4,8,12,26,52} to {3,5,10}; now gated to `played_today` window only; dedup via `preferences.milestone_streak_N`.
- `played_today` annotated with `milestoneKind: "session_count"` + `sessionMilestone: N` when player hits lifetime session count ∈ {10,50,100,200} (once per player); dedup via `preferences.milestone_sessions_N`.
- `dupr_update` annotated with `milestoneKind: "dupr_threshold"` + `milestoneDupr: X` when DUPR crosses 3.0/3.5/4.0/4.5; dedup via `preferences.milestone_dupr_X_Y`.
- PN6 extended to fire streak and session-count milestone pushes at session-end time, before next feed open.
- `src/lib/feed-milestones.ts` created as shared milestone helper.
- Mobile: `MilestoneKind` type added, `FeedItem` extended with optional milestone fields; `FeedItemRow.tsx` updated with gold/blue milestone card chrome, labeled CTAs, week dots.

*Phase B — New feed types*
- `comeback` type added: emitted when a followed player returns after ≥14 days away (priority 3 in `played_today` path). `daysSince` and `clubName` included in payload.
- `first_venue` type added: emitted on a player's first session at a given club (priority 4). Excludes players with ≤1 lifetime session.
- `first_host` type added: emitted per follower when a host's first Club Session is published. Deep-link to session detail. Dedup via `preferences.milestone_first_host`.
- `PATCH /api/club-sessions/[id]` extended with `triggerFirstHost()` hook on `published` transition.
- Mobile: all three types added to `FeedItemType`; `FeedItemRow.tsx` updated with blue/lime/gold card variants.

*Phase C — Weekly recap*
- `GET /api/recap/weekly` added (authenticated). Returns previous Mon–Sun (HCMC UTC+7) stats: sessions, co-players, kudos, clubs, top club, most improved followee.
- Seen flag: `preferences.lastRecapSeenWeek` set on first `show: true` response; subsequent calls same week return `{ show: false }`.
- CircleScreen: fetches recap on initial feed load (once per app session). Renders lime-accented card above feed with "Share my week" → `Share.share()`.
- Card not persisted in `feed_items`; lives only in local React state.

**Sunday June 7, 2026**
- Document created.
- Documented PN6 fix: `played_today` id now includes `followerProfileId`.
- Documented feed-route persist fix: `timestamp` no longer overwritten on update.
- Aligned live-query `played_today` id with PN6 (includes viewer `profileId`).
