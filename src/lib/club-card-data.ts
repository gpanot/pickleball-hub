/**
 * Shared ClubCardData type used across the clubs API endpoints.
 */
export interface ClubCardData {
  id: string
  name: string
  icon: string | null
  tagline: string | null
  coverImageUrl: string | null
  vibeTag: string | null
  city?: string | null
  memberCount: number
  sessionCount: number
  /** Players from the viewer's circle who play at this club (circle endpoint only). */
  circlePlayers?: { userId: string; displayName: string | null; imageUrl: string | null }[]
  /** Number of sessions in the last 30 days (nearby endpoint only). */
  recentActivity?: number
  /** Distance from player in km, rounded to 1 decimal (nearby endpoint only). */
  distanceKm?: number
}
