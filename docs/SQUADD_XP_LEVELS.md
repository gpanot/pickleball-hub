# Squadd XP & Levels System

**Last updated:** 2026-06-13

---

## XP Sources

| Source | XP Amount | Trigger | Anti-cheat |
|--------|-----------|---------|------------|
| Manual check-in | +60 | `POST /api/squads/checkin` | 1 chest/player/day (HCMC calendar day) + 1h rate limit |
| Scraper session (Reclub confirmed) | +80 | `squad_chests.py` → `POST /api/squads/:id/award-xp` | 1 chest/player/day — skips if manual check-in already created one |
| Earner opens chest | +30 to +80 (random) | `POST /api/squads/chests/:id/open` | 4h unlock timer after tap |
| Contributor opens chest | +10 to +30 (random) | `POST /api/squads/chests/:id/open` | 4h unlock timer after tap |
| New member joins | +40 | `join-by-code` or `invite/accept` | **One-time only per player lifetime** — checked via `squad_xp_log` |
| Daily streak | +20 | `squad-streak` cron (daily 23:55 HCMC) | Streak increments only once/day |

### Hybrid check-in model

Check-in is **hybrid** — both manual and scraper paths exist:

- **Manual** (`POST /api/squads/checkin`): player taps check-in in the app → +60 XP + chest created.
- **Scraper** (`squad_chests.py`): Reclub roster data → chest created + +80 XP bonus via internal endpoint.
- **Shared daily cap**: only one chest per player per HCMC calendar day. If manual already created a chest today, the scraper skips entirely (no duplicate chest, no +80 bonus). If scraper fires first, manual check-in would be blocked by the same cap.
- **Design intent**: manual is the primary path (works without Reclub). Scraper is an additive bonus for Reclub users who don't manually check in that day.

### Anti-cheat: new member rejoin protection

A player only receives +40 XP **once in their lifetime**, regardless of how many squads they join or leave. This is enforced by checking `squad_xp_log` for any existing `new_member` entry for that `profileId` before awarding.

### Anti-cheat: chest open randomization

Chest XP is randomized to prevent predictable XP farming:
- **Earner** (player who checked in / played): random integer between 30–80 XP
- **Contributor** (squad member who didn't earn the chest): random integer between 10–30 XP
- Kudos are fixed: earner +12, contributor +8

---

## Level Thresholds

| Level | Total XP Required | XP to Reach from Previous |
|-------|-------------------|---------------------------|
| 1 | 0 | — |
| 2 | 300 | 300 |
| 3 | 700 | 400 |
| 4 | 1,400 | 700 |
| 5 | 2,500 | 1,100 |
| 6 | 4,000 | 1,500 |
| 7 | 6,000 | 2,000 |
| 8 | 8,500 | 2,500 |
| 9 | 11,500 | 3,000 |
| 10 | 15,000 | 3,500 |
| 11+ | +4,000 per level | 4,000 |

Defined in `src/lib/squad-xp.ts` → `LEVEL_THRESHOLDS`.

### Level calculation

```
getLevelFromXp(xp):
  walk LEVEL_THRESHOLDS array → level = highest index where xp >= threshold
  for level 10+: keep adding 4000 per level until xp < next threshold
```

### Progress bar

```
getXpForNextLevel(currentXp):
  returns { current: xpWithinLevel, threshold: xpNeededForNextLevel, progress: 0–1 }
```

Duplicated on mobile in `SquadIdentityBar.tsx` for offline rendering.

---

## Streak System

- **Source**: nightly cron `squad-streak` (23:55 HCMC time)
- **Logic**: if any squad member created a chest today (any source), streak increments by 1 and awards **+20 squad XP** (`source: 'streak'`).
- **Reset**: if no chest was created today and the last streak update was before yesterday, streak resets to 0.
- **Milestones**: at 3, 7, 14, 30 days → feed-only event logged as `streak_milestone:N` (0 XP, display only).
- **UI**: `SquadStreakTracker` shows 7-day pill row with `+20 XP/day` badge.

---

## DB Tables

| Table | Purpose |
|-------|---------|
| `squads` | `total_xp` (cumulative), `level` (derived), `streak_days`, `streak_last_updated` |
| `squad_xp_log` | Every XP award: `squad_id`, `profile_id`, `source`, `xp_amount`, `created_at` |
| `squad_chests` | Chest per check-in/scraper. `checkin_date` enforces daily cap. |
| `squad_chest_openings` | Per-member open state: pending → unlocking → ready → opened. Stores `xp_awarded`, `kudos_awarded`. |

---

## Key Files

| File | What it does |
|------|-------------|
| `src/lib/squad-xp.ts` | Core XP logic: thresholds, levels, `awardSquadXp()`, `rollChestXp()`, `hasReceivedNewMemberXp()` |
| `src/app/api/squads/checkin/route.ts` | Manual check-in → chest + 60 XP |
| `src/app/api/squads/chests/[chestId]/open/route.ts` | Chest open → random 30–80 (earner) or 10–30 (contributor) |
| `src/app/api/squads/join-by-code/route.ts` | Join by code → +40 XP (first time only) |
| `src/app/api/squads/[id]/invite/[inviteId]/accept/route.ts` | Accept invite → +40 XP (first time only) |
| `src/app/api/squads/[id]/award-xp/route.ts` | Internal endpoint for scraper → +80 XP |
| `src/app/api/cron/squad-streak/route.ts` | Nightly cron → streak increment + 20 XP |
| `scraper/squad_chests.py` | Reclub scraper hook → chest creation + award-xp call |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-06-13 | Squad creation (`POST /api/squads`) now awards +40 XP to the founder |
| 2026-06-13 | Production backfill: awarded +40 XP to all 4 existing members across 3 squads (Googo 80, Eagle 40, 3up 40) |
| 2026-06-13 | Randomized chest XP: earner 30–80, contributor 10–30 (was fixed 80/50) |
| 2026-06-13 | New member XP (+40) — one-time only, prevents rejoin farming |
| 2026-06-13 | Daily streak XP (+20/day) via cron — was display-only before |
| 2026-06-13 | Streak milestones stored as `streak_milestone:N` for correct feed display |
| 2026-06-13 | Initial XP system with check-in (60), scraper (80), chest open (fixed 80/50), new member (40) |
