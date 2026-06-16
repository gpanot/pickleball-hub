import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../stores/authStore';
import { useSignUpModal } from '../../contexts/SignUpModalContext';
import { useSquad } from './hooks/useSquad';
import { useConquest } from './hooks/useConquest';
import { getPendingInvite, disbandDismissKey, resetDevCheckinFlow, tapChest, openChest } from './api';
import * as conquestApi from './conquestApi';
import type { SquadScreen, SquadDisbandedNotice } from './types';
import type { Squad, SquadPreview, ConquestBattle, SquadCardData, ConquestImpactBreakdown } from './types';

import { SquadCarouselScreen } from './screens/SquadCarouselScreen';
import { SquadGateScreen } from './screens/SquadGateScreen';
import { SquadReadyScreen } from './screens/SquadReadyScreen';
import { SquadCreateScreen } from './screens/SquadCreateScreen';
import { SquadInviteScreen } from './screens/SquadInviteScreen';
import { SquadCreatedScreen } from './screens/SquadCreatedScreen';
import { SquadHomeScreen } from './screens/SquadHomeScreen';
import { SquadInviteReceiveScreen } from './screens/SquadInviteReceiveScreen';
import { SquadDisbandedScreen } from './screens/SquadDisbandedScreen';
import { SquadDisbandConfirmScreen } from './screens/SquadDisbandConfirmScreen';
import { SquadLeaveConfirmScreen } from './screens/SquadLeaveConfirmScreen';
import { SquadBrowseScreen } from './screens/SquadBrowseScreen';
import { SquadNicknameScreen } from './screens/SquadNicknameScreen';
import { SquadChestDetailScreen } from './screens/SquadChestDetailScreen';
import { SquadChestOpenScreen } from './screens/SquadChestOpenScreen';
import { SquadManageScreen } from './screens/SquadManageScreen';
import { SquadEditScreen } from './screens/SquadEditScreen';
import { CityLeaderboardScreen } from './screens/CityLeaderboardScreen';
import { CheckInSheet } from './screens/CheckInSheet';
// Phase 4 Conquest screens
import { ConquestLiveBanner } from './components/ConquestLiveBanner';
import { ConquestActiveSessionScreen } from './screens/ConquestActiveSessionScreen';
import { ConquestRivalRevealScreen } from './screens/ConquestRivalRevealScreen';
import {
  ConquestBattleScreen,
  ConquestBattleWinScreen,
  ConquestBattleLoseScreen,
} from './screens/ConquestBattleScreen';
import { ConquestImpactRevealScreen } from './screens/ConquestImpactRevealScreen';
import { ConquestShareScreen } from './screens/ConquestShareScreen';
import { ConquestAlertsScreen } from './screens/ConquestAlertsScreen';
import type { SquadChest, FeedItem, SquadStreak, ChestOpenResult, PlayerContribution } from './types';
import {
  HAS_SEEN_CAROUSEL_KEY,
  subscribeSquaddOnboardingReset,
} from './squadOnboarding';
import { debugLog } from '../../lib/debug';

const FOLLOWS_THRESHOLD = 4;
const PENDING_INVITE_KEY = 'squadd_pending_invite';

interface SquadModuleProps {
  deeplinkCode?: string | null;
  deeplinkInviteId?: string | null;
  deeplinkSquadId?: string | null;
  onNavigateToPlayers?: () => void;
  isActive?: boolean;
}

export default function SquadModule({
  deeplinkCode,
  deeplinkInviteId,
  deeplinkSquadId,
  onNavigateToPlayers,
  isActive,
}: SquadModuleProps) {
  const jwt = useAuthStore((s) => s.jwt);
  const profileId = useAuthStore((s) => s.profileId);
  const { openSignUp } = useSignUpModal();
  const [screen, setScreen] = useState<SquadScreen>('carousel');
  const [createdSquad, setCreatedSquad] = useState<Squad | null>(null);
  const [inviteResult, setInviteResult] = useState<{ invited: Array<{name: string}>; notOnApp: Array<{name: string}> } | null>(null);
  const [receiveCode, setReceiveCode] = useState<string | null>(null);
  const [receiveInviteId, setReceiveInviteId] = useState<number | null>(null);
  const [receiveSquadId, setReceiveSquadId] = useState<string | null>(null);
  const [carouselKey, setCarouselKey] = useState(0);
  const [carouselCanExit, setCarouselCanExit] = useState(false);
  const [inviteReturnScreen, setInviteReturnScreen] = useState<SquadScreen>('create');
  const [activeChest, setActiveChest] = useState<SquadChest | null>(null);
  const [recentFeed, setRecentFeed] = useState<FeedItem[]>([]);
  const [streak, setStreak] = useState<SquadStreak>({ days: 0, lastPlayedAt: null });
  const [myContribution, setMyContribution] = useState<PlayerContribution>({ sessions: 0, xpEarned: 0, chestsOpened: 0 });
  const [cityRank, setCityRank] = useState<number | null>(null);
  const [selectedChest, setSelectedChest] = useState<SquadChest | null>(null);
  const [chestOpenResult, setChestOpenResult] = useState<ChestOpenResult | null>(null);
  const [showCheckinSheet, setShowCheckinSheet] = useState(false);
  // Phase 4 Conquest state
  const [conquestCardData, setConquestCardData] = useState<SquadCardData | null>(null);
  const [conquestImpactData, setConquestImpactData] = useState<ConquestImpactBreakdown | null>(null);
  const [conquestSessionId, setConquestSessionId] = useState<string | null>(null);
  const [battlePending, setBattlePending] = useState(false);
  const [pendingBattleId, setPendingBattleId] = useState<string | null>(null);
  // Dev debug: last check-in / pulse (My Squadd screen panel)
  const initializedRef = useRef(false);
  const pendingCarouselContinueRef = useRef(false);
  const pushRouteLog = useCallback((msg: string) => {
    const ts = new Date().toISOString().substring(11, 19);
    debugLog('SQUADD', `[${ts}] ${msg}`);
  }, []);

  const {
    squad, myRole, disbandedNotice, loading, error,
    fetchMySquad, create, invite,
    fetchInviteStatus, accept, decline,
    fetchByCode, joinByCode, leave, disband,
    cancelInvite, resend, removeMember,
  } = useSquad();

  const {
    activeSession,
    activeBattle,
    unreadAlertCount,
    completedSessionId,
    sessionLoading,
    refreshSession,
    setBattle,
    clearCompletedSession,
    refreshAlertBadge,
  } = useConquest();

  // Refresh conquest data whenever this tab becomes active
  useEffect(() => {
    if (!isActive) return;
    void refreshSession();
    void refreshAlertBadge();
  }, [isActive, refreshSession, refreshAlertBadge]);

  // When a session completes, navigate to impact reveal
  useEffect(() => {
    if (!completedSessionId) return;
    setConquestSessionId(completedSessionId);
    clearCompletedSession();
    conquestApi.getShareData(completedSessionId)
      .then(data => {
        setConquestImpactData(data);
        setScreen('conquest-impact');
      })
      .catch(() => {
        // Session ended but share data failed — just go home
      });
  }, [completedSessionId, clearCompletedSession]);

  const shouldShowDisbanded = useCallback(async (notice: SquadDisbandedNotice | null | undefined) => {
    if (!notice) return false;
    const dismissed = await AsyncStorage.getItem(disbandDismissKey(notice.squadId));
    return dismissed !== '1';
  }, []);

  const tryRouteDisbanded = useCallback(async (notice: SquadDisbandedNotice | null | undefined) => {
    if (!(await shouldShowDisbanded(notice))) return false;
    pushRouteLog(`→ disbanded (${notice!.squadName})`);
    setScreen('disbanded');
    return true;
  }, [shouldShowDisbanded, pushRouteLog]);

  const dismissDisbanded = useCallback(async (notice: SquadDisbandedNotice) => {
    await AsyncStorage.setItem(disbandDismissKey(notice.squadId), '1');
  }, []);

  const resolveActiveAuth = useCallback(async () => {
    let activeJwt = jwt;
    let activeProfileId = profileId;

    if (__DEV__ && (!activeJwt || activeJwt === 'dev-token')) {
      const ok = await useAuthStore.getState().ensureServerAuth();
      if (ok) {
        activeJwt = useAuthStore.getState().jwt;
        activeProfileId = useAuthStore.getState().profileId;
      }
    }

    return { activeJwt, activeProfileId };
  }, [jwt, profileId]);

  /** Route signed-in users to home / gate / ready (never create). */
  const extractPhase2Data = useCallback((data: any) => {
    if (!data) return;
    if (data.activeChest !== undefined) setActiveChest(data.activeChest);
    if (data.recentFeed !== undefined) setRecentFeed(data.recentFeed);
    if (data.streak !== undefined) setStreak(data.streak);
    if (data.myContribution !== undefined) setMyContribution(data.myContribution);
    if (data.mySquad?.rank !== undefined) setCityRank(data.mySquad.rank);
  }, []);

  const handleDevReset = useCallback(async () => {
    try {
      const result = await resetDevCheckinFlow();
      setActiveChest(null);
      const [data] = await Promise.all([
        fetchMySquad(),
        refreshSession(),
        refreshAlertBadge(),
      ]);
      extractPhase2Data(data);
      const { chests, radarSessions, pulseCooldowns } = result.cleared;
      Alert.alert(
        'Flow reset',
        `Cleared ${chests} chest(s), ${radarSessions} session(s), ${pulseCooldowns} cooldown(s). You can check in again.`,
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Reset failed';
      Alert.alert('Reset failed', message);
      throw e;
    }
  }, [fetchMySquad, refreshSession, refreshAlertBadge, extractPhase2Data]);

  const routeToSignedInScreen = useCallback(async () => {
    const { activeJwt, activeProfileId } = await resolveActiveAuth();

    if (!activeJwt || !activeProfileId) {
      pushRouteLog('routeToSignedIn: no auth → carousel');
      setScreen('carousel');
      return;
    }

    const squadData = await fetchMySquad();
    extractPhase2Data(squadData);
    if (squadData?.squad) {
      pushRouteLog(`routeToSignedIn: squad "${squadData.squad.name}" → home`);
      setScreen('home');
      return;
    }

    if (await tryRouteDisbanded(squadData?.disbandedNotice)) return;

    try {
      const pending = await getPendingInvite();
      if (pending) {
        pushRouteLog(`routeToSignedIn: pending invite → invite-receive (squad=${pending.preview.name})`);
        setReceiveInviteId(pending.id);
        setReceiveSquadId(pending.squadId);
        setScreen('invite-receive');
        return;
      }
    } catch {}

    try {
      const res = await useAuthStore.getState().authedFetch('/api/follows');
      if (res.ok) {
        const data = await res.json();
        const followCount = Array.isArray(data) ? data.length : 0;
        if (followCount < FOLLOWS_THRESHOLD) {
          pushRouteLog(`routeToSignedIn: follows=${followCount} → gate`);
          setScreen('gate');
          return;
        }
      }
    } catch {}

    pushRouteLog('routeToSignedIn: no squad → ready');
    setScreen('ready');
  }, [resolveActiveAuth, fetchMySquad, tryRouteDisbanded, pushRouteLog]);

  const showCarouselFromStart = useCallback(() => {
    setCarouselKey((k) => k + 1);
    setScreen('carousel');
  }, []);

  const continueAfterCarousel = useCallback(async () => {
    await AsyncStorage.setItem(HAS_SEEN_CAROUSEL_KEY, '1');
    await routeToSignedInScreen();
  }, [routeToSignedInScreen]);

  const routeIfHasSquad = useCallback(async (): Promise<boolean> => {
    const { activeJwt, activeProfileId } = await resolveActiveAuth();
    if (!activeJwt || !activeProfileId) {
      pushRouteLog('routeIfHasSquad: skip (no auth)');
      return false;
    }
    const squadData = await fetchMySquad();
    if (!squadData?.squad) {
      pushRouteLog('routeIfHasSquad: API returned no squad');
      if (await tryRouteDisbanded(squadData?.disbandedNotice)) return true;
      return false;
    }
    pushRouteLog(`routeIfHasSquad: "${squadData.squad.name}" → home`);
    setScreen('home');
    return true;
  }, [resolveActiveAuth, fetchMySquad, tryRouteDisbanded, pushRouteLog]);

  const syncSquaddRoute = useCallback(async (reason: string) => {
    pushRouteLog(`sync (${reason})`);
    if (deeplinkCode || deeplinkInviteId || deeplinkSquadId) return;
    if (await routeIfHasSquad()) return;
    const seen = await AsyncStorage.getItem(HAS_SEEN_CAROUSEL_KEY);
    if (seen !== '1') {
      pushRouteLog('sync → carousel (carousel not done)');
      showCarouselFromStart();
      return;
    }
    await routeToSignedInScreen();
  }, [deeplinkCode, deeplinkInviteId, deeplinkSquadId, routeIfHasSquad, routeToSignedInScreen, showCarouselFromStart, pushRouteLog]);

  const returnToCarouselIfNeeded = useCallback(async () => {
    if (deeplinkCode || deeplinkInviteId || deeplinkSquadId) return;
    await syncSquaddRoute('onboarding reset');
  }, [deeplinkCode, deeplinkInviteId, syncSquaddRoute]);

  const handleCarouselCta = useCallback(async () => {
    const { activeJwt, activeProfileId } = await resolveActiveAuth();

    if (!activeJwt || !activeProfileId) {
      pendingCarouselContinueRef.current = true;
      openSignUp();
      return;
    }

    await continueAfterCarousel();
  }, [resolveActiveAuth, openSignUp, continueAfterCarousel]);

  useEffect(() => {
    if (!pendingCarouselContinueRef.current) return;
    if (!jwt || !profileId) return;
    pendingCarouselContinueRef.current = false;
    continueAfterCarousel();
  }, [jwt, profileId, continueAfterCarousel]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      if (deeplinkCode) {
        setReceiveCode(deeplinkCode);
        setScreen('invite-receive');
        pushRouteLog('boot → invite-receive (deeplink code)');
        return;
      }
      if (deeplinkInviteId || deeplinkSquadId) {
        if (deeplinkInviteId) setReceiveInviteId(parseInt(deeplinkInviteId, 10));
        if (deeplinkSquadId) setReceiveSquadId(deeplinkSquadId);
        setScreen('invite-receive');
        pushRouteLog(`boot → invite-receive (push invite squadId=${deeplinkSquadId} inviteId=${deeplinkInviteId})`);
        return;
      }
      await syncSquaddRoute('boot');
    })();
  }, [deeplinkCode, deeplinkInviteId, deeplinkSquadId, syncSquaddRoute, pushRouteLog]);

  useEffect(() => subscribeSquaddOnboardingReset(() => {
    pendingCarouselContinueRef.current = false;
    void returnToCarouselIfNeeded();
  }), [returnToCarouselIfNeeded]);

  useEffect(() => {
    if (!isActive) return;
    // Pick up conquest push notification routing flag
    const conquestScreen = (globalThis as any).__conquestPushScreen;
    if (conquestScreen) {
      delete (globalThis as any).__conquestPushScreen;
      pushRouteLog(`runtime push → ${conquestScreen}`);
      // When routing to rival reveal via push, first refresh session + load card data
      if (conquestScreen === 'conquest-rival-reveal') {
        void refreshSession().then(async () => {
          try {
            const card = await conquestApi.getSquadCard();
            setConquestCardData(card.card);
          } catch {}
          setScreen('conquest-rival-reveal');
        });
        return;
      }
      // When routing to INF reveal via push, fetch session share data then show impact screen
      if (conquestScreen === 'conquest-session-reveal') {
        const sessionId = (globalThis as any).__conquestPushSessionId;
        delete (globalThis as any).__conquestPushSessionId;
        if (sessionId) {
          void (async () => {
            try {
              const data = await conquestApi.getShareData(sessionId);
              setConquestImpactData(data);
              setConquestSessionId(sessionId);
              setScreen('conquest-impact');
            } catch {
              setScreen('conquest-alerts');
            }
          })();
          return;
        }
        setScreen('conquest-alerts');
        return;
      }
      // When routing to battle result via push, fetch the battle first
      if (conquestScreen === 'conquest-battle-result') {
        const battleId = (globalThis as any).__conquestPushBattleId;
        const result = (globalThis as any).__conquestPushBattleResult;
        delete (globalThis as any).__conquestPushBattleId;
        delete (globalThis as any).__conquestPushBattleResult;
        if (battleId) {
          void (async () => {
            try {
              const { battle } = await conquestApi.getBattleState(battleId);
              if (battle) {
                setBattle(battle);
                // Use squad from state to determine win/loss
                const mySquad = squad;
                if (mySquad) {
                  const won = battle.winnerSquadId === mySquad.id || result === 'won';
                  setScreen(won ? 'conquest-battle-win' : 'conquest-battle-lose');
                  return;
                }
              }
            } catch {}
            setScreen('conquest-alerts');
          })();
          return;
        }
        setScreen('conquest-alerts');
        return;
      }
      setScreen(conquestScreen as SquadScreen);
      return;
    }
    if (deeplinkSquadId || deeplinkInviteId) {
      if (deeplinkInviteId) setReceiveInviteId(parseInt(deeplinkInviteId, 10));
      if (deeplinkSquadId) setReceiveSquadId(deeplinkSquadId);
      setScreen('invite-receive');
      pushRouteLog(`runtime push → invite-receive (squadId=${deeplinkSquadId})`);
      return;
    }
    void syncSquaddRoute('tab active');
  }, [isActive, jwt, profileId, deeplinkSquadId, deeplinkInviteId, syncSquaddRoute, pushRouteLog]);

  useEffect(() => {
    AsyncStorage.getItem(HAS_SEEN_CAROUSEL_KEY).then((v) => {
      if (screen === 'carousel') setCarouselCanExit(v === '1');
    });
  }, [screen, carouselKey]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && (screen === 'home' || screen === 'disbanded')) {
        void fetchMySquad().then(async (data) => {
          if (!data?.squad && data?.disbandedNotice && screen === 'home') {
            await tryRouteDisbanded(data.disbandedNotice);
          }
        });
      }
    });
    return () => sub.remove();
  }, [screen, fetchMySquad, tryRouteDisbanded]);

  useEffect(() => {
    if (screen !== 'home' || loading || squad) return;
    void (async () => {
      if (await tryRouteDisbanded(disbandedNotice)) return;
      await routeToSignedInScreen();
    })();
  }, [screen, squad, loading, disbandedNotice, tryRouteDisbanded, routeToSignedInScreen]);

  const handleCreateSquad = useCallback(async (payload: Parameters<typeof create>[0]) => {
    const result = await create(payload);
    setCreatedSquad(result.squad);
    setInviteReturnScreen('create');
    setScreen('invite');
    return result;
  }, [create]);

  const handleInvitesSent = useCallback((result: { invited: Array<{name: string}>; notOnApp: Array<{name: string}> }) => {
    setInviteResult(result);
    setScreen('created');
  }, []);

  const handleJoin = useCallback(async (code?: string, inviteId?: number, squadId?: string) => {
    if (code) {
      await joinByCode(code);
    } else if (inviteId && squadId) {
      await accept(squadId, inviteId);
    }
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    setScreen('home');
  }, [joinByCode, accept]);

  const handleMaybeLater = useCallback(async (preview: SquadPreview | null, inviteId?: number) => {
    if (preview) {
      await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ ...preview, inviteId }));
    }
    setScreen('ready');
  }, []);

  const handleBrowseJoin = useCallback((code: string) => {
    setReceiveCode(code);
    setReceiveInviteId(null);
    setReceiveSquadId(null);
    setScreen('invite-receive');
  }, []);

  const handleExitSquad = useCallback(async () => {
    if (!squad) return;
    if (myRole === 'founder') {
      await disband(squad.id);
    } else {
      await leave(squad.id);
    }
    setCreatedSquad(null);
    await routeToSignedInScreen();
  }, [squad, myRole, disband, leave, routeToSignedInScreen]);

  return (
    <View style={styles.container}>
      {screen === 'carousel' && (
        <SquadCarouselScreen
          key={carouselKey}
          onCreateSquad={handleCarouselCta}
          onBackFromStart={carouselCanExit ? () => void routeToSignedInScreen() : undefined}
        />
      )}
      {screen === 'gate' && (
        <SquadGateScreen
          onNavigateToCircle={() => onNavigateToPlayers?.()}
          onBack={() => showCarouselFromStart()}
          followsThreshold={FOLLOWS_THRESHOLD}
        />
      )}
      {screen === 'ready' && (
        <SquadReadyScreen
          onCreateSquad={() => setScreen('nickname')}
          onBrowseSquads={() => setScreen('browse')}
          onAcceptInvite={(code) => {
            setReceiveCode(code);
            setScreen('invite-receive');
          }}
          onJoinSquad={handleBrowseJoin}
          onBack={() => showCarouselFromStart()}
        />
      )}
      {screen === 'browse' && (
        <SquadBrowseScreen
          onJoinSquad={handleBrowseJoin}
          onBack={() => setScreen('ready')}
        />
      )}
      {screen === 'nickname' && (
        <SquadNicknameScreen
          onConfirmed={() => setScreen('create')}
          onBack={() => setScreen('ready')}
        />
      )}
      {screen === 'create' && (
        <SquadCreateScreen
          onCreated={handleCreateSquad}
          onBack={() => setScreen('nickname')}
          loading={loading}
        />
      )}
      {screen === 'invite' && createdSquad && (
        <SquadInviteScreen
          squad={createdSquad}
          onInvitesSent={handleInvitesSent}
          onSkip={() => setScreen('created')}
          onBack={() => setScreen(inviteReturnScreen)}
        />
      )}
      {screen === 'created' && createdSquad && (
        <SquadCreatedScreen
          squad={createdSquad}
          inviteResult={inviteResult}
          onGoToSquad={() => { void fetchMySquad(); setScreen('home'); }}
          onInviteMore={() => {
            setInviteReturnScreen('created');
            setScreen('invite');
          }}
          onBack={() => setScreen('invite')}
        />
      )}
      {screen === 'home' && squad && (
        <>
          <SquadHomeScreen
            squad={squad}
            myRole={myRole}
            myProfileId={profileId}
            loading={loading}
            activeChest={activeChest}
            recentFeed={recentFeed}
            streak={streak}
            myContribution={myContribution}
            cityRank={cityRank}
            onRefresh={async () => {
              const [data] = await Promise.all([
                fetchMySquad(),
                refreshSession(),
                refreshAlertBadge(),
              ]);
              extractPhase2Data(data);
            }}
            onCancelInvite={async (inviteId) => {
              await cancelInvite(squad.id, inviteId);
            }}
            onResendInvite={async (inviteId) => {
              await resend(squad.id, inviteId);
            }}
            onResendCard={() => {
              setCreatedSquad(squad);
              setInviteResult(null);
              setScreen('created');
            }}
            onInviteMore={() => {
              setCreatedSquad(squad);
              setInviteReturnScreen('home');
              setScreen('invite');
            }}
            onExitSquad={handleExitSquad}
            onRemoveMember={async (memberProfileId, _name) => {
              await removeMember(squad.id, memberProfileId);
            }}
            onDisbandPress={() => setScreen('disband-confirm')}
            onLeavePress={() => setScreen('leave-confirm')}
            onChestPress={(chest) => {
              // Always open detail for progress inspection
              setSelectedChest(chest);
              setScreen('chest-detail');
            }}
            onChestTap={async (chest) => {
              // Start timer immediately — no intermediate screen
              try {
                await tapChest(chest.id);
                const data = await fetchMySquad();
                extractPhase2Data(data);
              } catch (e: any) {
                // 409 = already tapped, silently refresh
                if (!e.message?.includes('Already tapped')) {
                  Alert.alert('Error', e.message ?? 'Could not start chest timer');
                }
                const data = await fetchMySquad();
                extractPhase2Data(data);
              }
            }}
            onChestOpen={async (chest) => {
              // Open directly — no intermediate screen — then show confetti
              try {
                const result = await openChest(chest.id);
                setChestOpenResult(result);
                setScreen('chest-open');
                const data = await fetchMySquad();
                extractPhase2Data(data);
              } catch (e: any) {
                Alert.alert('Error', e.message ?? 'Could not open chest');
              }
            }}
            onChestNudge={() => {}}
            onCheckin={() => {
              if (activeSession) {
                Alert.alert(
                  'Already checked in 📡',
                  `You can't check in at 2 places at the same time.\n\nYour active session at ${activeSession.venueName} has a 12h cooldown — come back later!`,
                  [{ text: 'Got it', style: 'default' }],
                );
                return;
              }
              setShowCheckinSheet(true);
            }}
            onLeaderboard={() => setScreen('leaderboard')}
            onManage={() => setScreen('manage')}
            onDevReset={handleDevReset}
            hasActiveSession={!!activeSession}
            activeBattle={activeBattle}
            onViewBattle={async () => {
              if (activeBattle) {
                setScreen('conquest-battle');
                return;
              }
              if (pendingBattleId) {
                try {
                  const { battle } = await conquestApi.getBattleState(pendingBattleId);
                  if (battle) {
                    setBattle(battle);
                    setScreen('conquest-battle');
                    return;
                  }
                } catch {}
              }
              setScreen('home');
            }}
            conquestBanner={
              activeSession ? (
                <ConquestLiveBanner
                  session={activeSession}
                  onPress={() => setScreen('conquest-session')}
                />
              ) : undefined
            }
            alertBadgeCount={unreadAlertCount}
            onAlerts={() => setScreen('conquest-alerts')}
          />
          <CheckInSheet
            visible={showCheckinSheet}
            squadId={squad.id}
            squadName={squad.name}
            members={squad.members ?? []}
            myProfileId={profileId}
            onClose={() => setShowCheckinSheet(false)}
            onSuccess={async (result) => {
              setShowCheckinSheet(false);
              // Fetch squad data and conquest session in parallel so both cards appear immediately
              await Promise.all([
                fetchMySquad().then(data => extractPhase2Data(data)),
                refreshSession(),
              ]);
              // Retry session refresh after a short delay to catch any server-side lag
              setTimeout(() => void refreshSession(), 1500);
            }}
            onCheckinComplete={(venue) => {
              debugLog('SQUADD', `check-in OK venue #${venue.id} ${venue.name}`);
            }}
            onPulseResult={(result) => {
              if (result.ok) {
                debugLog('SQUADD', `pulse OK venue #${result.venueId} ${result.venueName}`);
              } else {
                debugLog('SQUADD', `pulse FAILED venue #${result.venueId}: ${result.error ?? 'unknown'}`);
              }
            }}
            onPulseDropped={(_venueId, _venueName) => {
              // Immediate refresh + retry after 1.5s to catch server-side session creation lag
              void refreshSession();
              setTimeout(() => void refreshSession(), 1500);
            }}
          />
        </>
      )}
      {screen === 'manage' && squad && (
        <SquadManageScreen
          squad={squad}
          myRole={myRole}
          myProfileId={profileId}
          onBack={() => setScreen('home')}
          onEditSquad={() => setScreen('edit')}
          onInviteMore={() => {
            setCreatedSquad(squad);
            setInviteReturnScreen('home');
            setScreen('invite');
          }}
          onDisbandPress={() => setScreen('disband-confirm')}
          onLeavePress={() => setScreen('leave-confirm')}
          onRefresh={async () => {
            const data = await fetchMySquad();
            extractPhase2Data(data);
          }}
          onTransferDone={async () => {
            await fetchMySquad();
            setScreen('home');
          }}
        />
      )}
      {screen === 'edit' && squad && (
        <SquadEditScreen
          squad={squad}
          onBack={() => setScreen('manage')}
          onSaved={async () => {
            await fetchMySquad();
            setScreen('manage');
          }}
        />
      )}
      {screen === 'chest-detail' && selectedChest && squad && (
        <SquadChestDetailScreen
          chest={selectedChest}
          squadId={squad.id}
          squadName={squad.name}
          myProfileId={profileId}
          onOpen={(result) => {
            setChestOpenResult(result);
            setScreen('chest-open');
          }}
          onBack={() => setScreen('home')}
          onRefresh={async () => {
            const data = await fetchMySquad();
            extractPhase2Data(data);
            if (data?.activeChest) setSelectedChest(data.activeChest);
          }}
        />
      )}
      {screen === 'chest-open' && chestOpenResult && squad && (
        <SquadChestOpenScreen
          kudosAwarded={chestOpenResult.kudosAwarded}
          xpAwarded={chestOpenResult.xpAwarded}
          squadName={squad.name}
          onDone={async () => {
            const data = await fetchMySquad();
            extractPhase2Data(data);
            setScreen('home');
          }}
        />
      )}
      {screen === 'leaderboard' && (
        <CityLeaderboardScreen
          mySquadId={squad?.id}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'leave-confirm' && squad && (
        <SquadLeaveConfirmScreen
          squadName={squad.name}
          founderName={(() => {
            const founder = squad.members?.find((m) => m.profileId === squad.founderId);
            if (founder?.profile?.squadNickname) return `@${founder.profile.squadNickname}`;
            return founder?.profile?.displayName?.split(' ')[0] ?? 'The founder';
          })()}
          onConfirmLeave={handleExitSquad}
          onCancel={() => setScreen('home')}
        />
      )}
      {screen === 'disband-confirm' && squad && (
        <SquadDisbandConfirmScreen
          squadName={squad.name}
          onConfirmDisband={handleExitSquad}
          onCancel={() => setScreen('home')}
        />
      )}
      {screen === 'disbanded' && disbandedNotice && (
        <SquadDisbandedScreen
          notice={disbandedNotice}
          onCreateSquad={async () => {
            await dismissDisbanded(disbandedNotice);
            setScreen('nickname');
          }}
          onBrowseSquads={async () => {
            await dismissDisbanded(disbandedNotice);
            setScreen('browse');
          }}
        />
      )}
      {screen === 'invite-receive' && (
        <SquadInviteReceiveScreen
          code={receiveCode}
          inviteId={receiveInviteId}
          squadId={receiveSquadId}
          onJoin={handleJoin}
          onMaybeLater={handleMaybeLater}
          onBack={() => routeToSignedInScreen()}
        />
      )}

      {/* ── Phase 4 Conquest Screens ─────────────────────────────── */}

      {screen === 'conquest-session' && activeSession && squad && (
        <ConquestActiveSessionScreen
          session={activeSession}
          mySquadName={squad.name}
          mySquadEmoji={squad.emoji}
          friendlyNames={
            (squad.members ?? [])
              .filter(m => m.profileId !== profileId)
              .map(m => m.profile?.squadNickname ?? m.profile?.displayName?.split(' ')[0] ?? '?')
              .slice(0, 3)
          }
          onBack={() => setScreen('home')}
          onBattle={async () => {
            try {
              const card = await conquestApi.getSquadCard();
              setConquestCardData(card.card);
            } catch {}
            setScreen('conquest-rival-reveal');
          }}
        />
      )}

      {screen === 'conquest-rival-reveal' && activeSession && squad && (
        /* Keep activeSession check: we need session data to show rival name / card */
        <ConquestRivalRevealScreen
          session={activeSession}
          mySquad={{
            id: squad.id,
            name: squad.name,
            emoji: squad.emoji,
            level: squad.level,
          }}
          rivalSquadName={activeSession.clashPartnerSquadName ?? 'Unknown Squad'}
          rivalSquadEmoji="❓"
          cardData={conquestCardData}
          onBack={() => { setBattlePending(false); setPendingBattleId(null); setScreen('conquest-session'); }}
          battlePending={battlePending}
          onViewBattle={async () => {
            // If activeBattle is already in memory, go straight there
            if (activeBattle) {
              setScreen('conquest-battle');
              return;
            }
            // activeBattle was cleared from memory — re-fetch by stored ID
            if (pendingBattleId) {
              try {
                const { battle } = await conquestApi.getBattleState(pendingBattleId);
                setBattle(battle);
                setScreen('conquest-battle');
              } catch {
                Alert.alert('Could not load battle', 'Please refresh and try again.');
              }
            } else {
              // No ID stored — nothing to show, go back to session
              setScreen(activeSession ? 'conquest-session' : 'home');
            }
          }}
          onPlayCard={async () => {
            if (!activeSession?.venueId) {
              Alert.alert('Battle failed', 'No active session found. Please refresh.');
              return;
            }
            try {
              const { battle } = await conquestApi.initiateBattle(activeSession.venueId);
              setBattle(battle);
              setBattlePending(true);
              setPendingBattleId(battle.id);
              setScreen('conquest-battle');
            } catch (e: any) {
              Alert.alert('Battle failed', e.message ?? 'Could not start battle. Try again.');
            }
          }}
        />
      )}

      {screen === 'conquest-battle' && activeBattle && squad && (
        <ConquestBattleScreen
          battle={activeBattle}
          mySquadId={squad.id}
          mySquadName={squad.name}
          mySquadEmoji={squad.emoji}
          rivalSquadName={activeSession?.clashPartnerSquadName ?? 'Unknown Squad'}
          rivalSquadEmoji="❓"
          onBack={() => setScreen(activeSession ? 'conquest-session' : 'home')}
          onRevealResult={() => {
            if (!activeBattle) return;
            // null winnerSquadId = draw — treat as lose (no bonus, but can still counter)
            const iWon = activeBattle.winnerSquadId === squad.id;
            if (iWon) {
              setScreen('conquest-battle-win');
            } else {
              setScreen('conquest-battle-lose');
            }
          }}
        />
      )}

      {screen === 'conquest-battle-win' && activeBattle && squad && (
        <ConquestBattleWinScreen
          battle={activeBattle}
          mySquadId={squad.id}
          mySquadName={squad.name}
          mySquadEmoji={squad.emoji}
          rivalSquadName={activeSession?.clashPartnerSquadName ?? 'Unknown Squad'}
          rivalSquadEmoji="❓"
          counterAttackWindowEndsAt={activeBattle.counterAttackWindowEndsAt || new Date(Date.now() + 5 * 60 * 1000).toISOString()}
          onViewResults={() => {
            // Use conquestSessionId (set when session closes) or fall back to active session id
            const sid = conquestSessionId ?? activeSession?.id ?? null;
            if (sid) {
              conquestApi.getShareData(sid).then(data => {
                setConquestImpactData(data);
                setConquestSessionId(sid);
                setScreen('conquest-impact');
              }).catch(() => {
                // Share data not ready yet — go back to session, they'll see impact when session closes
                setScreen(activeSession ? 'conquest-session' : 'home');
              });
            } else {
              setScreen('home');
            }
          }}
          onBack={() => setScreen(activeSession ? 'conquest-session' : 'home')}
        />
      )}

      {screen === 'conquest-battle-lose' && activeBattle && squad && (
        <ConquestBattleLoseScreen
          battle={activeBattle}
          mySquadId={squad.id}
          mySquadName={squad.name}
          mySquadEmoji={squad.emoji}
          rivalSquadName={activeSession?.clashPartnerSquadName ?? 'Unknown Squad'}
          rivalSquadEmoji="❓"
          counterAttackWindowEndsAt={activeBattle.counterAttackWindowEndsAt || new Date(Date.now() + 5 * 60 * 1000).toISOString()}
          onCounterAttack={async () => {
            try {
              const { battle } = await conquestApi.counterAttack(activeBattle.id);
              setBattle(battle);
              setBattlePending(true);
              setScreen('conquest-battle');
            } catch (e: any) {
              Alert.alert('Counter-attack failed', e.message ?? 'Try again.');
            }
          }}
          onViewResults={() => {
            const sid = conquestSessionId ?? activeSession?.id ?? null;
            if (sid) {
              conquestApi.getShareData(sid).then(data => {
                setConquestImpactData(data);
                setConquestSessionId(sid);
                setScreen('conquest-impact');
              }).catch(() => {
                setScreen(activeSession ? 'conquest-session' : 'home');
              });
            } else {
              setScreen('home');
            }
          }}
          onBack={() => setScreen(activeSession ? 'conquest-session' : 'home')}
        />
      )}

      {screen === 'conquest-impact' && conquestImpactData && squad && (
        <ConquestImpactRevealScreen
          data={conquestImpactData}
          mySquadId={squad.id}
          mySquadEmoji={squad.emoji}
          onShare={() => setScreen('conquest-share')}
          onDone={() => {
            setConquestImpactData(null);
            setConquestSessionId(null);
            setScreen('home');
          }}
        />
      )}

      {screen === 'conquest-share' && conquestImpactData && squad && (
        <ConquestShareScreen
          data={conquestImpactData}
          mySquadName={squad.name}
          mySquadEmoji={squad.emoji}
          mySquadId={squad.id}
          onBack={() => setScreen('conquest-impact')}
        />
      )}

      {screen === 'conquest-alerts' && (
        <ConquestAlertsScreen
          onBack={() => setScreen('home')}
          onAlertRead={refreshAlertBadge}
          onAlertPress={async (alert) => {
            const type = alert.type;
            const payload = alert.payload as Record<string, any> | null;

            // Session completed → open INF reveal
            if (type === 'conquest_session_reveal') {
              const sessionId = payload?.sessionId as string | undefined;
              if (sessionId) {
                try {
                  const data = await conquestApi.getShareData(sessionId);
                  setConquestImpactData(data);
                  setConquestSessionId(sessionId);
                  setScreen('conquest-impact');
                } catch {
                  // share data not ready yet
                }
              }
              return;
            }

            // Battle result → open battle win/lose screen
            if (type === 'battle_won' || type === 'battle_lost' || type.startsWith('battle_result_')) {
              const battleId = payload?.battleId as string | undefined;
              if (battleId) {
                try {
                  const { battle } = await conquestApi.getBattleState(battleId);
                  if (battle && squad) {
                    setBattle(battle);
                    const won = battle.winnerSquadId === squad.id || type === 'battle_won';
                    setScreen(won ? 'conquest-battle-win' : 'conquest-battle-lose');
                  }
                } catch {}
              }
              return;
            }

            // Clash alert → open rival reveal
            if (type === 'clash_alert' || type === 'counter_attack') {
              void refreshSession().then(async () => {
                try {
                  const card = await conquestApi.getSquadCard();
                  setConquestCardData(card.card);
                } catch {}
                setScreen('conquest-rival-reveal');
              });
            }
          }}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
});
