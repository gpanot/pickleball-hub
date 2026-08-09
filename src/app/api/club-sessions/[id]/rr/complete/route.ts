/**
 * POST /api/club-sessions/:id/rr/complete
 *
 * Manager-only explicit "Finish Event" action.
 * - Transitions tournament to status: complete.
 * - Atomically inserts feed items for all followers of all participants.
 *
 * Completion requires an explicit host action — never inferred from scores.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMobileUser } from '@/lib/mobile-auth'
import { isClubManager } from '@/lib/club-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { computeStandings, type ScoredMatch } from '@/lib/club-sessions/round-robin'
import { reclubAvatarUrl } from '@/lib/utils'

interface TournamentRow {
  id: string
  status: string
  total_rounds: number
}

interface ParticipantRow {
  id: string
  player_profile_id: string
  display_name: string
}

interface MatchRow {
  id: string
  is_bye: boolean
  score_team1: number | null
  score_team2: number | null
}

interface MatchPlayerRow {
  match_id: string
  participant_id: string
  team: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify session
  const session = await prisma.clubSession.findUnique({
    where: { id: sessionId },
    select: {
      appClubId: true,
      hostId: true,
      name: true,
      lifecycleState: true,
      appClub: { select: { name: true } },
      venue: { select: { name: true } },
    },
  })
  if (!session || session.lifecycleState === 'deleted') {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const managerCheck = await isClubManager(session.appClubId, user.profileId)
  if (!managerCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch tournament
  const tournaments = await prisma.$queryRaw<TournamentRow[]>(
    Prisma.sql`SELECT id, status, total_rounds FROM rr_tournaments WHERE session_id = ${sessionId}`,
  )
  const tournament = tournaments[0]
  if (!tournament) {
    return NextResponse.json({ error: 'No tournament found for this session' }, { status: 404 })
  }
  if (tournament.status === 'complete') {
    return NextResponse.json({ error: 'Tournament is already complete' }, { status: 409 })
  }

  // Fetch participants, matches, match players for standings computation
  const [participants, matches, matchPlayers] = await Promise.all([
    prisma.$queryRaw<ParticipantRow[]>(
      Prisma.sql`SELECT id, player_profile_id, display_name FROM rr_participants WHERE tournament_id = ${tournament.id}`,
    ),
    prisma.$queryRaw<MatchRow[]>(
      Prisma.sql`SELECT id, is_bye, score_team1, score_team2 FROM rr_matches WHERE tournament_id = ${tournament.id}`,
    ),
    prisma.$queryRaw<MatchPlayerRow[]>(
      Prisma.sql`SELECT mp.match_id, mp.participant_id, mp.team
                 FROM rr_match_players mp
                 JOIN rr_matches m ON mp.match_id = m.id
                 WHERE m.tournament_id = ${tournament.id}`,
    ),
  ])

  // Compute final standings
  const matchPlayerMap = new Map<string, MatchPlayerRow[]>()
  for (const mp of matchPlayers) {
    const list = matchPlayerMap.get(mp.match_id) ?? []
    list.push(mp)
    matchPlayerMap.set(mp.match_id, list)
  }

  const scoredMatches: ScoredMatch[] = matches.map((m) => {
    const players = matchPlayerMap.get(m.id) ?? []
    return {
      matchId: m.id,
      scoreTeam1: m.score_team1,
      scoreTeam2: m.score_team2,
      isBye: m.is_bye,
      team1Participants: players.filter((p) => p.team === 1).map((p) => p.participant_id),
      team2Participants: players.filter((p) => p.team === 2).map((p) => p.participant_id),
    }
  })

  const standings = computeStandings(
    participants.map((p) => ({ participantId: p.id, displayName: p.display_name })),
    scoredMatches,
  )

  const topPlayers = standings.slice(0, 3).map((s) => ({
    displayName: s.displayName,
    wins: s.wins,
    rank: s.rank,
  }))

  // ── ATOMIC: mark tournament complete + insert feed items ──────────────────
  // Mark complete first — if feed insertion fails, it's fire-and-forget (not blocking)
  await prisma.$executeRaw(
    Prisma.sql`UPDATE rr_tournaments SET status = 'complete', updated_at = NOW() WHERE id = ${tournament.id}`,
  )

  // ── Feed fan-out (fire-and-forget, mirrors first_host pattern) ────────────
  void emitFeedItems({
    sessionId,
    hostId: session.hostId,
    tournament,
    session: {
      name: session.name,
      clubName: session.appClub?.name ?? 'Club',
      venueName: session.venue?.name ?? session.appClub?.name ?? 'venue',
    },
    participants,
    playerCount: participants.length,
    roundCount: tournament.total_rounds,
    topPlayers,
  }).catch((err) => {
    console.error('[rr/complete] feed fan-out failed:', err)
  })

  return NextResponse.json({
    ok: true,
    tournamentId: tournament.id,
    status: 'complete',
    standings,
    topPlayers,
  })
}

// ── Feed emission helper ───────────────────────────────────────────────────────

async function emitFeedItems(opts: {
  sessionId: string
  hostId: string
  tournament: TournamentRow
  session: { name: string; clubName: string; venueName: string }
  participants: ParticipantRow[]
  playerCount: number
  roundCount: number
  topPlayers: { displayName: string; wins: number; rank: number }[]
}) {
  const { sessionId, hostId, session, participants, playerCount, roundCount, topPlayers } = opts

  // Get host's PlayerProfile to find their Reclub Player record
  const hostProfile = await prisma.playerProfile.findUnique({
    where: { id: hostId },
    select: { id: true, reclubUserId: true, displayName: true },
  })

  const hostReclubUserId = hostProfile?.reclubUserId

  // Collect all reclubUserIds of participants
  const participantProfiles = await prisma.playerProfile.findMany({
    where: { id: { in: participants.map((p) => p.player_profile_id) } },
    select: { id: true, reclubUserId: true },
  })

  const participantReclubIds = participantProfiles
    .filter((p) => p.reclubUserId !== null)
    .map((p) => p.reclubUserId!)

  if (participantReclubIds.length === 0) return

  // Get followers of all participants (deduplicated)
  const follows = await prisma.follow.findMany({
    where: { followeeId: { in: participantReclubIds } },
    select: {
      follower: { select: { id: true } },
      followeeId: true,
    },
    distinct: ['followerId'],
  })

  if (follows.length === 0) return

  // Get host player info for the card
  let hostPlayerRecord: {
    userId: bigint
    displayName: string | null
    imageUrl: string | null
    duprDoubles: unknown
  } | null = null

  if (hostReclubUserId) {
    hostPlayerRecord = await prisma.player.findUnique({
      where: { userId: hostReclubUserId },
      select: { userId: true, displayName: true, imageUrl: true, duprDoubles: true },
    })
  }

  const timestamp = new Date().toISOString()
  const actorUserId = hostReclubUserId?.toString() ?? participantReclubIds[0].toString()
  const actorName = hostPlayerRecord?.displayName ?? session.clubName
  const actorImageUrl = hostPlayerRecord?.imageUrl
    ?? (hostReclubUserId ? reclubAvatarUrl(hostReclubUserId) : null)

  // Insert one feed item per unique follower
  for (const { follower } of follows) {
    const feedItemId = `rr_complete_${sessionId}_${follower.id}`

    const payload = {
      id: feedItemId,
      type: 'round_robin_complete',
      player: {
        userId: actorUserId,
        displayName: actorName,
        imageUrl: actorImageUrl,
        duprDoubles: hostPlayerRecord?.duprDoubles
          ? Number(hostPlayerRecord.duprDoubles)
          : null,
      },
      isFollowing: true,
      timestamp,
      venueName: session.venueName,
      clubName: session.clubName,
      clubSessionId: sessionId,
      playerCount,
      roundCount,
      topPlayers,
      kudos: { fistbump: 0, flame: 0, star: 0, myReactions: [] },
    }

    await prisma.feedItem.upsert({
      where: { id: feedItemId },
      create: {
        id: feedItemId,
        profileId: follower.id,
        type: 'round_robin_complete',
        playerUserId: actorUserId,
        payload,
        timestamp: new Date(timestamp),
      },
      update: {},
    })
  }
}
