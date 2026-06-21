import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

const VALID_WINDOWS = ['today', 'in_next_few_days', 'today_after_work', 'this_weekend', 'not_sure'] as const
type IntentWindow = (typeof VALID_WINDOWS)[number]

/**
 * POST /api/play-intent/day-one
 *
 * Day-One Intent modal backend. Open to all authenticated players (no gender gate).
 *
 * Body: { intentWindow: 'today_after_work' | 'this_weekend' | 'not_sure' }
 *
 * Writes:
 *   preferences.dayOneIntent      = intentWindow
 *   preferences.dayOneIntentShown = true
 *
 * Returns:
 *   { aggregateCount: number, match: MatchResult | null }
 *
 * Match quality bar (all three required for a named suggestion):
 *   1. Same intentWindow
 *   2. DUPR within ±0.5 of the requesting player (duprDoubles on Player table)
 *   3. At least one shared vibeTag in preferences
 *
 * Honesty rules:
 *   - aggregateCount is always a real DB count
 *   - match is null if the quality bar is not met
 *   - No fabricated names, times, or distances
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { intentWindow } = body as { intentWindow?: IntentWindow }

  if (!intentWindow || !VALID_WINDOWS.includes(intentWindow)) {
    return NextResponse.json({ error: 'Invalid intentWindow' }, { status: 400 })
  }

  // ── 1. Read caller's profile + DUPR + vibeTag ───────────────────────────

  const myProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: {
      preferences: true,
      reclubUserId: true,
      reclubPlayer: {
        select: { duprDoubles: true },
      },
    },
  })

  const myPrefs = (myProfile?.preferences as Record<string, unknown>) ?? {}
  const myDupr = myProfile?.reclubPlayer?.duprDoubles
    ? Number(myProfile.reclubPlayer.duprDoubles)
    : null
  const myVibeTag = (myPrefs.vibeTag as string | null) ?? null

  // ── 2. Persist intent + mark modal as shown ─────────────────────────────

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: {
      preferences: {
        ...myPrefs,
        dayOneIntent: intentWindow,
        dayOneIntentShown: true,
      },
    },
  })

  // ── 3. Aggregate count ──────────────────────────────────────────────────

  const aggregateResult = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count
    FROM player_profiles
    WHERE preferences->>'dayOneIntent' = ${intentWindow}
      AND id != ${user.profileId}
      AND onboarding_completed = true
      AND banned = false
      AND suspended = false
  `
  const aggregateCount = Number(aggregateResult[0]?.count ?? 0)

  // ── 4. Match query ──────────────────────────────────────────────────────
  // Only run the match query if we have enough data to enforce the full bar.
  // Missing DUPR or vibeTag on either side → no named match (graceful degrade).

  let match: {
    displayName: string
    dupr: number | null
    vibeTag: string | null
    intentWindow: IntentWindow
  } | null = null

  if (myVibeTag !== null) {
    // Find candidates: same intentWindow, not the caller, not banned/suspended
    const candidates = await prisma.$queryRaw<
      { id: string; display_name: string | null; preferences: unknown; reclub_user_id: bigint | null }[]
    >`
      SELECT pp.id, pp.display_name, pp.preferences, pp.reclub_user_id
      FROM player_profiles pp
      WHERE pp.preferences->>'dayOneIntent' = ${intentWindow}
        AND pp.id != ${user.profileId}
        AND pp.onboarding_completed = true
        AND pp.banned = false
        AND pp.suspended = false
      LIMIT 50
    `

    if (candidates.length > 0) {
      // Fetch DUPR for candidates that have a reclub_user_id
      const reclubIds = candidates
        .map((c) => c.reclub_user_id)
        .filter((id): id is bigint => id !== null)

      const duprMap = new Map<bigint, number>()
      if (reclubIds.length > 0) {
        const players = await prisma.player.findMany({
          where: { userId: { in: reclubIds } },
          select: { userId: true, duprDoubles: true },
        })
        for (const p of players) {
          if (p.duprDoubles !== null) duprMap.set(p.userId, Number(p.duprDoubles))
        }
      }

      // Apply quality bar: DUPR within ±0.5 AND shared vibeTag
      for (const candidate of candidates) {
        const prefs = (candidate.preferences as Record<string, unknown>) ?? {}
        const theirVibeTag = (prefs.vibeTag as string | null) ?? null
        const theirDupr = candidate.reclub_user_id ? duprMap.get(candidate.reclub_user_id) ?? null : null

        // Condition 1: at least one shared vibeTag
        if (theirVibeTag !== myVibeTag) continue

        // Condition 2: DUPR within ±0.5 — if either side is missing DUPR, skip match
        if (myDupr !== null && theirDupr !== null) {
          if (Math.abs(myDupr - theirDupr) > 0.5) continue
        } else {
          // One or both sides have no DUPR — cannot confirm skill match, degrade
          continue
        }

        // Quality bar passed — use this candidate
        match = {
          displayName: candidate.display_name ?? 'Player',
          dupr: theirDupr,
          vibeTag: theirVibeTag,
          intentWindow,
        }
        break
      }
    }
  }

  return NextResponse.json({ aggregateCount, match })
}

/**
 * POST /api/play-intent/day-one/accept
 * Called when the player taps "I'm in too". Logs the match for Discovery Layer seeding.
 */
export async function PATCH(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { matchedProfileId, intentWindow } = body as {
    matchedProfileId?: string
    intentWindow?: string
  }

  if (!matchedProfileId || !intentWindow) {
    return NextResponse.json({ error: 'Missing matchedProfileId or intentWindow' }, { status: 400 })
  }

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  })

  const prefs = (profile?.preferences as Record<string, unknown>) ?? {}
  const existingLog = Array.isArray(prefs.intentMatchLog) ? prefs.intentMatchLog : []

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: {
      preferences: {
        ...prefs,
        intentMatchLog: [
          ...existingLog,
          {
            matchedProfileId,
            intentWindow,
            timestamp: new Date().toISOString(),
          },
        ].slice(-20), // keep last 20 for Discovery Layer
      },
    },
  })

  return NextResponse.json({ ok: true })
}
