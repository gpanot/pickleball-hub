import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../stores/authStore';
import { useSignUpModal } from '../../contexts/SignUpModalContext';
import { useSquad } from './hooks/useSquad';
import { useConquest } from './hooks/useConquest';
import { getPendingInvite, disbandDismissKey, resetDevCheckinFlow, resetDevSquadd, tapChest, openChest, ensurePodForSquad } from './api';
import * as api from './api';
import * as conquestApi from './conquestApi';
import type { SquadScreen, SquadDisbandedNotice } from './types';
import type { Squad, SquadPreview, ConquestBattle, SquadCardData, ConquestImpactBreakdown } from './types';

import { SquadCarouselScreen } from './screens/SquadCarouselScreen';
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
import { DayOneIntentModal } from '../../components/DayOneIntentModal';
import { LocationPicker } from './components/LocationPicker';
import { addPreferredPlace } from '../../services/locationPicker';
// Phase 3: Pods, Tokens & Brands
import { PodPlaystyleScreen } from './screens/PodPlaystyleScreen';
import { PodCreateScreen } from './screens/PodCreateScreen';
import { BrandSelectScreen } from './screens/BrandSelectScreen';
import { WelcomeChestScreen } from './screens/WelcomeChestScreen';
import { TokenSplitScreen } from './screens/TokenSplitScreen';
import type { NextLevelInfo } from './screens/TokenSplitScreen';

const SQUAD_LEVEL_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];
const BRAND_LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500, 11500];

function computeNextLevelInfo(
  squad: { totalXp: number; level: number } | null,
  playerBrandData: { supportLevel: number; brandXp: number } | null,
): NextLevelInfo | null {
  if (!squad) return null;
  const nextSquadXp = SQUAD_LEVEL_THRESHOLDS[squad.level] ?? ((SQUAD_LEVEL_THRESHOLDS[squad.level - 1] ?? 0) + 4000);
  const teamXpToNext = Math.max(0, nextSquadXp - squad.totalXp);
  const nextClubhouseXp = SQUAD_LEVEL_THRESHOLDS[squad.level] ?? ((SQUAD_LEVEL_THRESHOLDS[squad.level - 1] ?? 0) + 4000);
  const clubhouseTokensToNext = Math.max(0, nextClubhouseXp - squad.totalXp);
  const paddleLevel = playerBrandData?.supportLevel ?? 1;
  const brandXp = playerBrandData?.brandXp ?? 0;
  const nextBrandXp = BRAND_LEVEL_THRESHOLDS[paddleLevel] ?? ((BRAND_LEVEL_THRESHOLDS[paddleLevel - 1] ?? 0) + 3000);
  const paddleTokensToNext = Math.max(0, nextBrandXp - brandXp);
  return { paddleLevel, paddleTokensToNext, clubhouseTokensToNext, teamXpToNext };
}
import { BrandDetailScreen } from './screens/BrandDetailScreen';
import { ClubhouseDetailScreen } from './screens/ClubhouseDetailScreen';
import type { PlayStyle } from './podConstants';
import type { WelcomeChestResult, PlayerBrandData } from './types';
// Phase 4 Conquest screens
import { ConquestLiveBanner } from './components/ConquestLiveBanner';
import { ConquestActiveSessionScreen } from './screens/ConquestActiveSessionScreen';
import {
  ConquestBattleScreen,
  ConquestBattleWinScreen,
  ConquestBattleLoseScreen,
} from './screens/ConquestBattleScreen';
import { ConquestImpactRevealScreen } from './screens/ConquestImpactRevealScreen';
import { ConquestShareScreen } from './screens/ConquestShareScreen';
import { ConquestAlertsScreen } from './screens/ConquestAlertsScreen';
import type { SquadChest, FeedItem, SquadStreak, ChestOpenResult, PlayerContribution, PlayerWalletData } from './types';
import {
  HAS_SEEN_CAROUSEL_KEY,
  subscribeSquaddOnboardingReset,
} from './squadOnboarding';
import { debugLog } from '../../lib/debug';

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
  const authHydrated = useAuthStore((s) => s.hydrated);
  const hasCompletedOnboarding = useAuthStore((s) => s.hasCompletedOnboarding);
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
  const [activeChests, setActiveChests] = useState<SquadChest[]>([]);
  const [recentFeed, setRecentFeed] = useState<FeedItem[]>([]);
  const [streak, setStreak] = useState<SquadStreak>({ days: 0, lastPlayedAt: null });
  const [myContribution, setMyContribution] = useState<PlayerContribution>({ sessions: 0, xpEarned: 0, chestsOpened: 0 });
  const [cityRank, setCityRank] = useState<number | null>(null);
  const [selectedChest, setSelectedChest] = useState<SquadChest | null>(null);
  const [chestOpenResult, setChestOpenResult] = useState<ChestOpenResult | null>(null);
  // Phase 3: Pods, Tokens & Brands
  const [createdPodId, setCreatedPodId] = useState<string | null>(null);
  const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle | null>(null);
  const [welcomeChestResult, setWelcomeChestResult] = useState<WelcomeChestResult | null>(null);
  const [playerBrandData, setPlayerBrandData] = useState<PlayerBrandData | null>(null);
  const [walletData, setWalletData] = useState<PlayerWalletData | null>(null);
  const [myPodData, setMyPodData] = useState<import('./types').PodSummary | null>(null);
  // Join path — tracks whether brand/chest flow was entered via join-by-code/accept
  const [joinPath, setJoinPath] = useState(false);
  const [joinedSquadId, setJoinedSquadId] = useState<string | null>(null);
  // Where to go back from brand-select (varies by entry point)
  const [brandSelectBackScreen, setBrandSelectBackScreen] = useState<SquadScreen>('pod-playstyle');
  // When true, pod-playstyle's "selected" action skips pod-create and goes to invite screen
  const [podPlaystyleForInvite, setPodPlaystyleForInvite] = useState(false);
  const [showCheckinSheet, setShowCheckinSheet] = useState(false);
  const [showDayOneIntentModal, setShowDayOneIntentModal] = useState(false);
  const [showRecurringIntentModal, setShowRecurringIntentModal] = useState(false);
  const [intentData, setIntentData] = useState<import('./components/IntentCard').IntentData | null>(null);
  const dayOneModalChecked = useRef(false);
  const [placesData, setPlacesData] = useState<import('../../services/locationPicker').PreferredPlace[] | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
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

  const routeToBattleResult = useCallback((battle: ConquestBattle) => {
    if (!squad) return false;
    const won = battle.winnerSquadId === squad.id;
    setScreen(won ? 'conquest-battle-win' : 'conquest-battle-lose');
    return true;
  }, [squad]);

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

  // Fetch wallet + brand data when the home screen is active
  useEffect(() => {
    if (screen !== 'home') return;
    void Promise.all([
      useAuthStore.getState().authedFetch('/api/wallet/me').then((r) => r.ok ? r.json() : null),
      useAuthStore.getState().authedFetch('/api/brand/me').then((r) => r.ok ? r.json() : null),
    ]).then(([w, b]) => {
      if (w) setWalletData(w);
      if (b?.brand) setPlayerBrandData(b.brand);
    }).catch(() => {});
  }, [screen]);

  // Pre-fetch squad card data as soon as a clash is detected, so stats show immediately
  useEffect(() => {
    if (!activeSession?.isClashActive) return;
    if (conquestCardData) return; // already loaded
    void conquestApi.getSquadCard().then(c => setConquestCardData(c.card)).catch(() => {});
  }, [activeSession?.isClashActive, conquestCardData]);

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
    if (data.activeChests !== undefined) {
      setActiveChests(data.activeChests ?? []);
      setActiveChest(data.activeChests?.[0] ?? data.activeChest ?? null);
    } else if (data.activeChest !== undefined) {
      setActiveChest(data.activeChest);
    }
    if (data.recentFeed !== undefined) setRecentFeed(data.recentFeed);
    if (data.streak !== undefined) setStreak(data.streak);
    if (data.myContribution !== undefined) setMyContribution(data.myContribution);
    if (data.mySquad?.rank !== undefined) setCityRank(data.mySquad.rank);
    // Phase 3: Pod data embedded in the squads/my response
    if (data.myPod !== undefined) setMyPodData(data.myPod);
  }, []);

  const handleDevReset = useCallback(async () => {
    Alert.alert(
      'Dev Reset',
      'Choose what to reset:',
      [
        {
          text: 'Reset Squadd',
          onPress: async () => {
            try {
              const result = await resetDevSquadd();
              setActiveChest(null);
              setIntentData(null);
              setPlacesData([]);
              const [data] = await Promise.all([
                fetchMySquad(),
                refreshSession(),
                refreshAlertBadge(),
              ]);
              extractPhase2Data(data);
              const { chests, radarSessions, pulseCooldowns, alerts } = result.cleared;
              Alert.alert(
                'Squadd reset',
                `Cleared ${chests} chest(s), ${radarSessions} session(s), ${pulseCooldowns} cooldown(s), ${alerts} alert(s). Streak + intent reset.`,
              );
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'Reset failed';
              Alert.alert('Reset failed', message);
            }
          },
        },
        {
          text: 'All reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await resetDevCheckinFlow();
              setActiveChest(null);
              setIntentData(null);
              setPlacesData([]);
              setPlayerBrandData(null);
              setWalletData(null);
              setWelcomeChestResult(null);
              setJoinPath(false);
              setJoinedSquadId(null);
              setBrandSelectBackScreen('pod-playstyle');
              dayOneModalChecked.current = false;
              const [data] = await Promise.all([
                fetchMySquad(),
                refreshSession(),
                refreshAlertBadge(),
              ]);
              extractPhase2Data(data);
              const { chests, radarSessions, pulseCooldowns } = result.cleared;
              Alert.alert(
                'All reset',
                `Cleared ${chests} chest(s), ${radarSessions} session(s), ${pulseCooldowns} cooldown(s). Brand + wallet + onboarding + intent reset.`,
              );
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'Reset failed';
              Alert.alert('Reset failed', message);
              throw e;
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [fetchMySquad, refreshSession, refreshAlertBadge, extractPhase2Data]);

  const routeToSignedInScreen = useCallback(async () => {
    const { activeJwt, activeProfileId } = await resolveActiveAuth();

    if (!activeJwt || !activeProfileId) {
      pushRouteLog('routeToSignedIn: no auth → carousel');
      setScreen('carousel');
      return;
    }

    const [squadData, walletRes, brandRes] = await Promise.all([
      fetchMySquad(),
      useAuthStore.getState().authedFetch('/api/wallet/me').then((r) => r.ok ? r.json() : null).catch(() => null),
      useAuthStore.getState().authedFetch('/api/brand/me').then((r) => r.ok ? r.json() : null).catch(() => null),
    ]);
    extractPhase2Data(squadData);
    if (walletRes) setWalletData(walletRes);
    if (brandRes?.brand) setPlayerBrandData(brandRes.brand);
    if (squadData?.squad) {
      pushRouteLog(`routeToSignedIn: squad "${squadData.squad.name}" → home`);
      // Backfill pod if the user has a squad but no pod (pre-pod data or interrupted onboarding)
      if (!squadData.myPod) {
        pushRouteLog(`routeToSignedIn: no pod found for squad "${squadData.squad.name}" — backfilling`);
        try {
          await ensurePodForSquad(squadData.squad.id);
          // Re-fetch so myPod is populated on the home screen
          const refreshed = await fetchMySquad();
          extractPhase2Data(refreshed);
        } catch (e) {
          pushRouteLog(`routeToSignedIn: pod backfill failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // Fetch conquest session in parallel with navigation so the On Court card shows immediately
      void refreshSession();
      setScreen('home');
      // Retry after a short delay to catch any server-side session that wasn't immediately available
      setTimeout(() => void refreshSession(), 1500);
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
    // Populate pod/chest/feed data so the home screen is fully loaded without
    // needing a manual pull-to-refresh.
    extractPhase2Data(squadData);
    // Backfill pod if the user has a squad but no pod (pre-pod data or interrupted onboarding)
    if (!squadData.myPod) {
      pushRouteLog(`routeIfHasSquad: no pod for squad "${squadData.squad.name}" — backfilling`);
      try {
        await ensurePodForSquad(squadData.squad.id);
        const refreshed = await fetchMySquad();
        extractPhase2Data(refreshed);
      } catch (e) {
        pushRouteLog(`routeIfHasSquad: pod backfill failed (non-blocking): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    pushRouteLog(`routeIfHasSquad: "${squadData.squad.name}" → home`);
    setScreen('home');
    return true;
  }, [resolveActiveAuth, fetchMySquad, tryRouteDisbanded, extractPhase2Data, pushRouteLog]);

  const syncSquaddRoute = useCallback(async (reason: string) => {
    pushRouteLog(`sync (${reason})`);
    // Do not sync while the orchestrator owns the funnel — prevents jump to home
    if (!useAuthStore.getState().hasCompletedOnboarding) {
      pushRouteLog(`sync skipped — onboarding incomplete`);
      return;
    }
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

    // If the player is mid-onboarding (explore-paused or killed mid-funnel), the
    // OnboardingOrchestrator owns the funnel — don't continue through SquadModule's
    // old carousel flow, which routes to the legacy ready/create screens.
    if (!useAuthStore.getState().hasCompletedOnboarding) {
      debugLog('SquadModule', 'handleCarouselCta: onboarding incomplete — ignoring carousel CTA');
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
    // Wait for SecureStore rehydration before routing — prevents racing jwt=null
    // on cold start which would flash the carousel for authenticated users.
    if (!authHydrated) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      // Skip boot sync if onboarding orchestrator is still active
      if (!useAuthStore.getState().hasCompletedOnboarding) {
        pushRouteLog('boot → skipped (orchestrator owns funnel)');
        return;
      }
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
  }, [authHydrated, deeplinkCode, deeplinkInviteId, deeplinkSquadId, syncSquaddRoute, pushRouteLog]);

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
      // When routing to rival reveal via push — now goes straight to session screen
      // (card data loads lazily inside ConquestActiveSessionScreen)
      if (conquestScreen === 'conquest-rival-reveal') {
        void refreshSession().then(() => setScreen('conquest-session'));
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
      // Guard: if the player is still mid-onboarding, the orchestrator owns the funnel.
      // Don't route to invite-receive now — the server-side invite persists and will be
      // picked up by routeToSignedInScreen → getPendingInvite() once onboarding completes.
      if (!useAuthStore.getState().hasCompletedOnboarding) {
        pushRouteLog(`runtime push → skipped invite-receive (onboarding incomplete, invite will persist for squadId=${deeplinkSquadId})`);
        return;
      }
      if (deeplinkInviteId) setReceiveInviteId(parseInt(deeplinkInviteId, 10));
      if (deeplinkSquadId) setReceiveSquadId(deeplinkSquadId);
      setScreen('invite-receive');
      pushRouteLog(`runtime push → invite-receive (squadId=${deeplinkSquadId})`);
      return;
    }
    // syncSquaddRoute already guards !hasCompletedOnboarding internally
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

  // Intent card: fetch active intent state whenever we land on home.
  // Also fires the first-time modal if dayOneIntentShown is false.
  const { authedFetch } = useAuthStore();

  const fetchIntentData = useCallback(async () => {
    try {
      const res = await authedFetch('/api/play-intent/day-one');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setIntentData({
          intent: data.intent ?? null,
          intentDate: data.intentDate ?? null,
          expiresAt: data.expiresAt ?? null,
          isActive: data.isActive ?? false,
          aggregateCount: data.aggregateCount ?? 0,
        });
      }
    } catch {}
  }, [authedFetch]);

  const fetchPlacesData = useCallback(async () => {
    try {
      const res = await authedFetch('/api/play-intent/places');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setPlacesData(data.places ?? []);
      }
    } catch {}
  }, [authedFetch]);

  useEffect(() => {
    if (screen !== 'home' || !squad) return;
    // Fetch intent + places state every time we land on home
    void fetchIntentData();
    void fetchPlacesData();
    // First-time modal: only check once per session
    if (dayOneModalChecked.current) return;
    dayOneModalChecked.current = true;
    void authedFetch('/api/players/profile').then(async (res) => {
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const prefs = data?.preferences ?? {};
      if (!prefs.dayOneIntentShown) {
        setShowDayOneIntentModal(true);
      }
    }).catch(() => {});
  }, [screen, squad, authedFetch, fetchIntentData, fetchPlacesData]);

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
    let resolvedSquadId: string | null = null;
    let chestClaimed = false;

    if (code) {
      const data = await joinByCode(code);
      resolvedSquadId = data.squad?.id ?? null;
      chestClaimed = data.welcomeChestClaimed ?? false;
      // joinByCode hook already sets squad in state; no extra fetch needed
    } else if (inviteId && squadId) {
      // Call api directly to capture welcomeChestClaimed from the response
      const data = await api.acceptInvite(squadId, inviteId);
      resolvedSquadId = squadId;
      chestClaimed = data.welcomeChestClaimed ?? false;
      // Hook's accept() was not called, so squad is not yet loaded — fetch it now
      const squadData = await fetchMySquad();
      extractPhase2Data(squadData);
    }

    await AsyncStorage.removeItem(PENDING_INVITE_KEY);

    if (!chestClaimed && resolvedSquadId) {
      setJoinPath(true);
      setJoinedSquadId(resolvedSquadId);
      setScreen('brand-select');
    } else {
      // Returning player — ensure Pod silently, then go home
      if (resolvedSquadId) {
        void ensurePodForSquad(resolvedSquadId);
      }
      setJoinPath(false);
      setJoinedSquadId(null);
      setScreen('home');
    }
  }, [joinByCode, fetchMySquad, extractPhase2Data]);

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
      {screen === 'ready' && (
        <SquadReadyScreen
          onCreateSquad={() => setScreen('create')}
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
          onBack={() => setScreen('ready')}
          loading={loading}
        />
      )}
      {screen === 'invite' && createdSquad && (
        <SquadInviteScreen
          squad={createdSquad}
          onInvitesSent={(result) => {
            // Non-onboarding return paths skip the "created" confirmation screen
            if (inviteReturnScreen === 'home' || inviteReturnScreen === 'clubhouse-detail') {
              setScreen(inviteReturnScreen);
            } else {
              handleInvitesSent(result);
            }
          }}
          onSkip={() => {
            if (inviteReturnScreen === 'home' || inviteReturnScreen === 'clubhouse-detail') {
              setScreen(inviteReturnScreen);
            } else {
              setScreen('created');
            }
          }}
          onBack={() => setScreen(inviteReturnScreen)}
        />
      )}
      {screen === 'created' && createdSquad && (
        <SquadCreatedScreen
          squad={createdSquad}
          inviteResult={inviteResult}
          onGoToSquad={() => { void fetchMySquad(); setScreen('pod-playstyle'); }}
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
            activeChests={activeChests}
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
                // Optimistically remove the opened chest from the queue so the
                // next chest slides into view immediately
                setActiveChests(prev => prev.filter(c => c.id !== chest.id));
                setActiveChest(null);
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
            conquestBanner={
              activeSession ? (
                <ConquestLiveBanner
                  session={activeSession}
                  mySquadName={squad?.name ?? ''}
                  mySquadEmoji={squad?.emoji ?? '🐯'}
                  onPress={() => setScreen('conquest-session')}
                  onAutoInitiateBattle={async (rivalSquadId) => {
                    if (!activeSession?.venueId) return;
                    console.log(`[SquadModule] onAutoInitiateBattle rivalSquadId=${rivalSquadId} venueId=${activeSession.venueId}`);
                    try {
                      const { battle } = await conquestApi.initiateBattle(activeSession.venueId, rivalSquadId);
                      console.log(`[SquadModule] battle initiated id=${battle?.id} revealAt=${battle?.revealAt}`);
                      setBattle(battle);
                      setPendingBattleId(battle.id);
                    } catch (e: any) {
                      console.warn(`[SquadModule] initiateBattle error: ${e?.message}`);
                      if (!e.message?.includes('already')) {
                        Alert.alert('Battle failed', e.message ?? 'Could not start battle');
                      }
                    }
                    await refreshSession();
                  }}
                  onWatchBattle={(rivalSquadId) => {
                    // Find the battle for this specific rival from clashRivals
                    const rivalData = activeSession?.clashRivals?.find(r => r.squadId === rivalSquadId);
                    const battleId = rivalData?.battle?.id ?? activeBattle?.id ?? pendingBattleId;
                    console.log(`[SquadModule] onWatchBattle rivalSquadId=${rivalSquadId} battleId=${battleId}`);
                    if (battleId) {
                      conquestApi.getBattleState(battleId)
                        .then(({ battle }) => { setBattle(battle); setScreen('conquest-battle'); })
                        .catch(() => setScreen('conquest-battle'));
                    } else {
                      refreshSession().then(() => setScreen('conquest-battle'));
                    }
                  }}
                  onSeeResult={(rivalSquadId) => {
                    // Find the battle for this specific rival from clashRivals
                    const rivalData = activeSession?.clashRivals?.find(r => r.squadId === rivalSquadId);
                    const battleId = rivalData?.battle?.id ?? activeBattle?.id ?? pendingBattleId;
                    console.log(`[SquadModule] onSeeResult rivalSquadId=${rivalSquadId} battleId=${battleId}`);
                    if (battleId) {
                      conquestApi.getBattleState(battleId)
                        .then(({ battle }) => { setBattle(battle); routeToBattleResult(battle); })
                        .catch(() => Alert.alert('Could not load result', 'Please refresh.'));
                    } else if (activeBattle) {
                      routeToBattleResult(activeBattle);
                    } else {
                      refreshSession();
                    }
                  }}
                />
              ) : undefined
            }
            alertBadgeCount={unreadAlertCount}
            onAlerts={() => setScreen('conquest-alerts')}
            myPod={myPodData}
            brandData={playerBrandData}
            walletData={walletData}
            onClubhouseDetail={() => setScreen('clubhouse-detail')}
            onBrandDetail={() => {
              if (playerBrandData) {
                setScreen('brand-detail');
              } else {
                setBrandSelectBackScreen('home');
                setScreen('brand-select');
              }
            }}
            onPodCreate={() => setScreen('pod-playstyle')}
            onPodInvite={() => {
              setCreatedSquad(squad);
              setInviteReturnScreen('home');
              setScreen('invite');
            }}
            intentData={intentData}
            onIntentPress={() => setShowRecurringIntentModal(true)}
            placesData={placesData}
            onPlacesPress={() => setShowLocationPicker(true)}
          />
          <CheckInSheet
            visible={showCheckinSheet}
            squadId={squad.id}
            squadName={squad.name}
            squadEmoji={squad.emoji}
            members={squad.members ?? []}
            myProfileId={profileId}
            nextLevel={computeNextLevelInfo(squad, playerBrandData)}
            onClose={() => setShowCheckinSheet(false)}
            onSuccess={async (result) => {
              setShowCheckinSheet(false);
              debugLog('CHECKIN', `success chestId=${result.chestId} xp=${result.xpAwarded} — refreshing squad+session`);
              // Fetch squad data and conquest session in parallel so both cards appear immediately
              await Promise.all([
                fetchMySquad().then(data => extractPhase2Data(data)),
                refreshSession(),
              ]);
              // Retry both refreshes after a short delay to catch any server-side lag
              // (chest write is async fire-and-forget on the backend so can arrive slightly late)
              setTimeout(async () => {
                const data = await fetchMySquad();
                extractPhase2Data(data);
                void refreshSession();
              }, 1500);
            }}
            onCheckinComplete={(venue) => {
              debugLog('SQUADD', `check-in OK venue #${venue.id} ${venue.name}`);
            }}
            onPulseResult={(result) => {
              if (result.ok) {
                debugLog('CHECKIN', `pulse OK venue #${result.venueId} ${result.venueName}`);
              } else {
                debugLog('CHECKIN', `pulse FAILED venue #${result.venueId} "${result.venueName}": ${result.error ?? 'unknown'}`);
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
      {/* Day-One Intent Modal — overlays home screen once per player */}
      {showDayOneIntentModal && screen === 'home' && (
        <DayOneIntentModal
          mode="first"
          onDismiss={(result) => {
            setShowDayOneIntentModal(false);
            if (result?.intent) {
              // Optimistically update the intent card, then re-fetch to confirm
              setIntentData((prev) => ({
                intent: result.intent ?? null,
                intentDate: result.intentDate ?? null,
                expiresAt: prev?.expiresAt ?? null,
                isActive: result.intent !== null,
                aggregateCount: prev?.aggregateCount ?? 0,
              }));
              void fetchIntentData();
            }
          }}
          onRewardReceived={() => {
            void fetchMySquad().then(data => extractPhase2Data(data));
          }}
        />
      )}
      {/* Recurring Intent Modal — opened by tapping the IntentCard on home */}
      {showRecurringIntentModal && screen === 'home' && (
        <DayOneIntentModal
          mode="recurring"
          initialWindow={intentData?.intent ?? null}
          initialDate={intentData?.intentDate ?? null}
          onDismiss={(result) => {
            setShowRecurringIntentModal(false);
            if (result?.intent) {
              setIntentData((prev) => ({
                intent: result.intent ?? null,
                intentDate: result.intentDate ?? null,
                expiresAt: prev?.expiresAt ?? null,
                isActive: result.intent !== null,
                aggregateCount: prev?.aggregateCount ?? 0,
              }));
              void fetchIntentData();
            }
          }}
          onRewardReceived={() => {
            void fetchMySquad().then(data => extractPhase2Data(data));
          }}
        />
      )}
      {/* Location Picker — opens when PlacesCard "+ Add" is tapped */}
      <LocationPicker
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onPick={async (place) => {
          try {
            const updated = await addPreferredPlace(place.lat, place.lng, place.label);
            setPlacesData(updated);
          } catch {
            void fetchPlacesData(); // fallback refresh
          }
        }}
      />
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
          onOpen={async (result) => {
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
          clubTokensAwarded={chestOpenResult.clubTokensAwarded}
          brandTokensAwarded={chestOpenResult.brandTokensAwarded}
          xpAwarded={chestOpenResult.xpAwarded}
          squadName={squad.name}
          onDone={() => {
            // If club tokens were awarded, show the split screen so the player can decide the split
            if (chestOpenResult.clubTokensAwarded > 0) {
              setScreen('chest-token-split');
            } else {
              void fetchMySquad().then(extractPhase2Data);
              setScreen('home');
            }
          }}
        />
      )}
      {screen === 'chest-token-split' && chestOpenResult && squad && (
        <TokenSplitScreen
          squadId={squad.id}
          squadName={squad.name}
          squadEmoji={squad.emoji}
          totalClubTokens={chestOpenResult.clubTokensAwarded}
          brandTokensAwarded={chestOpenResult.brandTokensAwarded}
          xpAwarded={chestOpenResult.xpAwarded}
          brandName={playerBrandData?.brand ?? null}
          nextLevel={computeNextLevelInfo(squad, playerBrandData)}
          onDone={async () => {
            const data = await fetchMySquad();
            extractPhase2Data(data);
            // Refresh wallet so brand tokens update immediately
            void useAuthStore.getState().authedFetch('/api/wallet/me')
              .then((r) => r.ok ? r.json() : null)
              .then((w) => { if (w) setWalletData(w); })
              .catch(() => {});
            setScreen('home');
          }}
        />
      )}
      {screen === 'pod-playstyle' && (
        <PodPlaystyleScreen
          onSelected={(playStyle) => {
            setSelectedPlayStyle(playStyle);
            if (podPlaystyleForInvite) {
              // From Squad Home "Invite" — go straight to the squad invite screen
              setPodPlaystyleForInvite(false);
              setCreatedSquad(squad);
              setInviteReturnScreen('home');
              setScreen('invite');
            } else {
              setScreen('pod-create');
            }
          }}
          onSkip={() => {
            if (podPlaystyleForInvite) {
              setPodPlaystyleForInvite(false);
              setCreatedSquad(squad);
              setInviteReturnScreen('home');
              setScreen('invite');
            } else {
              setScreen('brand-select');
            }
          }}
          onBack={() => {
            setPodPlaystyleForInvite(false);
            setScreen('home');
          }}
        />
      )}
      {screen === 'pod-create' && squad && (
        <PodCreateScreen
          squadId={squad.id}
          playStyle={selectedPlayStyle}
          onCreated={(podId) => { setCreatedPodId(podId); void fetchMySquad(); setScreen('brand-select'); }}
          onSkip={() => { void ensurePodForSquad(squad.id); setScreen('brand-select'); }}
          onBack={() => setScreen('pod-playstyle')}
        />
      )}
      {screen === 'brand-select' && (
        <BrandSelectScreen
          onSelected={(brand) => {
            setPlayerBrandData(brand);
            // If coming from Squad Home (back target is home), skip chest — already claimed
            setScreen(brandSelectBackScreen === 'home' ? 'home' : 'welcome-chest');
          }}
          onSkip={() => setScreen(brandSelectBackScreen === 'home' ? 'home' : 'welcome-chest')}
          onBack={joinPath ? undefined : () => setScreen(brandSelectBackScreen)}
        />
      )}
      {screen === 'welcome-chest' && squad && (
        <WelcomeChestScreen
          squadName={squad.name}
          onOpened={(result) => { setWelcomeChestResult(result); setScreen('token-split'); }}
        />
      )}
      {screen === 'token-split' && squad && welcomeChestResult && (
        <TokenSplitScreen
          squadId={squad.id}
          squadName={squad.name}
          squadEmoji={squad.emoji}
          totalClubTokens={welcomeChestResult.clubTokensAwarded}
          brandTokensAwarded={welcomeChestResult.brandTokensAwarded}
          xpAwarded={welcomeChestResult.xpAwarded}
          brandName={playerBrandData?.brand ?? null}
          nextLevel={computeNextLevelInfo(squad, playerBrandData)}
          onConfirmExtra={joinPath && joinedSquadId
            ? async () => { await ensurePodForSquad(joinedSquadId); }
            : undefined}
          onDone={async () => {
            setJoinPath(false);
            setJoinedSquadId(null);
            const data = await fetchMySquad();
            extractPhase2Data(data);
            setScreen('home');
          }}
        />
      )}
      {screen === 'brand-detail' && playerBrandData && walletData && (
        <BrandDetailScreen
          brandData={playerBrandData}
          brandTokens={walletData.brandTokens}
          onSwitchBrand={() => { setBrandSelectBackScreen('home'); setScreen('brand-select'); }}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'clubhouse-detail' && squad && (
        <ClubhouseDetailScreen
          squad={squad as any}
          myPod={myPodData}
          wallet={walletData}
          brandData={playerBrandData}
          onBack={() => setScreen('home')}
          onManage={() => setScreen('manage')}
          onPodCreate={() => setScreen('pod-playstyle')}
          onPodInvite={() => {
            setCreatedSquad(squad);
            setInviteReturnScreen('clubhouse-detail');
            setScreen('invite');
          }}
          onPodEdit={() => setScreen('pod-edit')}
          onBrandDetail={() => {
            if (playerBrandData) {
              setScreen('brand-detail');
            } else {
              setBrandSelectBackScreen('home');
              setScreen('brand-select');
            }
          }}
        />
      )}
      {screen === 'pod-edit' && squad && myPodData && (
        <PodCreateScreen
          squadId={squad.id}
          playStyle={null}
          editPodId={myPodData.id}
          initialName={myPodData.name}
          initialEmoji={myPodData.emoji}
          onCreated={() => setScreen('clubhouse-detail')}
          onSaved={(pod) => {
            setMyPodData({ ...myPodData, name: pod.name, emoji: pod.emoji, members: pod.members });
            setScreen('clubhouse-detail');
          }}
          onSkip={() => setScreen('clubhouse-detail')}
          onBack={() => setScreen('clubhouse-detail')}
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
            setScreen('create');
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
          mySquad={{ id: squad.id, name: squad.name, emoji: squad.emoji, level: squad.level }}
          friendlyNames={
            (squad.members ?? [])
              .filter(m => m.profileId !== profileId)
              .map(m => m.profile?.squadNickname ?? m.profile?.displayName?.split(' ')[0] ?? '?')
              .slice(0, 3)
          }
          cardData={conquestCardData}
          activeBattle={activeBattle}
          onBack={() => setScreen('home')}
          onPlayCard={async (rivalSquadId) => {
            if (!activeSession?.venueId) {
              Alert.alert('Battle failed', 'No active session found. Please refresh.');
              return;
            }
            if (!conquestCardData) {
              try { const c = await conquestApi.getSquadCard(); setConquestCardData(c.card); } catch {}
            }
            console.log(`[SquadModule] session.onPlayCard rivalSquadId=${rivalSquadId}`);
            try {
              const { battle } = await conquestApi.initiateBattle(activeSession.venueId, rivalSquadId);
              setBattle(battle);
              setBattlePending(true);
              setPendingBattleId(battle.id);
              setScreen('conquest-battle');
            } catch (e: any) {
              if (!e.message?.includes('already')) {
                Alert.alert('Battle failed', e.message ?? 'Could not start battle. Try again.');
              }
            }
            await refreshSession();
          }}
          onWatchBattle={(rivalSquadId) => {
            const rivalData = activeSession?.clashRivals?.find(r => r.squadId === rivalSquadId);
            const battleId = rivalData?.battle?.id ?? activeBattle?.id ?? pendingBattleId;
            if (battleId) {
              conquestApi.getBattleState(battleId)
                .then(({ battle }) => { setBattle(battle); setScreen('conquest-battle'); })
                .catch(() => setScreen('conquest-battle'));
            } else {
              refreshSession().then(() => setScreen('conquest-battle'));
            }
          }}
          onSeeResult={(rivalSquadId) => {
            const rivalData = activeSession?.clashRivals?.find(r => r.squadId === rivalSquadId);
            const battleId = rivalData?.battle?.id ?? activeBattle?.id ?? pendingBattleId;
            if (battleId) {
              conquestApi.getBattleState(battleId)
                .then(({ battle }) => { setBattle(battle); routeToBattleResult(battle); })
                .catch(() => Alert.alert('Could not load result', 'Please refresh.'));
            } else if (activeBattle) {
              routeToBattleResult(activeBattle);
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
          mySquadLevel={squad.level}
          cardData={conquestCardData}
          rivalSquadName={activeSession?.clashPartnerSquadName ?? 'Unknown Squad'}
          rivalSquadEmoji="❓"
          onBack={() => setScreen('home')}
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
          onBack={() => setScreen('home')}
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
          onViewResults={() => setScreen('home')}
          onBattleAnotherTime={() => setScreen('home')}
          onBack={() => setScreen('home')}
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

            // Clash alert → open session screen (rival reveal is now embedded there)
            if (type === 'clash_alert' || type === 'counter_attack') {
              void refreshSession().then(() => setScreen('conquest-session'));
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
