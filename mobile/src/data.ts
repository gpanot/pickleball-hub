export type VibeTag = 'social' | 'competitive' | 'chill'

export type RosterPlayer = {
  userId: string
  displayName: string
  imageUrl: string
  duprDoubles: number | null
  isHost: boolean
  isFollowing?: boolean
}

/** Average DUPR of players with a valid rating (e.g. top 6 on a card). */
export function averageDupr(
  players: { duprDoubles: number | null }[],
): number | null {
  const vals = players
    .map((p) => p.duprDoubles)
    .filter((d): d is number => d != null && d > 0)
  if (vals.length === 0) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.round(avg * 100) / 100
}

export type RegularPlayer = {
  displayName: string
  imageUrl: string
}

/** Friends of the current user who are joining this session (not full roster). */
export type FriendPlayer = {
  userId: string
  displayName: string
  imageUrl: string | null
  duprDoubles?: number | null
}

export type Session = {
  id: number
  referenceCode: string
  name: string
  startTime: string
  endTime: string
  durationMin: number
  maxPlayers: number
  feeAmount: number
  feeCurrency: string

  joined: number
  spotsLeft: number
  fillRate: number
  fillingFast: boolean
  joinedRecently: number
  matchScore: number
  distanceKm: number | null
  vibeTag: VibeTag

  duprRange: { min: number; max: number } | null

  venue: { name: string; latitude: number; longitude: number } | null
  club: { name: string; slug: string }

  roster: RosterPlayer[]
  regulars: RegularPlayer[]
  /** Friends joining — shown as ringed avatars + "X friends joining" (not roster). */
  friends: FriendPlayer[]
  friendCount: number
  /** Extra friends beyond the avatars shown (for "+N" pill). */
  friendsOverflow: number

  eventUrl: string
  /** Calendar day for this session row (YYYY-MM-DD, Vietnam). */
  scrapedDate?: string
}

/** Vietnam calendar date (UTC+7). */
export function vnCalendarDateString(offsetDays = 0): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000)
  vn.setUTCDate(vn.getUTCDate() + offsetDays)
  return vn.toISOString().slice(0, 10)
}

/** Current time in Vietnam as HH:mm — hide sessions that already started today. */
export function vnCurrentTimeString(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const hh = String(vn.getUTCHours()).padStart(2, '0')
  const mm = String(vn.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** True if the session's start is in the past (by scraped date + start time, VN). */
export function isSessionStarted(session: {
  startTime: string
  scrapedDate?: string
}): boolean {
  const today = vnCalendarDateString(0)
  const dateStr = session.scrapedDate ?? today
  if (dateStr < today) return true
  if (dateStr > today) return false
  return session.startTime < vnCurrentTimeString()
}

// --- Helpers for card display ---

export function formatPrice(feeAmount: number): string {
  if (feeAmount === 0) return 'Free'
  return `${Math.round(feeAmount / 1000)}k`
}

export function formatDuration(durationMin: number): string {
  const h = durationMin / 60
  return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`
}

export function formatPriceDuration(feeAmount: number, durationMin: number): string {
  return `${formatPrice(feeAmount)} · ${formatDuration(durationMin)}`
}

export function formatDistance(km: number | null): string {
  if (km === null) return ''
  return `${km.toFixed(1)} km`
}

export function formatTime(startTime: string): string {
  const [hStr, mStr] = startTime.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr ?? '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === '00' ? `${h12} ${ampm}` : `${h12}:${m} ${ampm}`
}

export const RING_COLORS = ['#7F77DD', '#1D9E75', '#D4537E', '#f5a623']

// ── Feed types ────────────────────────────────────────────────────────────────

export type FeedItemType =
  | 'joining'
  | 'played'
  | 'played_today'
  | 'you_are_playing'
  | 'dupr_update'
  | 'just_followed'
  | 'streak_milestone'
  | 'new_follower'

export type FeedItem = {
  id: string
  type: FeedItemType
  player: {
    userId: string
    displayName: string | null
    imageUrl: string | null
    duprDoubles: number | null
  }
  isFollowing: boolean
  timestamp: string

  // type === 'joining' or 'played'
  venueName?: string
  sessionName?: string
  sessionTime?: string
  district?: string
  spotsLeft?: number
  sessionId?: number
  eventUrl?: string
  sessionCount?: number

  // type === 'dupr_update'
  duprOld?: number
  duprNew?: number
  venueNameDupr?: string

  streakCount?: number
  weeklyPlayed?: boolean[]

  kudos?: { fistbump: number; flame: number; star: number; myReactions: string[] }
}

export type CoPlayerSuggestion = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  coSessionCount: number
  venueName: string
}
