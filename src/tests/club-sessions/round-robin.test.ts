/**
 * Unit tests for the Round Robin engine (pure functions, no DB needed).
 */
import { describe, expect, it } from 'vitest'
import {
  generateRounds,
  computeStandings,
  defaultNumRounds,
  type ScoredMatch,
} from '@/lib/club-sessions/round-robin'

// ── defaultNumRounds ──────────────────────────────────────────────────────────

describe('defaultNumRounds', () => {
  it('returns 1 for 4 players', () => {
    expect(defaultNumRounds(4)).toBe(1)
  })
  it('returns playerCount-1 for 8 players', () => {
    expect(defaultNumRounds(8)).toBe(7)
  })
  it('caps at 10 for 12 players', () => {
    expect(defaultNumRounds(12)).toBe(10)
  })
})

// ── generateRounds ────────────────────────────────────────────────────────────

describe('generateRounds — 4 players, 1 round', () => {
  const ids = ['p1', 'p2', 'p3', 'p4']
  const rounds = generateRounds(ids, 1)

  it('produces exactly 1 round', () => {
    expect(rounds).toHaveLength(1)
  })
  it('round has 1 non-bye match', () => {
    const matches = rounds[0].matches
    expect(matches.filter(m => !m.isBye)).toHaveLength(1)
  })
  it('all 4 players appear in the match', () => {
    const m = rounds[0].matches[0]
    expect(new Set([...m.team1, ...m.team2]).size).toBe(4)
  })
  it('no bye when N mod 4 = 0', () => {
    const byeMatches = rounds[0].matches.filter(m => m.isBye)
    expect(byeMatches).toHaveLength(0)
  })
})

describe('generateRounds — 5 players, 2 rounds', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5']
  const rounds = generateRounds(ids, 2)

  it('produces 2 rounds', () => {
    expect(rounds).toHaveLength(2)
  })
  it('each round has 1 active match + 1 bye', () => {
    for (const round of rounds) {
      const active = round.matches.filter(m => !m.isBye)
      const byes = round.matches.filter(m => m.isBye)
      expect(active).toHaveLength(1)
      expect(byes).toHaveLength(1)
    }
  })
  it('bye match team1 has sitting-out player(s), team2 is empty', () => {
    const bye = rounds[0].matches.find(m => m.isBye)!
    expect(bye.team1.length).toBeGreaterThanOrEqual(1)
    expect(bye.team2).toHaveLength(0)
  })
})

describe('generateRounds — 8 players, 3 rounds', () => {
  const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`)
  const rounds = generateRounds(ids, 3)

  it('produces 3 rounds', () => {
    expect(rounds).toHaveLength(3)
  })
  it('each round has 2 active courts', () => {
    for (const r of rounds) {
      expect(r.matches.filter(m => !m.isBye)).toHaveLength(2)
    }
  })
  it('court numbers start at 1', () => {
    const match = rounds[0].matches[0]
    expect(match.courtNumber).toBe(1)
  })
  it('each active match has exactly 2 players per team', () => {
    for (const r of rounds) {
      for (const m of r.matches.filter(m => !m.isBye)) {
        expect(m.team1).toHaveLength(2)
        expect(m.team2).toHaveLength(2)
      }
    }
  })
})

describe('generateRounds — edge cases', () => {
  it('throws for fewer than 2 players', () => {
    expect(() => generateRounds(['p1'], 1)).toThrow()
  })
  it('throws for 0 rounds', () => {
    expect(() => generateRounds(['p1', 'p2'], 0)).toThrow()
  })
})

// ── computeStandings ──────────────────────────────────────────────────────────

describe('computeStandings — basic scoring', () => {
  const participants = [
    { participantId: 'a', displayName: 'Alice' },
    { participantId: 'b', displayName: 'Bob' },
    { participantId: 'c', displayName: 'Carol' },
    { participantId: 'd', displayName: 'Dave' },
  ]

  const matches: ScoredMatch[] = [
    {
      matchId: 'm1',
      scoreTeam1: 11,
      scoreTeam2: 7,
      isBye: false,
      team1Participants: ['a', 'b'],
      team2Participants: ['c', 'd'],
    },
    {
      matchId: 'm2',
      scoreTeam1: 9,
      scoreTeam2: 11,
      isBye: false,
      team1Participants: ['a', 'c'],
      team2Participants: ['b', 'd'],
    },
  ]

  const standings = computeStandings(participants, matches)

  it('returns 4 standings rows', () => {
    expect(standings).toHaveLength(4)
  })

  it('rank 1 is Alice (2 games: 1W in m1, 0W in m2 — wait: a in team1 m1 wins, a in team1 m2 loses)', () => {
    // a: m1 win (11>7) + m2 loss (9<11) → 1W
    // b: m1 win + m2 win → 2W
    const bob = standings.find(s => s.participantId === 'b')!
    expect(bob.wins).toBe(2)
    expect(standings[0].participantId).toBe('b')
  })

  it('assigns rank 1 to player with most wins', () => {
    expect(standings[0].rank).toBe(1)
  })

  it('all ranks are unique and sequential', () => {
    const ranks = standings.map(s => s.rank).sort((a, b) => a - b)
    expect(ranks).toEqual([1, 2, 3, 4])
  })

  it('points for/against are accumulated correctly for Alice', () => {
    const alice = standings.find(s => s.participantId === 'a')!
    // m1 (team1): pf=11, pa=7
    // m2 (team1): pf=9, pa=11
    expect(alice.pointsFor).toBe(20)
    expect(alice.pointsAgainst).toBe(18)
    expect(alice.differential).toBe(2)
  })
})

describe('computeStandings — bye matches are ignored', () => {
  const participants = [
    { participantId: 'a', displayName: 'Alice' },
    { participantId: 'b', displayName: 'Bob' },
  ]
  const matches: ScoredMatch[] = [
    {
      matchId: 'bye',
      scoreTeam1: null,
      scoreTeam2: null,
      isBye: true,
      team1Participants: ['a'],
      team2Participants: [],
    },
  ]
  const standings = computeStandings(participants, matches)

  it('all players have 0 wins from bye', () => {
    for (const s of standings) {
      expect(s.wins).toBe(0)
      expect(s.gamesPlayed).toBe(0)
    }
  })
})

describe('computeStandings — tie-break by differential then pointsFor', () => {
  const participants = [
    { participantId: 'a', displayName: 'A' },
    { participantId: 'b', displayName: 'B' },
    { participantId: 'c', displayName: 'C' },
    { participantId: 'd', displayName: 'D' },
  ]
  // A&B beat C&D 11-9 → A,B: 1W diff+2; C,D: 0W diff-2
  // Then a second match where A&C beat B&D 11-5
  // A: 2W, pf=22, pa=14, diff=+8
  // B: 1W, pf=16, pa=16, diff=0
  // C: 1W, pf=20, pa=18, diff=+2
  // D: 0W, pf=14, pa=22, diff=-8
  const matches: ScoredMatch[] = [
    {
      matchId: 'm1', scoreTeam1: 11, scoreTeam2: 9, isBye: false,
      team1Participants: ['a', 'b'], team2Participants: ['c', 'd'],
    },
    {
      matchId: 'm2', scoreTeam1: 11, scoreTeam2: 5, isBye: false,
      team1Participants: ['a', 'c'], team2Participants: ['b', 'd'],
    },
  ]
  const standings = computeStandings(participants, matches)

  it('A is rank 1 (2 wins)', () => {
    expect(standings[0].participantId).toBe('a')
  })
  it('C is rank 2 (1W, diff +2 > 0)', () => {
    expect(standings[1].participantId).toBe('c')
  })
  it('B is rank 3 (1W, diff 0)', () => {
    expect(standings[2].participantId).toBe('b')
  })
  it('D is rank 4 (0W)', () => {
    expect(standings[3].participantId).toBe('d')
  })
})

describe('computeStandings — unscored matches are skipped', () => {
  const participants = [
    { participantId: 'a', displayName: 'A' },
    { participantId: 'b', displayName: 'B' },
    { participantId: 'c', displayName: 'C' },
    { participantId: 'd', displayName: 'D' },
  ]
  const matches: ScoredMatch[] = [
    {
      matchId: 'm1', scoreTeam1: null, scoreTeam2: null, isBye: false,
      team1Participants: ['a', 'b'], team2Participants: ['c', 'd'],
    },
  ]
  const standings = computeStandings(participants, matches)

  it('all players remain at 0 wins when match is unscored', () => {
    for (const s of standings) {
      expect(s.wins).toBe(0)
    }
  })
})
