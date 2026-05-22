export type Session = {
  id: number
  name: string
  venue: string
  court: string
  time: string
  format: string
  totalSpots: number
  filled: number
  matchScore: number
  gameQuality: number
  waitMinutes: number
  duprRange: { min: number; max: number; avg: number }
  vibe: string
  vibeExtra: string[]
  players: { name: string; dupr: number; avatar: string; isFriend: boolean }[]
  friendCount: number
}

export const ALL_SESSIONS: Session[] = [
  { id: 1, name: 'Saigon Smash Social', venue: 'D9 Sports Club', court: 'Courts 3–5c', time: '7:30 PM', format: 'Round Robin', totalSpots: 20, filled: 14, matchScore: 92, gameQuality: 4.6, waitMinutes: 6, duprRange: { min: 3.1, max: 3.7, avg: 3.38 }, vibe: 'Social', vibeExtra: ['Fast rotations', 'Beer after'], players: [{ name: 'Sarah', dupr: 3.41, avatar: 'SK', isFriend: true }, { name: 'Taylor', dupr: 3.47, avatar: 'TM', isFriend: true }, { name: 'Jordan', dupr: 3.19, avatar: 'JP', isFriend: true }, { name: 'Mike', dupr: 3.28, avatar: 'MT', isFriend: false }, { name: 'Chris', dupr: 3.33, avatar: 'CL', isFriend: false }, { name: 'Sam', dupr: 3.55, avatar: 'SB', isFriend: false }], friendCount: 3 },
  { id: 2, name: 'D7 Competitive RR', venue: 'District 7 Courts', court: 'Courts 1–2', time: '8:00 PM', format: 'Competitive', totalSpots: 16, filled: 12, matchScore: 78, gameQuality: 4.9, waitMinutes: 14, duprRange: { min: 3.3, max: 4.1, avg: 3.72 }, vibe: 'Intense', vibeExtra: ['Skill-first', 'No mercy'], players: [{ name: 'Priya', dupr: 3.88, avatar: 'PR', isFriend: false }, { name: 'Tom', dupr: 3.71, avatar: 'TN', isFriend: false }, { name: 'Dane', dupr: 4.02, avatar: 'DW', isFriend: false }, { name: 'Mai', dupr: 3.45, avatar: 'ML', isFriend: false }], friendCount: 0 },
  { id: 3, name: 'Rooftop Rally Chill', venue: 'Landmark 81', court: 'Courts R1–R2', time: '7:00 PM', format: 'Open Play', totalSpots: 12, filled: 4, matchScore: 63, gameQuality: 3.7, waitMinutes: 2, duprRange: { min: 2.8, max: 3.5, avg: 3.1 }, vibe: 'Chill', vibeExtra: ['Relaxed', 'City views'], players: [{ name: 'Lin', dupr: 3.2, avatar: 'LC', isFriend: false }, { name: 'Ben', dupr: 2.95, avatar: 'BP', isFriend: false }], friendCount: 0 },
  { id: 4, name: 'Ben Thanh Night Rally', venue: 'Ben Thanh Sports', court: 'Courts 2–4', time: '9:00 PM', format: 'Open Play', totalSpots: 18, filled: 9, matchScore: 85, gameQuality: 4.3, waitMinutes: 4, duprRange: { min: 3.0, max: 3.8, avg: 3.45 }, vibe: 'Social', vibeExtra: ['Late night', 'Fun energy'], players: [{ name: 'Anna', dupr: 3.52, avatar: 'AN', isFriend: true }, { name: 'Leon', dupr: 3.38, avatar: 'LN', isFriend: false }, { name: 'Rosa', dupr: 3.44, avatar: 'RS', isFriend: false }], friendCount: 1 },
  { id: 5, name: 'Thao Dien Morning', venue: 'Thao Dien Courts', court: 'Courts 1–3', time: '6:30 AM', format: 'Round Robin', totalSpots: 16, filled: 11, matchScore: 71, gameQuality: 4.1, waitMinutes: 8, duprRange: { min: 2.9, max: 3.6, avg: 3.25 }, vibe: 'Chill', vibeExtra: ['Early birds', 'Cool temps'], players: [{ name: 'Hoa', dupr: 3.1, avatar: 'HO', isFriend: false }, { name: 'Nam', dupr: 3.3, avatar: 'NM', isFriend: false }], friendCount: 0 },
]

export const AVATAR_PHOTOS: Record<string, string> = {
  AR: 'https://i.pravatar.cc/80?img=33',
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
  MR: 'https://i.pravatar.cc/80?img=11',
  JL: 'https://i.pravatar.cc/80?img=13',
}

export const VENUE_DISTANCE: Record<string, string> = {
  'D9 Sports Club': '3.2 km',
  'District 7 Courts': '5.1 km',
  'Landmark 81': '1.8 km',
  'Ben Thanh Sports': '2.4 km',
  'Thao Dien Courts': '4.3 km',
}

export const SESSION_PRICE: Record<number, string> = {
  1: '90k · 2h',
  2: '120k · 1.5h',
  3: '75k · 2h',
  4: '100k · 2h',
  5: '80k · 1.5h',
}

export const RING_COLORS = ['#7F77DD', '#1D9E75', '#D4537E', '#f5a623']

export const SAVED_IDS = [1, 2, 4]
