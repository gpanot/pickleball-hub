/**
 * Shared milestone utilities for the Circle feed.
 * Used by /api/feed (card emit) and pn6-session-finished (push notifications).
 */
import { prisma } from "@/lib/db";

// ── Threshold constants ────────────────────────────────────────────────────

export const STREAK_MILESTONES = [3, 5, 10] as const;
export const SESSION_MILESTONES = [10, 50, 100, 200] as const;
export const PAIR_MILESTONES = [10, 25, 50] as const;

// ── Preference key helpers ─────────────────────────────────────────────────

export function streakMilestoneKey(n: number): string {
  return `milestone_streak_${n}`;
}

export function sessionMilestoneKey(n: number): string {
  return `milestone_sessions_${n}`;
}

/** Key for storing the last DUPR value that triggered a dupr_improvement card. */
export const DUPR_IMPROVEMENT_LAST_KEY = "milestone_dupr_improvement_last";

export function pairFirstKey(otherUserId: string): string {
  return `milestone_pair_first_${otherUserId}`;
}

export function pairMilestoneKey(n: number, otherUserId: string): string {
  return `milestone_pair_${n}_${otherUserId}`;
}

export function venueRegularKey(venueId: number): string {
  return `milestone_venue_regular_${venueId}`;
}

export const EARLY_ADOPTER_KEY = "milestone_early_adopter";

// ── Threshold detectors ────────────────────────────────────────────────────

/**
 * DUPR improvement delta detector.
 * Returns `newVal - lastFiredVal` if it is >= 0.10, otherwise null.
 * `lastFiredVal` is the DUPR value stored in preferences when the last card fired,
 * defaulting to `oldVal` on first run.
 */
export function getDuprImprovementDelta(
  oldVal: number,
  newVal: number,
  lastFiredVal: number | null = null
): number | null {
  const base = lastFiredVal ?? oldVal;
  const delta = newVal - base;
  if (delta >= 0.1) return Math.round(delta * 100) / 100;
  return null;
}

/** Returns the matching session milestone threshold, or null. */
export function getSessionMilestoneReached(count: number): number | null {
  return (SESSION_MILESTONES as readonly number[]).includes(count) ? count : null;
}

// ── ISO week key (shared with feed route) ─────────────────────────────────

export function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getFullYear()}-${weekNum}`;
}

// ── Player profile preference helpers ─────────────────────────────────────

/**
 * Batch-fetch PlayerProfile preferences for a list of Reclub user IDs.
 * Returns map of reclubUserId.toString() → preferences object.
 */
export async function getBatchPlayerPrefs(
  reclubUserIds: bigint[]
): Promise<Map<string, Record<string, unknown>>> {
  if (reclubUserIds.length === 0) return new Map();
  const profiles = await prisma.playerProfile.findMany({
    where: { reclubUserId: { in: reclubUserIds } },
    select: { reclubUserId: true, preferences: true },
  });
  const map = new Map<string, Record<string, unknown>>();
  for (const p of profiles) {
    if (p.reclubUserId) {
      map.set(
        p.reclubUserId.toString(),
        (p.preferences ?? {}) as Record<string, unknown>
      );
    }
  }
  return map;
}

/**
 * Set a single milestone flag (boolean or numeric value) on a PlayerProfile's preferences JSON.
 * Safe to fire-and-forget — errors are caught internally.
 */
export async function setMilestoneFlag(
  reclubUserId: bigint,
  key: string,
  value: unknown = true
): Promise<void> {
  try {
    const profile = await prisma.playerProfile.findUnique({
      where: { reclubUserId },
      select: { id: true, preferences: true },
    });
    if (!profile) return;
    const prefs = (profile.preferences ?? {}) as Record<string, unknown>;
    await prisma.playerProfile.update({
      where: { id: profile.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { preferences: { ...prefs, [key]: value } as any },
    });
  } catch (err) {
    console.error("[feed-milestones] setMilestoneFlag failed:", key, err);
  }
}

// ── Lifetime session count ─────────────────────────────────────────────────

/** Total sessions played by a player across all time. */
export async function getLifetimeSessionCount(
  reclubUserId: bigint
): Promise<number> {
  return prisma.sessionRoster.count({ where: { userId: reclubUserId } });
}

/**
 * Batch lifetime session counts for multiple players.
 * Returns map of userId.toString() → count.
 */
export async function getBatchLifetimeSessionCounts(
  reclubUserIds: bigint[]
): Promise<Map<string, number>> {
  if (reclubUserIds.length === 0) return new Map();
  const rows = await prisma.sessionRoster.groupBy({
    by: ["userId"],
    where: { userId: { in: reclubUserIds } },
    _count: { userId: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.userId.toString(), r._count.userId);
  }
  return map;
}

// ── Weekly streak computation ──────────────────────────────────────────────

/**
 * Compute the weekly play streak for a single player.
 * Uses the same ISO-week algorithm as the feed route.
 * `todayStr` must be "YYYY-MM-DD" in Vietnam time.
 */
export async function computePlayerStreak(
  reclubUserId: bigint,
  todayStr: string
): Promise<{ streak: number; weeklyPlayed: boolean[] }> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rosters = await prisma.sessionRoster.findMany({
    where: {
      userId: reclubUserId,
      session: { scrapedDate: { gte: cutoffStr, lte: todayStr } },
    },
    select: { session: { select: { scrapedDate: true } } },
  });

  const weeksWithSessions = new Set(
    rosters.map((r) =>
      getWeekKey(new Date(`${r.session.scrapedDate}T12:00:00`))
    )
  );

  const now = new Date();
  let streak = 0;
  let missedWeeks = 0;
  const weeklyPlayed: boolean[] = [];

  for (let i = 0; i < 12; i++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() - i * 7);
    const played = weeksWithSessions.has(getWeekKey(checkDate));
    if (i < 6) weeklyPlayed.push(played);
    if (played) {
      streak++;
      missedWeeks = 0;
    } else {
      missedWeeks++;
      if (i > 0 && missedWeeks > 1) break;
    }
  }

  return { streak, weeklyPlayed: weeklyPlayed.reverse() };
}
