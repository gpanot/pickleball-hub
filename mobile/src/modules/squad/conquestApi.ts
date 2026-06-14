import { useAuthStore } from '../../stores/authStore';
import type {
  ConquestSession,
  ConquestBattle,
  ConquestAlert,
  SquadCardData,
  VenueLeaderboardEntry,
  ConquestImpactBreakdown,
} from './types';

function authedFetch(path: string, init?: RequestInit) {
  return useAuthStore.getState().authedFetch(path, init);
}

async function parseApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string; message?: string };
    return json.error ?? json.message ?? `HTTP ${res.status}`;
  } catch {
    return text.trim().slice(0, 120) || `HTTP ${res.status}`;
  }
}

// ── Pulse ──────────────────────────────────────────────────────────

export async function dropPulse(venueId: number, taggedProfileIds?: string[]) {
  const res = await authedFetch('/api/conquest/pulse', {
    method: 'POST',
    body: JSON.stringify({ venueId, taggedProfileIds: taggedProfileIds ?? [] }),
  });
  if (res.status === 409) {
    // Already have an active session — treat as success so UI can refresh
    return res.json().catch(() => ({ sessionId: null }));
  }
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json() as Promise<{
    sessionId: string;
    autoEndsAt: string;
    clashDetected: boolean;
    rivalSquadId: string | null;
    cooldownEndsAt: string;
  }>;
}

// ── Session ────────────────────────────────────────────────────────

export async function getActiveSession() {
  const res = await authedFetch('/api/conquest/session/active');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ session: ConquestSession | null }>;
}

export async function getShareData(sessionId: string) {
  const res = await authedFetch(`/api/conquest/session/${sessionId}/share`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ConquestImpactBreakdown>;
}

// ── Battle ─────────────────────────────────────────────────────────

export async function initiateBattle(venueId: number) {
  const res = await authedFetch('/api/conquest/battle', {
    method: 'POST',
    body: JSON.stringify({ venueId }),
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  // API returns { battleId, revealAt, yourCardPower, state } — wrap into battle-like shape
  const raw = await res.json() as {
    battleId: string;
    revealAt: string;
    yourCardPower: number;
    state: string;
  };
  // Build a minimal ConquestBattle from the POST response so the battle screen can render
  const battle: ConquestBattle = {
    id: raw.battleId,
    venueId,
    initiatingSquadId: '',
    rivalSquadId: '',
    initiatingCardPower: raw.yourCardPower,
    rivalCardPower: null,
    winnerSquadId: null,
    initiatedAt: new Date().toISOString(),
    revealAt: raw.revealAt,
    counterAttackWindowEndsAt: '',
    battleNumber: 1,
    isCounterAttack: false,
    parentBattleId: null,
    revealed: false,
  };
  return { battle };
}

export async function getBattleState(battleId: string) {
  const res = await authedFetch(`/api/conquest/battle/${battleId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ battle: ConquestBattle }>;
}

export async function counterAttack(battleId: string) {
  const res = await authedFetch(`/api/conquest/battle/${battleId}/counter`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error(await parseApiError(res));
  }
  return res.json() as Promise<{ battle: ConquestBattle }>;
}

// ── Card & Venue ───────────────────────────────────────────────────

export async function getCooldown(venueId: number) {
  const res = await authedFetch(`/api/conquest/cooldown/${venueId}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ onCooldown: boolean; cooldownEndsAt: string | null }>;
}

export async function getSquadCard() {
  const res = await authedFetch('/api/conquest/card');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ card: SquadCardData }>;
}

export async function getVenueRadar(venueId: number) {
  const res = await authedFetch(`/api/conquest/venue/${venueId}/radar`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{
    friendlyBlips: Array<{ playerId: string; displayName: string }>;
    hasRival: boolean;
    rivalBlipCount: number;
  }>;
}

export async function getVenueLeaderboard(venueId: number) {
  const res = await authedFetch(`/api/conquest/venue/${venueId}/leaderboard`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ entries: VenueLeaderboardEntry[]; venueName: string }>;
}

// ── Alerts ─────────────────────────────────────────────────────────

export async function getAlerts(cursor?: string) {
  const url = cursor
    ? `/api/conquest/alerts?cursor=${encodeURIComponent(cursor)}`
    : '/api/conquest/alerts';
  const res = await authedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ alerts: ConquestAlert[]; nextCursor: string | null }>;
}

export async function markAlertsRead() {
  const res = await authedFetch('/api/conquest/alerts/read', { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}
