/**
 * Round Robin host APIs — GET (full tournament state) + POST (generate draw).
 *
 * GET  /api/club-sessions/:id/rr  → any authenticated user (state inspection)
 * POST /api/club-sessions/:id/rr  → manager only (generate draw)
 *
 * All DB access uses raw SQL (prisma.$queryRaw / $executeRaw) because the
 * rr_* tables are not modelled in schema.prisma per the project migration policy.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getMobileUser } from '@/lib/mobile-auth'
import { isClubManager } from '@/lib/club-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  generateRounds,
  computeStandings,
  defaultNumRounds,
  type ScoredMatch,
} from '@/lib/club-sessions/round-robin'

// ── Shared DB row types ────────────────────────────────────────────────────────

interface TournamentRow {
  id: string
  session_id: string
  status: string
  current_round: number
  total_rounds: number
  created_at: Date
  updated_at: Date
}

interface ParticipantRow {
  id: string
  tournament_id: string
  player_profile_id: string
  display_name: string
}

interface RoundRow {
  id: string
  tournament_id: string
  round_number: number
}

interface MatchRow {
  id: string
  round_id: string
  tournament_id: string
  court_number: number
  is_bye: boolean
  score_team1: number | null
  score_team2: number | null
}

interface MatchPlayerRow {
  id: string
  match_id: string
  participant_id: string
  team: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function loadFullTournamentState(tournamentId: string) {
  const [participants, rounds, matches, matchPlayers] = await Promise.all([
    prisma.$queryRaw<ParticipantRow[]>(
      Prisma.sql`SELECT id, tournament_id, player_profile_id, display_name
                 FROM rr_participants WHERE tournament_id = ${tournamentId}
                 ORDER BY created_at ASC`,
    ),
    prisma.$queryRaw<RoundRow[]>(
      Prisma.sql`SELECT id, tournament_id, round_number
                 FROM rr_rounds WHERE tournament_id = ${tournamentId}
                 ORDER BY round_number ASC`,
    ),
    prisma.$queryRaw<MatchRow[]>(
      Prisma.sql`SELECT id, round_id, tournament_id, court_number, is_bye, score_team1, score_team2
                 FROM rr_matches WHERE tournament_id = ${tournamentId}
                 ORDER BY court_number ASC`,
    ),
    prisma.$queryRaw<MatchPlayerRow[]>(
      Prisma.sql`SELECT mp.id, mp.match_id, mp.participant_id, mp.team
                 FROM rr_match_players mp
                 JOIN rr_matches m ON mp.match_id = m.id
                 WHERE m.tournament_id = ${tournamentId}`,
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

  // Build scored matches for standings computation
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

  // Shape rounds with their matches for the response
  const roundsWithMatches = rounds.map((r) => ({
    id: r.id,
    roundNumber: r.round_number,
    matches: (roundMatchMap.get(r.id) ?? []).map((m) => {
      const players = matchPlayerMap.get(m.id) ?? []
      return {
        id: m.id,
        courtNumber: m.court_number,
        isBye: m.is_bye,
        scoreTeam1: m.score_team1,
        scoreTeam2: m.score_team2,
        team1: players.filter((p) => p.team === 1).map((p) => ({
          participantId: p.participant_id,
          displayName:
            participants.find((x) => x.id === p.participant_id)?.display_name ?? '',
        })),
        team2: players.filter((p) => p.team === 2).map((p) => ({
          participantId: p.participant_id,
          displayName:
            participants.find((x) => x.id === p.participant_id)?.display_name ?? '',
        })),
      }
    }),
  }))

  return { participants, roundsWithMatches, standings }
}

// ── GET /api/club-sessions/:id/rr ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify session exists and user is a manager
  const session = await prisma.clubSession.findUnique({
    where: { id: sessionId },
    select: { appClubId: true, lifecycleState: true },
  })
  if (!session || session.lifecycleState === 'deleted') {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  const isManager = await isClubManager(session.appClubId, user.profileId)
  if (!isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tournaments = await prisma.$queryRaw<TournamentRow[]>(
    Prisma.sql`SELECT id, session_id, status, current_round, total_rounds, created_at, updated_at
               FROM rr_tournaments WHERE session_id = ${sessionId}`,
  )
  const tournament = tournaments[0] ?? null

  if (!tournament) {
    return NextResponse.json({ tournament: null, participants: [], rounds: [], standings: [] })
  }

  const { participants, roundsWithMatches, standings } = await loadFullTournamentState(
    tournament.id,
  )

  return NextResponse.json({
    tournament: {
      id: tournament.id,
      sessionId: tournament.session_id,
      status: tournament.status,
      currentRound: tournament.current_round,
      totalRounds: tournament.total_rounds,
    },
    participants: participants.map((p) => ({
      id: p.id,
      playerProfileId: p.player_profile_id,
      displayName: p.display_name,
    })),
    rounds: roundsWithMatches,
    standings,
  })
}

// ── POST /api/club-sessions/:id/rr ────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await prisma.clubSession.findUnique({
    where: { id: sessionId },
    select: { appClubId: true, format: true, lifecycleState: true },
  })
  if (!session || session.lifecycleState === 'deleted') {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (session.format !== 'round_robin') {
    return NextResponse.json(
      { error: 'Session format is not round_robin' },
      { status: 400 },
    )
  }
  const isManager = await isClubManager(session.appClubId, user.profileId)
  if (!isManager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check if a tournament already exists
  const existing = await prisma.$queryRaw<TournamentRow[]>(
    Prisma.sql`SELECT id, status FROM rr_tournaments WHERE session_id = ${sessionId}`,
  )
  if (existing.length > 0 && existing[0].status !== 'pending') {
    return NextResponse.json(
      { error: 'Tournament draw already created. To regenerate, the tournament must be in pending status.' },
      { status: 409 },
    )
  }

  // Parse optional numRounds override
  let numRoundsOverride: number | undefined
  try {
    const body = await req.json()
    if (typeof body.numRounds === 'number' && body.numRounds >= 1 && body.numRounds <= 20) {
      numRoundsOverride = Math.floor(body.numRounds)
    }
  } catch { /* body is optional */ }

  // Fetch confirmed bookings to build participant snapshot
  const bookings = await prisma.clubSessionBooking.findMany({
    where: { clubSessionId: sessionId, status: 'confirmed' },
    select: {
      playerProfileId: true,
      player: { select: { id: true, displayName: true, squadNickname: true } },
    },
  })

  if (bookings.length < 2) {
    return NextResponse.json(
      { error: 'Need at least 2 confirmed players to create a draw' },
      { status: 400 },
    )
  }

  const numRounds = numRoundsOverride ?? defaultNumRounds(bookings.length)

  // Generate the schedule (pure function, no DB)
  // We'll use temporary IDs here and replace with real participant UUIDs after insert
  const participantOrder = bookings.map((b) => b.playerProfileId)
  const tempRounds = generateRounds(participantOrder, numRounds)

  // ── DB writes (sequential — no Prisma transaction for raw SQL) ────────────

  // 1. Upsert tournament record
  let tournamentId: string
  if (existing.length > 0) {
    tournamentId = existing[0].id
    await prisma.$executeRaw(
      Prisma.sql`UPDATE rr_tournaments SET status = 'draw_created', total_rounds = ${numRounds},
                 current_round = 1, updated_at = NOW()
                 WHERE id = ${tournamentId}`,
    )
    // Clear prior data if regenerating
    await prisma.$executeRaw(
      Prisma.sql`DELETE FROM rr_participants WHERE tournament_id = ${tournamentId}`,
    )
  } else {
    const newTournament = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`INSERT INTO rr_tournaments (session_id, status, total_rounds, current_round)
                 VALUES (${sessionId}, 'draw_created', ${numRounds}, 1)
                 RETURNING id`,
    )
    tournamentId = newTournament[0].id
  }

  // 2. Insert participants — capture their new UUIDs
  const participantIdMap = new Map<string, string>() // profileId → participantId

  for (const b of bookings) {
    const displayName =
      b.player.displayName ?? b.player.squadNickname ?? b.playerProfileId.slice(0, 8)

    const inserted = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`INSERT INTO rr_participants (tournament_id, player_profile_id, display_name)
                 VALUES (${tournamentId}, ${b.playerProfileId}, ${displayName})
                 RETURNING id`,
    )
    participantIdMap.set(b.playerProfileId, inserted[0].id)
  }

  // 3. Insert rounds, matches, and match players
  for (const round of tempRounds) {
    const roundRows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`INSERT INTO rr_rounds (tournament_id, round_number)
                 VALUES (${tournamentId}, ${round.roundNumber})
                 RETURNING id`,
    )
    const roundId = roundRows[0].id

    for (const match of round.matches) {
      const matchRows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`INSERT INTO rr_matches (round_id, tournament_id, court_number, is_bye)
                   VALUES (${roundId}, ${tournamentId}, ${match.courtNumber}, ${match.isBye})
                   RETURNING id`,
      )
      const matchId = matchRows[0].id

      for (const profileId of match.team1) {
        const participantId = participantIdMap.get(profileId)
        if (participantId) {
          await prisma.$executeRaw(
            Prisma.sql`INSERT INTO rr_match_players (match_id, participant_id, team)
                       VALUES (${matchId}, ${participantId}, 1)`,
          )
        }
      }
      for (const profileId of match.team2) {
        const participantId = participantIdMap.get(profileId)
        if (participantId) {
          await prisma.$executeRaw(
            Prisma.sql`INSERT INTO rr_match_players (match_id, participant_id, team)
                       VALUES (${matchId}, ${participantId}, 2)`,
          )
        }
      }
    }
  }

  const { participants, roundsWithMatches, standings } = await loadFullTournamentState(tournamentId)

  return NextResponse.json(
    {
      tournament: {
        id: tournamentId,
        sessionId,
        status: 'draw_created',
        currentRound: 1,
        totalRounds: numRounds,
      },
      participants: participants.map((p) => ({
        id: p.id,
        playerProfileId: p.player_profile_id,
        displayName: p.display_name,
      })),
      rounds: roundsWithMatches,
      standings,
    },
    { status: 201 },
  )
}

// ── PATCH /api/club-sessions/:id/rr — advance current round ──────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const user = await getMobileUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const session = await prisma.clubSession.findUnique({
    where: { id: sessionId },
    select: { appClubId: true },
  })
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  const isManager = await isClubManager(session.appClubId, user.profileId)
  if (!isManager) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tournaments = await prisma.$queryRaw<TournamentRow[]>(
    Prisma.sql`SELECT id, status, current_round, total_rounds FROM rr_tournaments WHERE session_id = ${sessionId}`,
  )
  const tournament = tournaments[0]
  if (!tournament) {
    return NextResponse.json({ error: 'No tournament found' }, { status: 404 })
  }
  if (tournament.status === 'complete') {
    return NextResponse.json({ error: 'Tournament is already complete' }, { status: 409 })
  }

  let body: { currentRound?: number } = {}
  try { body = await req.json() } catch { /* body optional */ }

  const newRound = typeof body.currentRound === 'number'
    ? Math.max(1, Math.min(body.currentRound, tournament.total_rounds))
    : Math.min(tournament.current_round + 1, tournament.total_rounds)

  await prisma.$executeRaw(
    Prisma.sql`UPDATE rr_tournaments SET current_round = ${newRound}, status = 'active', updated_at = NOW()
               WHERE id = ${tournament.id}`,
  )

  return NextResponse.json({ ok: true, currentRound: newRound })
}
