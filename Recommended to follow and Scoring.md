# Recommended to Follow & Session Scoring

_Last updated: 2026-06-03_

---

## 1. "Recommended to Follow" — Matching Logic

The recommendation engine runs client-side in `SwipeScreen.tsx` (`getRecommendations()`) when the "Top 8 DUPR joining" modal is opened. It also runs in `CircleScreen.tsx` when the roster modal is opened.

### Eligible players

- Not already followed by the current user
- Not the current user themselves
- Players encountered in sessions or mutual social connections

### Scoring tiers (sorted descending, top 3 returned)

| Tier | Score | Condition |
|------|-------|-----------|
| **Overlap** | 100 + N | Shared **2 or more sessions** with the current user (via `GET /api/sessions/overlap`). N = number of shared sessions, so more overlap = higher score. |
| **Level** | 80 | DUPR within **±0.4** of the current user's DUPR |
| **Social** | 60 | **2 or more mutual follows** |

Only the highest-scoring tier is applied per player.

### Display chips

| Reason type | Colour | Example label |
|-------------|--------|---------------|
| `overlap` | Green `#1D9E75` | "Played together 3×" |
| `level` | Amber `#f5a623` | "Similar DUPR (3.20)" |
| `social` | Purple `#9b59b6` | "2 mutual follows" |

---

## 2. Session Match Score — % Breakdown

Calculated in `src/lib/match-score.ts` → `calculateMatchScore()`.

The score is the **sum of three signals**, capped at **100 pts**.

### Signal 1 — DUPR Compatibility (max 55 pts)

Measures how close the user's DUPR is to the session average DUPR.

| DUPR diff | Points |
|-----------|--------|
| ≤ 0.2 | **55** |
| ≤ 0.4 | **44** |
| ≤ 0.6 | **33** |
| ≤ 1.0 | **18** |
| > 1.0 | **5** |
| No DUPR data | **28** (neutral) |

### Signal 2 — Fill Momentum (max 30 pts)

Measures how full the session is (social proof / demand).

| Fill rate | Points |
|-----------|--------|
| ≥ 75% | **30** |
| ≥ 50% | **22** |
| ≥ 25% | **12** |
| < 25% | **5** |

### Signal 3 — Community Quality (max 15 pts)

Measures the proportion of returning players in the session.

| Returning player % | Points |
|--------------------|--------|
| ≥ 60% | **15** |
| ≥ 40% | **10** |
| ≥ 20% | **5** |
| < 20% | **3** |
| Unknown | **7** (neutral) |

### Total

```
matchScore = min(100, duprScore + fillScore + communityScore)
```

**Example:** DUPR diff 0.3 (44 pts) + session 80% full (30 pts) + 65% returning (15 pts) = **89%**
