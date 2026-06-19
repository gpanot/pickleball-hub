export type SquadMemberRole = 'founder' | 'member';

export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'not_on_app' | 'cancelled';

export interface Squad {
  id: string;
  name: string;
  emoji: string;
  color: string;
  isPublic: boolean;
  showDupr: boolean;
  appSlug: string;
  founderId: string;
  totalXp: number;
  level: number;
  city?: string;
  streakDays?: number;
  cityRank?: number;
  createdAt: string;
  disbandedAt: string | null;
  code?: SquadCode | null;
  members?: SquadMemberWithProfile[];
  invites?: SquadInviteEnriched[];
}

export interface SquadCode {
  id: number;
  squadId: string;
  code: string;
  appSlug: string;
}

export interface SquadMember {
  id: number;
  squadId: string;
  profileId: string;
  role: SquadMemberRole;
  joinedAt: string;
  leftAt: string | null;
}

export interface SquadMemberProfile {
  id: string;
  displayName: string | null;
  squadNickname: string | null;
  squadNicknameSetAt?: string | null;
  reclubUserId: bigint | null;
  reclubPlayer?: {
    imageUrl: string | null;
    duprDoubles: number | null;
  } | null;
}

export interface SquadMemberWithProfile extends SquadMember {
  profile: SquadMemberProfile;
  podName?: string | null;
}

export interface SquadInviteEnriched {
  id: number;
  inviteeId: string | null;
  displayName: string | null;
  avatar: string | null;
  status: InviteStatus;
  channel: string;
  lastResentAt: string | null;
  createdAt: string;
}

export interface SquadInviteKnownMember {
  profileId: string;
  userId: string | null;
  displayName: string | null;
  imageUrl: string | null;
  dupr: number | null;
  isFounder: boolean;
  sessionsTogether: number;
  isFollowing: boolean;
}

export interface SquadPreview {
  id: string;
  name: string;
  emoji: string;
  color: string;
  memberCount: number;
  avgDupr: number | null;
  district?: string;
  inviterName?: string | null;
  knownMembers?: SquadInviteKnownMember[];
  avatars: Array<{ displayName: string | null; imageUrl: string | null }>;
  founderId: string;
}

export interface CreateSquadPayload {
  name: string;
  emoji: string;
  color: string;
  isPublic: boolean;
  showDupr: boolean;
  latitude?: number;
  longitude?: number;
}

export interface NearbySquadMember {
  initial: string;
  displayName: string | null;
}

export interface NearbySquad {
  id: string;
  name: string;
  emoji: string;
  color: string;
  memberCount: number;
  maxMembers: number;
  openSpots: number;
  avgDupr: number | null;
  level: number;
  totalXp: number;
  sessions: number;
  distance: number;
  members: NearbySquadMember[];
  founderId: string;
  founderName: string | null;
  code: string | null;
}

export interface SquadDisbandedNotice {
  squadId: string;
  squadName: string;
  founderName: string;
  disbandedAt: string;
}

export type SquadScreen =
  | 'carousel'
  | 'gate'
  | 'ready'
  | 'nickname'
  | 'create'
  | 'invite'
  | 'created'
  | 'home'
  | 'invite-receive'
  | 'disbanded'
  | 'disband-confirm'
  | 'browse'
  | 'leave-confirm'
  | 'chest-detail'
  | 'chest-open'
  | 'leaderboard'
  | 'manage'
  | 'edit'
  // ── Phase 3: Pods, Tokens & Brands ──
  | 'pod-playstyle'
  | 'pod-create'
  | 'brand-select'
  | 'welcome-chest'
  | 'token-split'
  | 'brand-detail'
  | 'clubhouse-detail'
  | 'pod-edit'
  // ── Phase 4 conquest screens ──
  | 'conquest-session'
  | 'conquest-battle'
  | 'conquest-battle-win'
  | 'conquest-battle-lose'
  | 'conquest-impact'
  | 'conquest-share'
  | 'conquest-alerts';

// ── Phase 2 types ──────────────────────────────────────────────────

export type ChestOpeningStatus = 'pending' | 'tapped' | 'unlocking' | 'ready' | 'opened' | 'expired';

export interface SquadChestOpening {
  profileId: string;
  displayName: string;
  status: ChestOpeningStatus;
  unlocksAt: string | null;
}

export interface SquadChest {
  id: string;
  squadId?: string;
  earnerId: string;
  earnerName: string;
  source: 'checkin' | 'scraper';
  venueName: string | null;
  createdAt: string;
  expiresAt: string;
  openings: SquadChestOpening[];
  myOpening?: { status: ChestOpeningStatus; unlocksAt: string | null } | null;
}

export interface FeedItem {
  type: 'checkin' | 'scraper_session' | 'chest_opened' | 'member_joined' | 'streak_daily' | 'streak_milestone';
  profileId: string | null;
  displayName: string;
  text?: string;
  xpAwarded: number;
  streakDays?: number;
  createdAt: string;
}

export interface SquadStreak {
  days: number;
  lastPlayedAt: string | null;
}

export interface LeaderboardSquad {
  rank: number;
  squadId: string;
  name: string;
  emoji: string;
  color: string;
  xp: number;
  level: number;
  memberCount: number;
  sessionCount: number;
}

export interface LeaderboardData {
  city: string;
  period: string;
  resetDate: string;
  totalSquads: number;
  totalPlayers: number;
  totalSessions: number;
  squads: LeaderboardSquad[];
  mySquad: { rank: number; squadId: string; xp: number } | null;
}

export interface CheckinPayload {
  squadId: string;
  venueName?: string;
  venueId?: number;
  taggedProfileIds?: string[];
}

export interface ChestOpenResult {
  xpAwarded: number;
  squadLevel: number;
  squadXp: number;
  clubTokensAwarded: number;
  brandTokensAwarded: number;
}

export interface WelcomeChestResult {
  clubTokensAwarded: number;
  brandTokensAwarded: number;
  xpAwarded: number;
}

export interface PodSummary {
  id: string;
  name: string;
  emoji: string;
  founderId: string;
  members: Array<{ profileId: string; displayName: string }>;
}

export interface PlayerBrandData {
  id: string;
  brand: string;
  supportLevel: number;
  brandXp: number;
  switchedCount: number;
  bonuses: { pvpRewardPct: number; territoryInfPct: number; label: string };
}

export interface PlayerWalletData {
  clubTokens: number;
  brandTokens: number;
}

export interface PlayerContribution {
  sessions: number;
  xpEarned: number;
  chestsOpened: number;
}

// ── Phase 4 Conquest types ──────────────────────────────────────────

export interface ClashRival {
  squadId: string;
  squadName: string;
  squadEmoji: string;
  battle: {
    id: string;
    revealAt: string;
    revealed: boolean;
    winnerSquadId: string | null;
    initiatingCardPower: number;
    rivalCardPower: number | null;
  } | null;
}

export interface ConquestSession {
  id: string;
  venueId: number;
  venueName: string;
  startedAt: string;
  autoEndsAt: string;
  secondsRemaining: number;
  isClashActive: boolean;
  clashPartnerSquadId: string | null;
  clashPartnerSquadName: string | null;
  copresentCount: number;
  state: 'active' | 'revealed' | 'expired';
  clashRivals?: ClashRival[];
}

export interface ConquestBattle {
  id: string;
  venueId: number;
  initiatingSquadId: string;
  rivalSquadId: string;
  initiatingCardPower: number;
  rivalCardPower: number | null;
  winnerSquadId: string | null;
  initiatedAt: string;
  revealAt: string;
  counterAttackWindowEndsAt: string;
  battleNumber: number;
  isCounterAttack: boolean;
  parentBattleId: string | null;
  revealed: boolean;
}

export interface ConquestAlert {
  id: string;
  squadId: string;
  recipientProfileId: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface SquadCardData {
  squadId: string;
  cardPowerInf: number;
  cardLevelMultiplier: number;
  venuesOwnedCount: number;
  activeMembersThisWeek: number;
  lastComputedAt: string;
}

export interface VenueLeaderboardEntry {
  rank: number;
  squadId: string;
  squadName: string;
  squadEmoji: string;
  totalInf: number;
  isOverlord: boolean;
}

export interface ConquestImpactBreakdown {
  baseInf: number;
  copresentBonus: number;
  clashMultiplier: number;
  overlordMultiplier: number;
  cardBonus: number;
  totalInf: number;
  xpAwarded: number;
  venueName: string;
  venueRank: number | null;
  prevRank: number | null;
  rivalSquadName: string | null;
  rivalSquadEmoji: string | null;
  notifiedMemberCount: number;
  battles: Array<{
    battleNumber: number;
    isCounterAttack: boolean;
    initiatingSquadId: string;
    initiatingPower: number;
    rivalPower: number;
    winnerSquadId: string | null;
  }>;
}
