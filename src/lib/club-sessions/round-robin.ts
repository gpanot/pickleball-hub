/**
 * Round Robin engine — doubles only.
 *
 * Generates a balanced court schedule and computes live standings.
 * All pure functions; no DB access — called from route handlers.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MatchPlayer {
  participantId: string
  team: 1 | 2
}

export interface MatchDef {
  courtNumber: number
  isBye: boolean
  /** participantIds on team 1 */
  team1: string[]
  /** participantIds on team 2 — empty for bye matches */
  team2: string[]
}

export interface RoundDef {
  roundNumber: number
  matches: MatchDef[]
}

export interface ScoredMatch {
  matchId: string
  scoreTeam1: number | null
  scoreTeam2: number | null
  isBye: boolean
  team1Participants: string[]
  team2Participants: string[]
}

export interface Standing {
  participantId: string
  displayName: string
  wins: number
  losses: number
  pointsFor: number
  pointsAgainst: number
  differential: number
  gamesPlayed: number
  rank: number
}

// ── Pairing algorithm ──────────────────────────────────────────────────────────

/**
 * Berger rotation: fix the first element, shift the rest left by `round` positions.
 * Guarantees each player meets every other player across N-1 rounds (for even N).
 */
function bergerRotate(ids: string[], round: number): string[] {
  if (ids.length < 2) return ids
  const fixed = ids[0]
  const rest = ids.slice(1)
  const offset = round % rest.length
  return [fixed, ...rest.slice(offset), ...rest.slice(0, offset)]
}

/**
 * Calculate the default number of rounds for N players.
 * Targets enough rounds for a fair event without running all day.
 */
export function defaultNumRounds(playerCount: number): number {
  if (playerCount <= 4) return 1
  if (playerCount <= 8) return playerCount - 1   // full RR (7 for 8 players)
  return Math.min(playerCount - 1, 10)           // cap at 10 for large groups
}

/**
 * Generate a doubles round-robin schedule.
 *
 * @param participantIds  Array of participant UUIDs in desired seeding order.
 * @param numRounds       Number of rounds to generate.
 * @returns               Array of RoundDef objects.
 *
 * Each round: floor(N/4) active courts + optional bye "match" for leftover players.
 * BYE match: isBye=true, team1 = sitting-out players, team2 = [].
 */
export function generateRounds(
  participantIds: string[],
  numRounds: number,
): RoundDef[] {
  const N = participantIds.length
  if (N < 2) throw new Error('Need at least 2 players')
  if (numRounds < 1) throw new Error('Need at least 1 round')

  const numCourts = Math.floor(N / 4)
  const activePlayers = numCourts * 4

  const rounds: RoundDef[] = []

  for (let r = 0; r < numRounds; r++) {
    const rotated = N > 1 ? bergerRotate(participantIds, r) : participantIds
    const matches: MatchDef[] = []

    // Full courts
    for (let c = 0; c < numCourts; c++) {
      const base = c * 4
      matches.push({
        courtNumber: c + 1,
        isBye: false,
        team1: [rotated[base], rotated[base + 1]],
        team2: [rotated[base + 2], rotated[base + 3]],
      })
    }

    // Bye players (N mod 4 sit out this round)
    if (activePlayers < N) {
      matches.push({
        courtNumber: numCourts + 1,
        isBye: true,
        team1: rotated.slice(activePlayers),
        team2: [],
      })
    }

    rounds.push({ roundNumber: r + 1, matches })
  }

  return rounds
}

// ── Standings computation ──────────────────────────────────────────────────────

/**
 * Compute live standings from scored matches.
 * Tie-break order: wins → differential → pointsFor.
 */
export function computeStandings(
  participants: { participantId: string; displayName: string }[],
  matches: ScoredMatch[],
): Standing[] {
  const stats = new Map<
    string,
    { wins: number; losses: number; pf: number; pa: number; played: number }
  >()

  for (const p of participants) {
    stats.set(p.participantId, { wins: 0, losses: 0, pf: 0, pa: 0, played: 0 })
  }

  for (const m of matches) {
    if (m.isBye || m.scoreTeam1 === null || m.scoreTeam2 === null) continue

    const s1 = m.scoreTeam1
    const s2 = m.scoreTeam2

    const team1Won = s1 > s2
    const team2Won = s2 > s1

    const update = (id: string, won: boolean, pf: number, pa: number) => {
      const s = stats.get(id)
      if (!s) return
      s.wins += won ? 1 : 0
      s.losses += won ? 0 : 1
      s.pf += pf
      s.pa += pa
      s.played += 1
    }

    for (const id of m.team1Participants) {
      update(id, team1Won, s1, s2)
    }
    for (const id of m.team2Participants) {
      update(id, team2Won, s2, s1)
    }
  }

  const standings: Standing[] = participants.map((p) => {
    const s = stats.get(p.participantId) ?? { wins: 0, losses: 0, pf: 0, pa: 0, played: 0 }
    return {
      participantId: p.participantId,
      displayName: p.displayName,
      wins: s.wins,
      losses: s.losses,
      pointsFor: s.pf,
      pointsAgainst: s.pa,
      differential: s.pf - s.pa,
      gamesPlayed: s.played,
      rank: 0,
    }
  })

  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.differential !== a.differential) return b.differential - a.differential
    return b.pointsFor - a.pointsFor
  })

  standings.forEach((s, i) => { s.rank = i + 1 })

  return standings
}
