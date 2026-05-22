export type VibeTag = 'social' | 'competitive' | 'chill'

export type RosterPlayer = {
  displayName: string
  imageUrl: string
  duprDoubles: number | null
  isHost: boolean
}

export type RegularPlayer = {
  displayName: string
  imageUrl: string
}

/** Friends of the current user who are joining this session (not full roster). */
export type FriendPlayer = {
  displayName: string
  imageUrl: string
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
