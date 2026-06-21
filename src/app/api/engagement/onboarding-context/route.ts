import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getMobileUser } from '@/lib/mobile-auth'

const VALID_PLAY_WINDOWS = ['mornings', 'after_work', 'weekends', 'varies'] as const
type PlayWindow = (typeof VALID_PLAY_WINDOWS)[number]

/**
 * GET /api/engagement/onboarding-context?playWindow=after_work
 *
 * Returns the real count of players who answered the same play-window choice
 * during onboarding. Used for the Q2 aggregate payoff line in EngagementQuestionsStep.
 *
 * Only returns a count — never names or identifiers — so it's safe to call before
 * any consent exchange.
 *
 * Returns { count: number | null }. count is null if the query is unavailable;
 * the mobile client must suppress the feedback line on null.
 */
export async function GET(req: NextRequest) {
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playWindow = req.nextUrl.searchParams.get('playWindow') as PlayWindow | null
  if (!playWindow || !VALID_PLAY_WINDOWS.includes(playWindow)) {
    return NextResponse.json({ error: 'Invalid playWindow' }, { status: 400 })
  }

  // Count profiles that have this playWindow value in their preferences JSON.
  // We use a raw WHERE clause because Prisma doesn't support JSON path filtering
  // portably; this falls back to a JSON cast approach that works on PostgreSQL.
  try {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count
      FROM player_profiles
      WHERE preferences->>'playWindow' = ${playWindow}
        AND onboarding_completed = true
        AND banned = false
        AND suspended = false
    `
    const count = Number(result[0]?.count ?? 0)
    return NextResponse.json({ count })
  } catch {
    // If the query fails (e.g. DB migration not yet applied), return null so
    // the client suppresses the feedback line gracefully.
    return NextResponse.json({ count: null })
  }
}
