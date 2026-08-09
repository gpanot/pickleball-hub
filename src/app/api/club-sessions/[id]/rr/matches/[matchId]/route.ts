/**
 * PATCH /api/club-sessions/:id/rr/matches/:matchId
 *
 * Manager-only: submit or update the score for a match.
 * Scores are not auto-accepted for bye matches.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMobileUser } from '@/lib/mobile-auth'
import { isClubManager } from '@/lib/club-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> },
) {
  const { id: sessionId, matchId } = await params
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await prisma.clubSession.findUnique({
    where: { id: sessionId },
    select: { appClubId: true },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const isManager = await isClubManager(session.appClubId, user.profileId)
  if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Verify match belongs to this session's tournament
  const matches = await prisma.$queryRaw<
    { id: string; is_bye: boolean; tournament_id: string }[]
  >(
    Prisma.sql`SELECT m.id, m.is_bye, m.tournament_id
               FROM rr_matches m
               JOIN rr_tournaments t ON m.tournament_id = t.id
               WHERE m.id = ${matchId} AND t.session_id = ${sessionId}`,
  )
  const match = matches[0]
  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  if (match.is_bye) {
    return NextResponse.json({ error: 'Cannot score a bye match' }, { status: 400 })
  }

  let body: { scoreTeam1?: number; scoreTeam2?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { scoreTeam1, scoreTeam2 } = body
  if (
    typeof scoreTeam1 !== 'number' || scoreTeam1 < 0 ||
    typeof scoreTeam2 !== 'number' || scoreTeam2 < 0
  ) {
    return NextResponse.json(
      { error: 'scoreTeam1 and scoreTeam2 must be non-negative numbers' },
      { status: 400 },
    )
  }

  await prisma.$executeRaw(
    Prisma.sql`UPDATE rr_matches
               SET score_team1 = ${scoreTeam1}, score_team2 = ${scoreTeam2}, updated_at = NOW()
               WHERE id = ${matchId}`,
  )

  return NextResponse.json({ ok: true, matchId, scoreTeam1, scoreTeam2 })
}
