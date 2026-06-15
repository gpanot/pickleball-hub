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
| Daily streak (qualifying day) | +20 | `squad-streak` cron (daily 23:55 HCMC) | Once per qualifying check-in day in rolling window |
| **Streak Chest open (all members)** | **+50 (fixed)** | 4th check-in in rolling 7-day window → chest auto-created | 1 Streak Chest per 7-day window per squad; 4h unlock timer |

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

### Overview

The streak is a **weekly activity window**, not a consecutive-days counter. The squad must accumulate **4 check-in days within a rolling 7-day window**. On completing the 4th check-in, a **Streak Chest** is automatically granted to every squad member.

### Rules

| Rule | Value |
|------|-------|
| Check-ins required | **4** within any rolling 7-day window |
| Window | 7 calendar days (HCMC timezone) |
| Reward trigger | 4th qualifying check-in in the window |
| Reward | **Streak Chest** for every squad member |
| XP awarded on chest open (earner role) | **+50 XP** |
| XP awarded on chest open (contributor role) | **+50 XP** (fixed — all members equal reward) |
| Kudos awarded | +15 per member |
| Chest unlock timer | **4 hours** (same as regular chests) |
| Weekly XP per check-in day (baseline) | **+20 XP** (`source: 'streak'`) |

### How it works — step by step

1. Any squad member checks in at a court (manual or scraper) → counts as 1 check-in day for the squad.
2. Nightly cron (`squad-streak`, 23:55 HCMC) counts distinct check-in days in the last 7 days.
3. On each qualifying day the squad earns **+20 XP** (`source: 'streak'`).
4. When the rolling count reaches **4**, the cron automatically:
   - Creates a `squad_chests` row with `source: 'streak_chest'`.
   - Creates a `squad_chest_openings` row for every active member (`status: 'pending'`).
   - Logs a `streak_milestone:week` feed event (visible to all members).
   - Resets the rolling window counter (the squad can earn one Streak Chest per 7-day window).
5. Members tap → 4h unlock → open → **+50 XP + 15 kudos** each.

### Rewards breakdown

| Reward | Amount | Notes |
|--------|--------|-------|
| XP per check-in day | +20 | Awarded nightly, up to 4×/week = +80 XP max baseline |
| Streak Chest XP (all members) | +50 | Fixed (not randomized — equal reward for teamwork) |
| Streak Chest kudos (all members) | +15 | Fixed |
| Streak Chest total squad value (8 members) | +400 XP + 120 kudos | If all 8 open |

### Reset behavior

- The 7-day window rolls forward daily. There is no "lose your streak" mechanic — if the squad misses days, they simply haven't hit 4 yet.
- Once the Streak Chest fires, the window resets and the squad starts counting toward the next chest.
- Maximum **1 Streak Chest per rolling 7-day window** per squad.

### UI

`SquadStreakTracker` shows:
- A **4-node day track** (DAY 1 → DAY 2 → DAY 3 → DAY 4 → CHEST icon) replacing the old 7-day pill row.
- Completed nodes show a green checkmark; the next target node pulses gold.
- A **progress bar** fills proportionally (0–4 check-ins).
- When complete: banner text "Streak complete — chest unlocked for everyone!" + gold "+50 XP each" pill.
- The chest node shows the chest image, dimmed until unlocked.

### Feed events

| Event key | When | Display |
|-----------|------|---------|
| `streak` | Nightly, when a check-in day qualifies | "+20 XP — squad kept the streak alive" |
| `streak_milestone:week` | When 4th check-in fires | "🔥 Streak chest unlocked! Tap to claim your reward" (push + feed) |

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
| 2026-06-15 | Streak system redesigned: 4 check-ins in 7 days → Streak Chest for all members (+50 XP +15 kudos each, fixed). Old consecutive-day streak replaced by rolling-window model. `SquadStreakTracker` UI updated to 4-node day track with chest reward node. |
| 2026-06-13 | Squad creation (`POST /api/squads`) now awards +40 XP to the founder |
| 2026-06-13 | Production backfill: awarded +40 XP to all 4 existing members across 3 squads (Googo 80, Eagle 40, 3up 40) |
| 2026-06-13 | Randomized chest XP: earner 30–80, contributor 10–30 (was fixed 80/50) |
| 2026-06-13 | New member XP (+40) — one-time only, prevents rejoin farming |
| 2026-06-13 | Daily streak XP (+20/day) via cron — was display-only before |
| 2026-06-13 | Streak milestones stored as `streak_milestone:N` for correct feed display |
| 2026-06-13 | Initial XP system with check-in (60), scraper (80), chest open (fixed 80/50), new member (40) |
