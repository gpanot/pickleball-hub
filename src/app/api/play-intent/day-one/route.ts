import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'
import { sendPushNotification } from '@/lib/notifications'
import { localHourForTimezone, localDayOfWeekForTimezone } from '@/lib/notifications/session-time'

const VALID_WINDOWS = ['today', 'specific_day', 'this_weekend', 'not_sure'] as const
type StoredIntent = (typeof VALID_WINDOWS)[number]

const INTENT_REWARD_CLUB_TOKENS = 75

// ─── Timezone-aware expiry ────────────────────────────────────────────────────
//
// Reads preferences.timezone (IANA string). Falls back to Asia/Ho_Chi_Minh.
// Uses localHourForTimezone / localDayOfWeekForTimezone from session-time.ts —
// the same helpers used by pn-engagement.ts to avoid ICT hardcoding.

function computeExpiresAt(
  intentWindow: StoredIntent,
  resolvedDate: string | null, // 'YYYY-MM-DD', only when intentWindow === 'specific_day'
  tz: string | null | undefined,
): Date {
  const safeTz = tz ?? 'Asia/Ho_Chi_Minh'
  const now = new Date()

  if (intentWindow === 'specific_day' && resolvedDate) {
    // End of the specific picked calendar day, 23:59:59 in player's local tz.
    // Use a midday reference on the target date for DST-correct offset.
    const targetMidday = new Date(`${resolvedDate}T12:00:00Z`)
    return new Date(`${resolvedDate}T23:59:59${tzOffsetString(safeTz, targetMidday)}`)
  }

  if (intentWindow === 'today') {
    // 23:59:59 of today in local tz
    const todayStr = localDateString(safeTz)
    return new Date(`${todayStr}T23:59:59${tzOffsetString(safeTz, now)}`)
  }

  if (intentWindow === 'this_weekend') {
    // Coming Sunday 23:59:59 local. If today IS Sunday, that same Sunday.
    const dow = localDayOfWeekForTimezone(safeTz) // 0=Sun
    const daysUntilSunday = dow === 0 ? 0 : 7 - dow
    const localSundayStr = localDateStringOffsetDays(safeTz, daysUntilSunday)
    const sundayMidday = new Date(`${localSundayStr}T12:00:00Z`)
    return new Date(`${localSundayStr}T23:59:59${tzOffsetString(safeTz, sundayMidday)}`)
  }

  // 'not_sure' — 24h flat
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
}

/** Returns current local date as 'YYYY-MM-DD' for the given IANA timezone. */
function localDateString(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: tz,
    }).formatToParts(new Date())
    const y = parts.find((p) => p.type === 'year')?.value ?? '2000'
    const m = parts.find((p) => p.type === 'month')?.value ?? '01'
    const d = parts.find((p) => p.type === 'day')?.value ?? '01'
    return `${y}-${m}-${d}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Returns local date N days from now as 'YYYY-MM-DD'. */
function localDateStringOffsetDays(tz: string, days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: tz,
    }).formatToParts(d)
    const y = parts.find((p) => p.type === 'year')?.value ?? '2000'
    const mo = parts.find((p) => p.type === 'month')?.value ?? '01'
    const da = parts.find((p) => p.type === 'day')?.value ?? '01'
    return `${y}-${mo}-${da}`
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/**
 * Returns UTC offset string like '+07:00' for a given IANA timezone AT a specific date.
 * Passing the target date (not always `new Date()`) ensures DST-correctness when
 * computing expiry for a specific future date like a day pill or upcoming Sunday.
 */
function tzOffsetString(tz: string, atDate: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    })
    const parts = formatter.formatToParts(atDate)
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+0'
    // Handles 'GMT+7', 'GMT+5:30', 'GMT-8', 'UTC+7', 'GMT' (no offset = UTC)
    const match = tzName.match(/(?:GMT|UTC)([+-]\d+(?::\d+)?)?/)
    if (!match) return '+00:00'
    const raw = match[1] ?? '+0'
    const sign = raw[0] === '-' ? '-' : '+'
    const digits = raw.replace(/^[+-]/, '')
    const [hPart, mPart] = digits.split(':')
    const h = String(Number(hPart ?? '0')).padStart(2, '0')
    const m = String(Number(mPart ?? '0')).padStart(2, '0')
    return `${sign}${h}:${m}`
  } catch {
    return '+00:00'
  }
}

// ─── GET — current active intent state ───────────────────────────────────────

/**
 * GET /api/play-intent/day-one
 * Returns the current player's active intent state for the IntentCard.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: { preferences: true },
  })

  let prefs = (profile?.preferences as Record<string, unknown>) ?? {}
  let intent = (prefs.dayOneIntent as StoredIntent | null) ?? null
  let intentDate = (prefs.dayOneIntentDate as string | null) ?? null
  let expiresAt = (prefs.dayOneIntentExpiresAt as string | null) ?? null
  const now = new Date()

  const isActive = intent !== null && expiresAt !== null && new Date(expiresAt) > now

  // On-read expiry: if expired and fulfillment not yet resolved, silently mark unfulfilled
  // and clear the active fields — no cron job needed.
  if (intent !== null && expiresAt !== null && new Date(expiresAt) <= now && prefs.dayOneIntentFulfilled == null) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { dayOneIntent, dayOneIntentDate, dayOneIntentExpiresAt, ...rest } = prefs
    const updated = { ...rest, dayOneIntentFulfilled: false }
    try {
      await prisma.playerProfile.update({
        where: { id: user.profileId },
        data: { preferences: updated },
      })
    } catch {}
    prefs = updated
    intent = null
    intentDate = null
    expiresAt = null
  }

  // Live aggregate count for IntentCard prompt copy ("7 others are in")
  let aggregateCount = 0
  try {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM player_profiles
      WHERE preferences->>'dayOneIntentExpiresAt' IS NOT NULL
        AND (preferences->>'dayOneIntentExpiresAt')::timestamptz > NOW()
        AND id != ${user.profileId}
        AND onboarding_completed = true
        AND banned = false
        AND suspended = false
    `
    aggregateCount = Number(result[0]?.count ?? 0)
  } catch {}

  return NextResponse.json({ intent, intentDate, expiresAt, isActive: isActive && intent !== null, aggregateCount })
}

// ─── POST — submit or update intent ──────────────────────────────────────────

/**
 * POST /api/play-intent/day-one
 *
 * Body: {
 *   intentWindow: 'today' | 'specific_day' | 'this_weekend' | 'not_sure'
 *   resolvedDate?: 'YYYY-MM-DD'  // required when intentWindow === 'specific_day'
 * }
 *
 * Writes into preferences:
 *   dayOneIntent        — stored window
 *   dayOneIntentDate    — 'YYYY-MM-DD' or null
 *   dayOneIntentExpiresAt — ISO timestamp
 *   dayOneIntentShown   — true
 *   playIntentCount     — incremented each call
 *   playIntentChestClaimed — set true on first reward
 *
 * One-time reward (chest + tokens) only when playIntentChestClaimed is false.
 */
export async function POST(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { intentWindow, resolvedDate } = body as {
    intentWindow?: StoredIntent
    resolvedDate?: string
  }

  if (!intentWindow || !VALID_WINDOWS.includes(intentWindow)) {
    return NextResponse.json({ error: 'Invalid intentWindow' }, { status: 400 })
  }

  if (intentWindow === 'specific_day') {
    if (!resolvedDate || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
      return NextResponse.json({ error: 'resolvedDate required for specific_day (YYYY-MM-DD)' }, { status: 400 })
    }
  }

  // ── 1. Read caller's profile ─────────────────────────────────────────────

  const myProfile = await prisma.playerProfile.findUnique({
    where: { id: user.profileId },
    select: {
      preferences: true,
      reclubUserId: true,
      reclubPlayer: { select: { duprDoubles: true } },
    },
  })

  const myPrefs = (myProfile?.preferences as Record<string, unknown>) ?? {}
  const myDupr = myProfile?.reclubPlayer?.duprDoubles
    ? Number(myProfile.reclubPlayer.duprDoubles)
    : null
  const myVibeTag = (myPrefs.vibeTag as string | null) ?? null
  const tz = (myPrefs.timezone as string | null) ?? null

  // ── 2. Compute expiry ────────────────────────────────────────────────────

  const expiresAt = computeExpiresAt(intentWindow, resolvedDate ?? null, tz)

  // ── 3. Check reward eligibility ──────────────────────────────────────────

  const alreadyRewarded = myPrefs.playIntentChestClaimed === true

  // ── 4. Persist intent ────────────────────────────────────────────────────

  const currentCount = typeof myPrefs.playIntentCount === 'number' ? myPrefs.playIntentCount : 0

  await prisma.playerProfile.update({
    where: { id: user.profileId },
    data: {
      preferences: {
        ...myPrefs,
        dayOneIntent: intentWindow,
        dayOneIntentDate: intentWindow === 'specific_day' ? (resolvedDate ?? null) : null,
        dayOneIntentExpiresAt: expiresAt.toISOString(),
        dayOneIntentShown: true,
        playIntentChestClaimed: true,
        playIntentCount: currentCount + 1,
      },
    },
  })

  // ── 5. One-time reward ───────────────────────────────────────────────────

  let rewardChestId: string | null = null

  if (!alreadyRewarded) {
    const membership = await prisma.squadMember.findFirst({
      where: { profileId: user.profileId, leftAt: null },
      select: { squadId: true },
    })

    if (membership?.squadId) {
      const chestExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const chest = await prisma.squadChest.create({
        data: {
          squadId: membership.squadId,
          earnerId: user.profileId,
          source: 'play_intent',
          expiresAt: chestExpiresAt,
        },
      })
      rewardChestId = chest.id

      const activeMembers = await prisma.squadMember.findMany({
        where: { squadId: membership.squadId, leftAt: null },
        select: { profileId: true },
      })
      await prisma.squadChestOpening.createMany({
        data: activeMembers.map((m) => ({
          chestId: chest.id,
          profileId: m.profileId,
          status: 'pending',
        })),
        skipDuplicates: true,
      })
    }

    await prisma.playerWallet.upsert({
      where: { profileId: user.profileId },
      create: { profileId: user.profileId, clubTokens: INTENT_REWARD_CLUB_TOKENS, brandTokens: 0 },
      update: { clubTokens: { increment: INTENT_REWARD_CLUB_TOKENS } },
    })
    await prisma.tokenLedger.create({
      data: {
        profileId: user.profileId,
        tokenType: 'club',
        delta: INTENT_REWARD_CLUB_TOKENS,
        reason: 'play_intent',
      },
    })

    ;(async () => {
      try {
        await sendPushNotification(user.profileId, {
          title: 'Your chest is ready to open 📦',
          body: `You earned a squad chest + ${INTENT_REWARD_CLUB_TOKENS} tokens for committing to play. Go open it!`,
          data: {
            screen: rewardChestId ? 'ChestDetail' : 'SquadHome',
            ...(rewardChestId ? { chestId: rewardChestId } : {}),
          },
        })
      } catch (e) {
        console.error('[PLAY_INTENT] PNS error:', e)
      }
    })()
  }

  // ── 6. Aggregate count ───────────────────────────────────────────────────

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

  // ── 7. Match query ───────────────────────────────────────────────────────

  let match: {
    displayName: string
    dupr: number | null
    vibeTag: string | null
    intentWindow: StoredIntent
  } | null = null

  if (myVibeTag !== null) {
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

      for (const candidate of candidates) {
        const prefs = (candidate.preferences as Record<string, unknown>) ?? {}
        const theirVibeTag = (prefs.vibeTag as string | null) ?? null
        const theirDupr = candidate.reclub_user_id ? duprMap.get(candidate.reclub_user_id) ?? null : null

        if (theirVibeTag !== myVibeTag) continue
        if (myDupr !== null && theirDupr !== null) {
          if (Math.abs(myDupr - theirDupr) > 0.5) continue
        } else {
          continue
        }

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

  return NextResponse.json({
    aggregateCount,
    match,
    reward: alreadyRewarded ? null : {
      clubTokensAwarded: INTENT_REWARD_CLUB_TOKENS,
      chestId: rewardChestId,
    },
  })
}

// ─── PATCH — log match accept ─────────────────────────────────────────────────

/**
 * PATCH /api/play-intent/day-one
 * Called when the player taps "I'm in too". Logs the match for Discovery Layer seeding.
 * matchedProfileId is optional — in recurring mode there may be no named match.
 */
export async function PATCH(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { matchedProfileId, intentWindow } = body as {
    matchedProfileId?: string
    intentWindow?: string
  }

  if (!intentWindow) {
    return NextResponse.json({ error: 'Missing intentWindow' }, { status: 400 })
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
            matchedProfileId: matchedProfileId ?? null,
            intentWindow,
            timestamp: new Date().toISOString(),
          },
        ].slice(-20),
      },
    },
  })

  return NextResponse.json({ ok: true })
}
