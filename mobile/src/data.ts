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

// --- Mock data (matches API shape from /api/sessions/swipe-deck) ---

const MOCK_AVATARS = {
  SK: 'https://i.pravatar.cc/80?img=5',
  TM: 'https://i.pravatar.cc/80?img=12',
  JP: 'https://i.pravatar.cc/80?img=18',
  MT: 'https://i.pravatar.cc/80?img=51',
  CL: 'https://i.pravatar.cc/80?img=59',
  SB: 'https://i.pravatar.cc/80?img=60',
  PR: 'https://i.pravatar.cc/80?img=25',
  TN: 'https://i.pravatar.cc/80?img=52',
  DW: 'https://i.pravatar.cc/80?img=53',
  ML: 'https://i.pravatar.cc/80?img=23',
  LC: 'https://i.pravatar.cc/80?img=35',
  BP: 'https://i.pravatar.cc/80?img=54',
  AN: 'https://i.pravatar.cc/80?img=9',
  LN: 'https://i.pravatar.cc/80?img=57',
  RS: 'https://i.pravatar.cc/80?img=20',
  HO: 'https://i.pravatar.cc/80?img=24',
  NM: 'https://i.pravatar.cc/80?img=56',
} as const

export const ALL_SESSIONS: Session[] = [
  {
    id: 1,
    referenceCode: 'ABC123',
    name: 'Saigon Smash Social',
    startTime: '19:30',
    endTime: '21:30',
    durationMin: 120,
    maxPlayers: 20,
    feeAmount: 90000,
    feeCurrency: 'VND',
    joined: 14,
    spotsLeft: 6,
    fillRate: 0.7,
    fillingFast: true,
    joinedRecently: 6,
    matchScore: 92,
    distanceKm: 3.2,
    vibeTag: 'social',
    duprRange: { min: 3.1, max: 3.7 },
    venue: { name: 'D9 Sports Club', latitude: 10.8, longitude: 106.7 },
    club: { name: 'Saigon Smash', slug: 'saigon-smash' },
    roster: [
      { displayName: 'Sarah K.', imageUrl: MOCK_AVATARS.SK, duprDoubles: 3.41, isHost: false },
      { displayName: 'Taylor M.', imageUrl: MOCK_AVATARS.TM, duprDoubles: 3.47, isHost: false },
      { displayName: 'Jordan P.', imageUrl: MOCK_AVATARS.JP, duprDoubles: 3.19, isHost: false },
      { displayName: 'Mike T.', imageUrl: MOCK_AVATARS.MT, duprDoubles: 3.28, isHost: false },
      { displayName: 'Chris L.', imageUrl: MOCK_AVATARS.CL, duprDoubles: 3.33, isHost: true },
      { displayName: 'Sam B.', imageUrl: MOCK_AVATARS.SB, duprDoubles: 3.55, isHost: false },
    ],
    regulars: [
      { displayName: 'Sarah K.', imageUrl: MOCK_AVATARS.SK },
      { displayName: 'Taylor M.', imageUrl: MOCK_AVATARS.TM },
      { displayName: 'Mike T.', imageUrl: MOCK_AVATARS.MT },
    ],
    eventUrl: 'https://reclub.co/m/ABC123',
  },
  {
    id: 2,
    referenceCode: 'DEF456',
    name: 'D7 Competitive RR',
    startTime: '20:00',
    endTime: '21:30',
    durationMin: 90,
    maxPlayers: 16,
    feeAmount: 120000,
    feeCurrency: 'VND',
    joined: 12,
    spotsLeft: 4,
    fillRate: 0.75,
    fillingFast: false,
    joinedRecently: 2,
    matchScore: 78,
    distanceKm: 5.1,
    vibeTag: 'competitive',
    duprRange: { min: 3.3, max: 4.1 },
    venue: { name: 'District 7 Courts', latitude: 10.73, longitude: 106.72 },
    club: { name: 'D7 Pickle', slug: 'd7-pickle' },
    roster: [
      { displayName: 'Priya R.', imageUrl: MOCK_AVATARS.PR, duprDoubles: 3.88, isHost: false },
      { displayName: 'Tom N.', imageUrl: MOCK_AVATARS.TN, duprDoubles: 3.71, isHost: false },
      { displayName: 'Dane W.', imageUrl: MOCK_AVATARS.DW, duprDoubles: 4.02, isHost: true },
      { displayName: 'Mai L.', imageUrl: MOCK_AVATARS.ML, duprDoubles: 3.45, isHost: false },
    ],
    regulars: [
      { displayName: 'Dane W.', imageUrl: MOCK_AVATARS.DW },
      { displayName: 'Priya R.', imageUrl: MOCK_AVATARS.PR },
    ],
    eventUrl: 'https://reclub.co/m/DEF456',
  },
  {
    id: 3,
    referenceCode: 'GHI789',
    name: 'Rooftop Rally Chill',
    startTime: '19:00',
    endTime: '21:00',
    durationMin: 120,
    maxPlayers: 12,
    feeAmount: 75000,
    feeCurrency: 'VND',
    joined: 4,
    spotsLeft: 8,
    fillRate: 0.33,
    fillingFast: false,
    joinedRecently: 0,
    matchScore: 63,
    distanceKm: 1.8,
    vibeTag: 'chill',
    duprRange: { min: 2.8, max: 3.5 },
    venue: { name: 'Landmark 81', latitude: 10.79, longitude: 106.72 },
    club: { name: 'Rooftop Rally', slug: 'rooftop-rally' },
    roster: [
      { displayName: 'Lin C.', imageUrl: MOCK_AVATARS.LC, duprDoubles: 3.2, isHost: true },
      { displayName: 'Ben P.', imageUrl: MOCK_AVATARS.BP, duprDoubles: 2.95, isHost: false },
    ],
    regulars: [],
    eventUrl: 'https://reclub.co/m/GHI789',
  },
  {
    id: 4,
    referenceCode: 'JKL012',
    name: 'Ben Thanh Night Rally',
    startTime: '21:00',
    endTime: '23:00',
    durationMin: 120,
    maxPlayers: 18,
    feeAmount: 100000,
    feeCurrency: 'VND',
    joined: 9,
    spotsLeft: 9,
    fillRate: 0.5,
    fillingFast: false,
    joinedRecently: 3,
    matchScore: 85,
    distanceKm: 2.4,
    vibeTag: 'social',
    duprRange: { min: 3.0, max: 3.8 },
    venue: { name: 'Ben Thanh Sports', latitude: 10.77, longitude: 106.7 },
    club: { name: 'Ben Thanh PB', slug: 'ben-thanh-pb' },
    roster: [
      { displayName: 'Anna N.', imageUrl: MOCK_AVATARS.AN, duprDoubles: 3.52, isHost: false },
      { displayName: 'Leon N.', imageUrl: MOCK_AVATARS.LN, duprDoubles: 3.38, isHost: true },
      { displayName: 'Rosa S.', imageUrl: MOCK_AVATARS.RS, duprDoubles: 3.44, isHost: false },
    ],
    regulars: [
      { displayName: 'Anna N.', imageUrl: MOCK_AVATARS.AN },
    ],
    eventUrl: 'https://reclub.co/m/JKL012',
  },
  {
    id: 5,
    referenceCode: 'MNO345',
    name: 'Thao Dien Morning',
    startTime: '06:30',
    endTime: '08:00',
    durationMin: 90,
    maxPlayers: 16,
    feeAmount: 80000,
    feeCurrency: 'VND',
    joined: 11,
    spotsLeft: 5,
    fillRate: 0.69,
    fillingFast: false,
    joinedRecently: 1,
    matchScore: 71,
    distanceKm: 4.3,
    vibeTag: 'chill',
    duprRange: { min: 2.9, max: 3.6 },
    venue: { name: 'Thao Dien Courts', latitude: 10.8, longitude: 106.74 },
    club: { name: 'Thao Dien PB', slug: 'thao-dien-pb' },
    roster: [
      { displayName: 'Hoa O.', imageUrl: MOCK_AVATARS.HO, duprDoubles: 3.1, isHost: true },
      { displayName: 'Nam M.', imageUrl: MOCK_AVATARS.NM, duprDoubles: 3.3, isHost: false },
    ],
    regulars: [],
    eventUrl: 'https://reclub.co/m/MNO345',
  },
]

// Legacy avatar map — still used by TopBar user avatar
export const AVATAR_PHOTOS: Record<string, string> = {
  AR: 'https://i.pravatar.cc/80?img=33',
  ...MOCK_AVATARS,
}

export const RING_COLORS = ['#7F77DD', '#1D9E75', '#D4537E', '#f5a623']

export const SAVED_IDS = [1, 2, 4]
