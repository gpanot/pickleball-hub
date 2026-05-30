export interface MatchScoreParams {
  userDupr: number | null
  sessionAvgDupr: number | null
  fillRate: number          // 0-1 e.g. 0.75 = 75% full
  returningPlayerPct: number | null  // 0-1, null if unknown
}

export function calculateMatchScore(params: MatchScoreParams): number {
  const { userDupr, sessionAvgDupr, fillRate, returningPlayerPct } = params

  // Signal 1 — DUPR compatibility (55 pts)
  let duprScore = 28 // neutral when data missing
  if (userDupr !== null && sessionAvgDupr !== null) {
    const diff = Math.abs(userDupr - sessionAvgDupr)
    if (diff <= 0.2)      duprScore = 55
    else if (diff <= 0.4) duprScore = 44
    else if (diff <= 0.6) duprScore = 33
    else if (diff <= 1.0) duprScore = 18
    else                  duprScore = 5
  }

  // Signal 2 — Fill momentum (30 pts) — 4 levels by % filled
  let fillScore: number
  if (fillRate >= 0.75)      fillScore = 30
  else if (fillRate >= 0.50) fillScore = 22
  else if (fillRate >= 0.25) fillScore = 12
  else                       fillScore = 5

  // Signal 3 — Community quality (15 pts)
  let communityScore = 7 // neutral when null
  if (returningPlayerPct !== null) {
    if (returningPlayerPct >= 0.6)      communityScore = 15
    else if (returningPlayerPct >= 0.4) communityScore = 10
    else if (returningPlayerPct >= 0.2) communityScore = 5
    else                                communityScore = 3
  }

  return Math.min(100, duprScore + fillScore + communityScore)
}
