import { useState, useEffect, useRef, useCallback } from 'react';
import * as conquestApi from '../conquestApi';
import type { ConquestSession, ConquestBattle } from '../types';
import { useAuthStore } from '../../../stores/authStore';

interface ConquestState {
  activeSession: ConquestSession | null;
  sessionLoading: boolean;
  activeBattle: ConquestBattle | null;
  battleLoading: boolean;
  unreadAlertCount: number;
  completedSessionId: string | null;
}

interface UseConquestReturn extends ConquestState {
  lastSessionError: string | null;
  refreshSession: () => Promise<void>;
  setBattle: (battle: ConquestBattle | null) => void;
  clearCompletedSession: () => void;
  refreshAlertBadge: () => Promise<void>;
}

const SESSION_POLL_MS = 5000;
const BATTLE_POLL_MS = 3000;

export function useConquest(): UseConquestReturn {
  const jwt = useAuthStore((s) => s.jwt);
  const [activeSession, setActiveSession] = useState<ConquestSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [activeBattle, setActiveBattle] = useState<ConquestBattle | null>(null);
  const [battleLoading, setBattleLoading] = useState(false);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [lastSessionError, setLastSessionError] = useState<string | null>(null);

  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const battlePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSessionRef = useRef<ConquestSession | null>(null);

  const refreshSession = useCallback(async () => {
    // Guard: don't call API before JWT is ready
    if (!useAuthStore.getState().jwt) return;
    try {
      const { session } = await conquestApi.getActiveSession();

      // Detect session just ended (was active, now null)
      if (!session && prevSessionRef.current && prevSessionRef.current.state === 'active') {
        setCompletedSessionId(prevSessionRef.current.id);
      }

      setActiveSession(session);
      prevSessionRef.current = session;
      setLastSessionError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLastSessionError(message);
    }
  }, []);

  const refreshAlertBadge = useCallback(async () => {
    if (!useAuthStore.getState().jwt) return;
    try {
      const { alerts } = await conquestApi.getAlerts();
      const unread = alerts.filter(a => !a.readAt).length;
      setUnreadAlertCount(unread);
    } catch {
      // silently fail
    }
  }, []);

  // Boot: load session + alert badge — fires when JWT becomes available
  useEffect(() => {
    if (!jwt) return; // wait until authenticated
    setSessionLoading(true);
    refreshSession().finally(() => setSessionLoading(false));
    refreshAlertBadge();
  }, [jwt, refreshSession, refreshAlertBadge]);

  // Poll active session every 5s when we have one
  useEffect(() => {
    if (activeSession) {
      if (!sessionPollRef.current) {
        sessionPollRef.current = setInterval(refreshSession, SESSION_POLL_MS);
      }
    } else {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    }
    return () => {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    };
  }, [!!activeSession, refreshSession]);

  // Poll battle state every 3s until revealed flag is true
  // Note: winnerSquadId is pre-computed server-side immediately, so we poll on !revealed only
  useEffect(() => {
    const shouldPoll = activeBattle && !activeBattle.revealed;

    if (shouldPoll) {
      const poll = async () => {
        try {
          const { battle } = await conquestApi.getBattleState(activeBattle!.id);
          setActiveBattle(battle);
          if (battle.revealed) {
            if (battlePollRef.current) {
              clearInterval(battlePollRef.current);
              battlePollRef.current = null;
            }
          }
        } catch {
          // silently fail
        }
      };

      battlePollRef.current = setInterval(poll, BATTLE_POLL_MS);
    } else {
      if (battlePollRef.current) {
        clearInterval(battlePollRef.current);
        battlePollRef.current = null;
      }
    }

    return () => {
      if (battlePollRef.current) {
        clearInterval(battlePollRef.current);
        battlePollRef.current = null;
      }
    };
  }, [activeBattle?.id, activeBattle?.revealed]);

  const setBattle = useCallback((battle: ConquestBattle | null) => {
    setBattleLoading(false);
    setActiveBattle(battle);
  }, []);

  const clearCompletedSession = useCallback(() => {
    setCompletedSessionId(null);
  }, []);

  return {
    activeSession,
    sessionLoading,
    activeBattle,
    battleLoading,
    unreadAlertCount,
    completedSessionId,
    lastSessionError,
    refreshSession,
    setBattle,
    clearCompletedSession,
    refreshAlertBadge,
  };
}

// Utility: format seconds as HH:MM:SS or MM:SS
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Utility: relative time label
export function timeAgoLabel(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
