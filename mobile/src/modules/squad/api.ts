import { useAuthStore } from '../../stores/authStore';
import type {
  Squad, SquadPreview, CreateSquadPayload, SquadInviteEnriched,
  SquadDisbandedNotice, NearbySquad,
  SquadChest, FeedItem, SquadStreak, LeaderboardData,
  CheckinPayload, ChestOpenResult,
} from './types';

function authedFetch(path: string, init?: RequestInit) {
  return useAuthStore.getState().authedFetch(path, init);
}

export async function createSquad(payload: CreateSquadPayload) {
  const res = await authedFetch('/api/squads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ squad: Squad & { code: string }; member: { role: string; joinedAt: string } }>;
}

export async function getMySquad() {
  const res = await authedFetch('/api/squads/my');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{
    squad: Squad | null;
    myRole?: string;
    joinedAt?: string;
    disbandedNotice?: SquadDisbandedNotice | null;
  }>;
}

export function disbandDismissKey(squadId: string) {
  return `squadd_dismissed_disband_${squadId}`;
}

export async function sendInvites(
  squadId: string,
  profileIds: string[],
  notOnAppUserIds: string[] = [],
  podId?: string,
) {
  const res = await authedFetch(`/api/squads/${squadId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ profileIds, notOnAppUserIds, ...(podId ? { podId } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{
    invited: Array<{ profileId: string; displayName: string | null }>;
    resent?: Array<{ profileId: string; displayName: string | null; inviteId: number }>;
    notOnApp: Array<{ userId: string; name: string }>;
  }>;
}

export async function resendInvite(squadId: string, inviteId: number) {
  const res = await authedFetch(`/api/squads/${squadId}/invite/${inviteId}/resend`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function cancelInvite(squadId: string, inviteId: number) {
  const res = await authedFetch(`/api/squads/${squadId}/invite/${inviteId}/cancel`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function getInviteStatus(squadId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/invite-status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ invites: SquadInviteEnriched[] }>;
}

export async function acceptInvite(squadId: string, inviteId: number) {
  const res = await authedFetch(`/api/squads/${squadId}/invite/${inviteId}/accept`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; welcomeChestClaimed: boolean }>;
}

export async function declineInvite(squadId: string, inviteId: number) {
  const res = await authedFetch(`/api/squads/${squadId}/invite/${inviteId}/decline`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getPendingInvite(): Promise<{ id: number; squadId: string; preview: SquadPreview } | null> {
  const res = await authedFetch('/api/squads/pending-invite');
  if (!res.ok) return null;
  const data = await res.json();
  return data.invite ?? null;
}

export async function getSquadByCode(code: string): Promise<SquadPreview> {
  const res = await authedFetch(`/api/squads/by-code/${code}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getSquadPreview(squadId: string): Promise<SquadPreview> {
  const res = await authedFetch(`/api/squads/${squadId}/preview`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function joinByCode(code: string) {
  const res = await authedFetch('/api/squads/join-by-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ squad: Squad; welcomeChestClaimed: boolean }>;
}

export async function ensurePodForSquad(squadId: string): Promise<{ podId: string; created: boolean } | undefined> {
  const res = await authedFetch('/api/pods/ensure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ squadId }),
  });
  if (!res.ok) return undefined; // silent — GET /api/squads/my self-heals anyway
  return res.json() as Promise<{ podId: string; created: boolean }>;
}

export async function shareLink(squadId: string) {
  const res = await authedFetch('/api/squads/share-link', {
    method: 'POST',
    body: JSON.stringify({ squadId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ url: string; cardUrl: string; rateLimited?: boolean }>;
}

export async function leaveSquad(squadId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/leave`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getNearbySquads(lat: number, lng: number, radiusKm = 10) {
  const res = await authedFetch(
    `/api/squads/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ squads: NearbySquad[] }>;
}

export async function removeMember(squadId: string, profileId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/members/${profileId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function disbandSquad(squadId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/disband`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Squad Management API calls (F1, F2) ───────────────────────────

export async function transferFounder(squadId: string, profileId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/members/${profileId}/transfer-founder`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

export async function updateSquad(
  squadId: string,
  data: { name?: string; emoji?: string; isPublic?: boolean; showDupr?: boolean },
) {
  const res = await authedFetch(`/api/squads/${squadId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; squad: any }>;
}

export async function checkNickname(handle: string) {
  const res = await authedFetch(`/api/players/nickname-check?handle=${encodeURIComponent(handle)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ available: boolean }>;
}

export async function updateHandle(handle: string) {
  const res = await authedFetch('/api/players/profile', {
    method: 'PATCH',
    body: JSON.stringify({ handle }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean; handle: string }>;
}

// ── Phase 2 API calls ──────────────────────────────────────────────

export interface NearbyVenue {
  id: number;
  name: string;
  address: string;
  distance: number;
}

export async function getNearbyVenues(lat: number, lng: number, radiusKm = 15) {
  const res = await authedFetch(
    `/api/venues/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ venues: NearbyVenue[]; fallback?: boolean }>;
}
export async function resetDevCheckinFlow() {
  const res = await authedFetch('/api/squads/dev/reset-flow', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{
    ok: boolean;
    cleared: { chests: number; radarSessions: number; pulseCooldowns: number };
  }>;
}

export async function checkin(payload: CheckinPayload) {
  const res = await authedFetch('/api/squads/checkin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ chest: { id: string; expiresAt: string }; xpAwarded: number }>;
}

export async function tapChest(chestId: string) {
  const res = await authedFetch(`/api/squads/chests/${chestId}/tap`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ opening: { status: string; unlocksAt: string } }>;
}

export async function openChest(chestId: string) {
  const res = await authedFetch(`/api/squads/chests/${chestId}/open`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ChestOpenResult>;
}

export async function nudgeChest(squadId: string, chestId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/nudge`, {
    method: 'POST',
    body: JSON.stringify({ chestId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ nudged: number }>;
}

export async function getSquadChests(squadId: string, status: 'active' | 'all' = 'active') {
  const res = await authedFetch(`/api/squads/${squadId}/chests?status=${status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ chests: SquadChest[] }>;
}

export async function getSquadFeed(squadId: string) {
  const res = await authedFetch(`/api/squads/${squadId}/feed`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ feed: FeedItem[] }>;
}

export async function getLeaderboard(city = 'hcm') {
  const res = await authedFetch(`/api/squads/leaderboard?city=${city}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<LeaderboardData>;
}
