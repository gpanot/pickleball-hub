/**
 * GET /api/club-sessions/:id/rr/schedule
 *
 * Returns the calling player's personal round-robin schedule.
 * Only accessible to confirmed participants once the draw has been created.
 *
 * Response is shaped from the player's POV — their own name is omitted ("you"),
 * and each round is annotated with isCurrent / isPast / isBye.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMobileUser } from '@/lib/mobile-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

interface TournamentRow {
  id: string
  status: string
  current_round: number
  total_rounds: number
}

interface ParticipantRow {
  id: string
  player_profile_id: string
  display_name: string
}

interface RoundRow {
  id: string
  round_number: number
}

interface MatchRow {
  id: string
  round_id: string
  court_number: number
  is_bye: boolean
  score_team1: number | null
  score_team2: number | null
}

interface MatchPlayerRow {
  match_id: string
  participant_id: string
  team: number
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch tournament
  const tournaments = await prisma.$queryRaw<TournamentRow[]>(
    Prisma.sql`SELECT id, status, current_round, total_rounds
               FROM rr_tournaments WHERE session_id = ${sessionId}`,
  )
  const tournament = tournaments[0]

  if (!tournament || tournament.status === 'pending') {
    return NextResponse.json({ schedule: null, status: tournament?.status ?? 'none' })
  }

  // Find the caller's participant record
  const participants = await prisma.$queryRaw<ParticipantRow[]>(
    Prisma.sql`SELECT id, player_profile_id, display_name
               FROM rr_participants WHERE tournament_id = ${tournament.id}`,
  )

  const myParticipant = participants.find((p) => p.player_profile_id === user.profileId)
  if (!myParticipant) {
    // Viewer is not a participant (not registered in this RR)
    return NextResponse.json({ schedule: null, status: tournament.status, notParticipant: true })
  }

  // Fetch all rounds and matches
  const [rounds, matches, matchPlayers] = await Promise.all([
    prisma.$queryRaw<RoundRow[]>(
      Prisma.sql`SELECT id, round_number FROM rr_rounds WHERE tournament_id = ${tournament.id}
                 ORDER BY round_number ASC`,
    ),
    prisma.$queryRaw<MatchRow[]>(
      Prisma.sql`SELECT id, round_id, court_number, is_bye, score_team1, score_team2
                 FROM rr_matches WHERE tournament_id = ${tournament.id}`,
    ),
    prisma.$queryRaw<MatchPlayerRow[]>(
      Prisma.sql`SELECT mp.match_id, mp.participant_id, mp.team
                 FROM rr_match_players mp
                 JOIN rr_matches m ON mp.match_id = m.id
                 WHERE m.tournament_id = ${tournament.id}`,
    ),
  ])

  // Build match → players lookup
  const matchPlayerMap = new Map<string, MatchPlayerRow[]>()
  for (const mp of matchPlayers) {
    const list = matchPlayerMap.get(mp.match_id) ?? []
    list.push(mp)
    matchPlayerMap.set(mp.match_id, list)
  }

  // Build round → matches lookup
  const roundMatchMap = new Map<string, MatchRow[]>()
  for (const m of matches) {
    const list = roundMatchMap.get(m.round_id) ?? []
    list.push(m)
    roundMatchMap.set(m.round_id, list)
  }

  // Build participant lookup
  const participantMap = new Map(participants.map((p) => [p.id, p]))

  // Shape the schedule from the caller's perspective
  const schedule = rounds.map((round) => {
    const roundMatches = roundMatchMap.get(round.id) ?? []

    // Find the match(es) this player is in during this round
    const myMatch = roundMatches.find((m) => {
      const players = matchPlayerMap.get(m.id) ?? []
      return players.some((mp) => mp.participant_id === myParticipant.id)
    })

    const isCurrent = round.round_number === tournament.current_round
    const isPast = round.round_number < tournament.current_round

    if (!myMatch) {
      // Player has no match this round → shouldn't happen with correct data
      return null
    }

    if (myMatch.is_bye) {
      return {
        roundNumber: round.round_number,
        isBye: true,
        isCurrent,
        isPast,
        courtNumber: null,
        partner: null,
        opponents: null,
        myScore: null,
        oppScore: null,
      }
    }

    const players = matchPlayerMap.get(myMatch.id) ?? []
    const myTeam = players.find((mp) => mp.participant_id === myParticipant.id)?.team ?? 1
    const partnerEntry = players.find(
      (mp) => mp.team === myTeam && mp.participant_id !== myParticipant.id,
    )
    const opponentEntries = players.filter((mp) => mp.team !== myTeam)

    const partner = partnerEntry
      ? participantMap.get(partnerEntry.participant_id)?.display_name ?? null
      : null

    const opponents = opponentEntries.map(
      (op) => participantMap.get(op.participant_id)?.display_name ?? '?',
    )

    // Scores from the player's team perspective
    const myScore = myTeam === 1 ? myMatch.score_team1 : myMatch.score_team2
    const oppScore = myTeam === 1 ? myMatch.score_team2 : myMatch.score_team1

    return {
      roundNumber: round.round_number,
      isBye: false,
      isCurrent,
      isPast,
      courtNumber: myMatch.court_number,
      partner,
      opponents: opponents.length > 0 ? opponents : null,
      myScore,
      oppScore,
    }
  }).filter(Boolean)

  return NextResponse.json({
    schedule,
    status: tournament.status,
    currentRound: tournament.current_round,
    totalRounds: tournament.total_rounds,
  })
}
