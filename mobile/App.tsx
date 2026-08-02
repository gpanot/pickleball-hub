import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Pressable, Platform, AppState, StyleSheet, Linking, Text as RNText, Animated } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { NavBar, type TabId } from './src/components/NavBar'
import { ExploreSessionsScreen } from './src/screens/ExploreSessionsScreen'
import { CircleScreen, type CircleScreenHandle } from './src/screens/CircleScreen'
import SquadModule from './src/modules/squad/SquadModule'
import { ClubSessionsModule } from './src/modules/club-sessions/ClubSessionsModule'
import { MyBusinessModule } from './src/modules/club-sessions/MyBusinessModule'
import { LogbookScreen } from './src/modules/logbook/screens/LogbookScreen'
import { useLogbookStore } from './src/modules/logbook/logbookStore'
import { ReclubLinkScreen } from './src/screens/ReclubLinkScreen'
import { GuestReclubScreen } from './src/screens/GuestReclubScreen'
import { GuestFollowPlayersScreen } from './src/screens/GuestFollowPlayersScreen'
import { useIpGeolocation } from './src/onboarding/useIpGeolocation'
import { CsOnboardingOrchestrator } from './src/cs-onboarding/CsOnboardingOrchestrator'
import { csOnboardingStorage } from './src/cs-onboarding/csOnboardingStorage'
import type { CsOrchestratorMode } from './src/cs-onboarding/types'
import { PeopleYouMayKnowScreen } from './src/screens/PeopleYouMayKnowScreen'
import { ProfileScreen } from './src/modules/club-sessions/screens/ProfileScreen'
import { GearSetupScreen } from './src/components/gear/GearSetupScreen'
import { useGearProfile } from './src/hooks/useGearProfile'
import { playerGenderFromStored } from './src/components/gear/gearConstants'
import type { GearProfile } from './src/components/gear/gearTypes'
import { SignUpModalProvider } from './src/contexts/SignUpModalContext'
import { ProfileMenuProvider } from './src/contexts/ProfileMenuContext'
import { ToastOverlay } from './src/components/Toast'
import { useAuthStore, resolveApiBase, consumeSignedInFromClubSessions } from './src/stores/authStore'
import { useSessionStore } from './src/stores/sessionStore'
import { useUiStore, type PendingNewFollower } from './src/stores/uiStore'
import { useAvatarCacheStore } from './src/stores/avatarCacheStore'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerForPushNotifications, useNotificationListeners, uploadPushToken } from './src/services/notifications'
import { PushDebugScreen } from './src/screens/PushDebugScreen'
import { SplashScreen } from './src/screens/SplashScreen'
import { debugLog } from './src/lib/debug'
import { useFonts } from 'expo-font'
import { DMSans_400Regular, DMSans_700Bold, DMSans_900Black } from '@expo-google-fonts/dm-sans'
import { Lobster_400Regular } from '@expo-google-fonts/lobster'
import { ThemedAppChrome, useThemedOverlayStyles } from './src/components/ThemedAppChrome'

console.log('[BOOT] ======= App.tsx module loading =======')
console.log('[BOOT] Platform: ' + Platform.OS + ' ' + Platform.Version)
console.log('[BOOT] __DEV__: ' + __DEV__)

const IS_EXPO_GO = Constants.appOwnership === 'expo'
console.log('[BOOT] IS_EXPO_GO:', IS_EXPO_GO)

// FCM push types that open the Rival Revealed screen directly
const CLASH_PUSH_TYPES = new Set([
  'clash_alert',
  'conquest_clash_detected',
])

// FCM types that open the battle result screen directly
const BATTLE_RESULT_PUSH_TYPES = new Set([
  'battle_won',
  'battle_lost',
])

// FCM type that opens the INF reveal screen directly
const SESSION_REVEAL_PUSH_TYPE = 'conquest_session_reveal'
const PNS_DEBUG_STORAGE_KEY = 'pns_debug_logs'

// All other conquest FCM types that route to the alerts screen
const CONQUEST_ALERT_PUSH_TYPES = new Set([
  'territory_claimed',
  'territory_lost',
  'counter_attack',
  'conquest_overlord_gained',
  'conquest_overlord_lost',
  'conquest_rival_posted',
  'conquest_battle_progress',
])

function isClashPush(data: any): boolean {
  return CLASH_PUSH_TYPES.has(data?.type) || data?.screen === 'ConquestRivalReveal'
}
function isBattleResultPush(data: any): boolean {
  return (
    BATTLE_RESULT_PUSH_TYPES.has(data?.type) ||
    (typeof data?.type === 'string' && data.type.startsWith('battle_result_')) ||
    data?.screen === 'ConquestBattleResult'
  )
}
function isSessionRevealPush(data: any): boolean {
  return data?.type === SESSION_REVEAL_PUSH_TYPE || data?.screen === 'ConquestReveal'
}
function isConquestPush(data: any): boolean {
  return (
    isClashPush(data) ||
    isBattleResultPush(data) ||
    isSessionRevealPush(data) ||
    CONQUEST_ALERT_PUSH_TYPES.has(data?.type) ||
    data?.screen === 'ConquestAlerts' ||
    data?.screen === 'ConquestLeaderboard'
  )
}

async function appendPnsDebugLog(line: string): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(PNS_DEBUG_STORAGE_KEY)
    const stored: string[] = existing ? JSON.parse(existing) : []
    stored.push(line)
    await AsyncStorage.setItem(PNS_DEBUG_STORAGE_KEY, JSON.stringify(stored.slice(-100)))
  } catch {}
}

let Notifications: any = null
try {
  Notifications = IS_EXPO_GO ? null : require('expo-notifications')
  console.log('[BOOT] expo-notifications loaded:', !!Notifications)
} catch (e: any) {
  console.log('[BOOT] expo-notifications FAILED:', e?.message)
}

if (!IS_EXPO_GO && Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const enabled = useUiStore.getState().notificationsEnabled
      return {
        shouldShowAlert: enabled,
        shouldPlaySound: enabled,
        shouldSetBadge: enabled,
        shouldShowBanner: enabled,
        shouldShowList: enabled,
      }
    },
  })

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f5a623',
      sound: 'default',
    })
  }
}

// FCM debug listeners — log every message event regardless of app state
// Skip entirely in Expo Go — native Firebase module is unavailable there
try {
  if (IS_EXPO_GO) throw new Error('Expo Go — skipping Firebase')
  const messagingModule = require('@react-native-firebase/messaging')
  const messaging = messagingModule.default

  messaging().onMessage(async (remoteMessage: any) => {
    console.log('[FCM_DEBUG] foreground message received:', JSON.stringify(remoteMessage, null, 2))
    const ts = new Date().toISOString().substring(11, 23)
    const line = `[${ts}] 🟢 FOREGROUND: title="${remoteMessage.notification?.title}" data=${JSON.stringify(remoteMessage.data)}`
    void appendPnsDebugLog(line)
    const notificationsEnabled = useUiStore.getState().notificationsEnabled
    if (!notificationsEnabled) {
      console.log('[FCM_DEBUG] notifications disabled by user — skipping display')
      return
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: remoteMessage.notification?.title ?? remoteMessage.data?.title ?? '',
        body: remoteMessage.notification?.body ?? remoteMessage.data?.body ?? remoteMessage.data?.message ?? '',
        data: remoteMessage.data ?? {},
        sound: 'default',
      },
      trigger: null,
    })
  })

  messaging().onNotificationOpenedApp((remoteMessage: any) => {
    console.log('[FCM_DEBUG] notification opened app:', JSON.stringify(remoteMessage, null, 2))
    const ts = new Date().toISOString().substring(11, 23)
    const line = `[${ts}] 🔵 TAPPED: title="${remoteMessage.notification?.title}" data=${JSON.stringify(remoteMessage.data)}`
    void appendPnsDebugLog(line)
    const data = remoteMessage?.data
    if (data?.type === 'squad_invite' || data?.screen === 'SquadInviteReceive') {
      globalThis.__squadPushData = { squadId: data.squadId, inviteId: data.inviteId }
    } else if (isClashPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-rival-reveal'
    } else if (isBattleResultPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-battle-result'
      ;(globalThis as any).__conquestPushBattleId = data?.battleId ?? null
      ;(globalThis as any).__conquestPushBattleResult =
        data?.result ??
        (data?.type === 'battle_won' || data?.type === 'battle_result_won' ? 'won' : null) ??
        (data?.type === 'battle_lost' || data?.type === 'battle_result_lost' ? 'lost' : null)
    } else if (isSessionRevealPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-session-reveal'
      ;(globalThis as any).__conquestPushSessionId = data?.sessionId ?? null
    } else if (isConquestPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
    } else if (data?.screen === 'ClubSessions' || (typeof data?.type === 'string' && data.type.startsWith('cs_'))) {
      ;(globalThis as any).__clubSessionsPushData = { type: data.type, sessionId: data.sessionId ?? null }
    }
  })

  Promise.race([
    messaging().getInitialNotification(),
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]).then((remoteMessage: any) => {
    if (remoteMessage) {
      console.log('[FCM_DEBUG] app opened from quit state:', JSON.stringify(remoteMessage, null, 2))
      const ts = new Date().toISOString().substring(11, 23)
      const line = `[${ts}] 🟣 QUIT STATE: title="${remoteMessage.notification?.title}" data=${JSON.stringify(remoteMessage.data)}`
      void appendPnsDebugLog(line)
      const data = remoteMessage?.data
      if (data?.type === 'squad_invite' || data?.screen === 'SquadInviteReceive') {
        globalThis.__squadPushData = { squadId: data.squadId, inviteId: data.inviteId }
      } else if (isClashPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-rival-reveal'
      } else if (isBattleResultPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-battle-result'
        ;(globalThis as any).__conquestPushBattleId = data?.battleId ?? null
        ;(globalThis as any).__conquestPushBattleResult =
          data?.result ??
          (data?.type === 'battle_won' || data?.type === 'battle_result_won' ? 'won' : null) ??
          (data?.type === 'battle_lost' || data?.type === 'battle_result_lost' ? 'lost' : null)
      } else if (isSessionRevealPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-session-reveal'
        ;(globalThis as any).__conquestPushSessionId = data?.sessionId ?? null
      } else if (isConquestPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
      } else if (data?.screen === 'ClubSessions' || (typeof data?.type === 'string' && data.type.startsWith('cs_'))) {
        ;(globalThis as any).__clubSessionsPushData = { type: data.type, sessionId: data.sessionId ?? null }
      }
    }
  })

  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    console.log('[FCM_DEBUG] background message received:', JSON.stringify(remoteMessage, null, 2))
    const ts = new Date().toISOString().substring(11, 23)
    const log = `[${ts}] 🔴 BACKGROUND: title="${remoteMessage.notification?.title}" data=${JSON.stringify(remoteMessage.data)}`
    await appendPnsDebugLog(log)
  })
} catch (err: any) {
  console.warn('[FCM_DEBUG] could not attach FCM debug listeners:', err?.message)
}

if (!IS_EXPO_GO && Notifications) {
  Notifications.addNotificationReceivedListener((notification: any) => {
    console.log('[EXPO_DEBUG] notification received:', JSON.stringify(notification, null, 2))
  })

  Notifications.addNotificationResponseReceivedListener((response: any) => {
    console.log('[EXPO_DEBUG] notification tapped:', JSON.stringify(response, null, 2))
    const data = response?.notification?.request?.content?.data
    if (data?.type === 'squad_invite' || data?.screen === 'SquadInviteReceive') {
      globalThis.__squadPushData = { squadId: data.squadId, inviteId: data.inviteId }
    } else if (isClashPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-rival-reveal'
    } else if (isBattleResultPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-battle-result'
      ;(globalThis as any).__conquestPushBattleId = data?.battleId ?? null
      ;(globalThis as any).__conquestPushBattleResult =
        data?.result ??
        (data?.type === 'battle_won' || data?.type === 'battle_result_won' ? 'won' : null) ??
        (data?.type === 'battle_lost' || data?.type === 'battle_result_lost' ? 'lost' : null)
    } else if (isSessionRevealPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-session-reveal'
      ;(globalThis as any).__conquestPushSessionId = data?.sessionId ?? null
    } else if (isConquestPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
    } else if (
      data?.screen === 'ClubSessions' ||
      (typeof data?.type === 'string' && data.type.startsWith('cs_'))
    ) {
      ;(globalThis as any).__clubSessionsPushData = { type: data.type, sessionId: data.sessionId ?? null }
    }
  })
}
console.log('[BOOT] Notification listeners set up')

let RNUxcam: any = null
try {
  RNUxcam = require('react-native-ux-cam').default
  console.log('[BOOT] UXCam loaded')
} catch {
  console.log('[BOOT] UXCam not available')
}
import { PostHogProvider, PostHogMaskView } from 'posthog-react-native'
import { posthog as posthogClient } from './src/lib/posthog'
import { initI18n } from './src/i18n'
console.log('[BOOT] All top-level imports done')

// Initialise i18n as early as possible — fire-and-forget at module level.
// The app renders a splash while this resolves (typically < 50ms from AsyncStorage).
initI18n().catch((e) => console.warn('[i18n] init error:', e))

type FlowScreen = 'main' | 'reclub-link' | 'cs-orchestrator' | 'people' | 'profile' | 'gear' | 'explore' | 'pushDebug' | 'guest-reclub' | 'guest-follow'


const BOOT_BG = '#0a0a0a'

export default function App() {
  console.log('[BOOT] App() component rendering')
  const overlayStyles = useThemedOverlayStyles()
  const [showSplash, setShowSplash] = useState(true)
  const dismissSplash = useCallback(() => {
    console.log('[BOOT] SplashScreen onFinish called')
    setShowSplash(false)
  }, [])
  const [activeTab, setActiveTab] = useState<TabId>('club-sessions')
  const [flowScreen, setFlowScreen] = useState<FlowScreen>('main')
  // Club Sessions / My Business screens can signal that the tab bar should be hidden
  // (create/edit forms, sheets, terminal confirmations per spec §15)
  const [csTabBarVisible, setCsTabBarVisible] = useState(true)
  const [myBizTabBarVisible, setMyBizTabBarVisible] = useState(true)
  const [logbookModalOpen, setLogbookModalOpen] = useState(false)
  const [circleActivityOpen, setCircleActivityOpen] = useState(false)
  const [gearReturnTo, setGearReturnTo] = useState<FlowScreen>('main')
  const [gearSheetOpen, setGearSheetOpen] = useState(false)
  const [squadDeeplinkCode, setSquadDeeplinkCode] = useState<string | null>(null)
  /** Gang-level invite code (type=gang in URL). Routes to gang onboarding, skips gang-setup. */
  const [gangInviteCode, setGangInviteCode] = useState<string | null>(null)
  const circleScreenRef = useRef<CircleScreenHandle>(null)
  const [squadDeeplinkInviteId, setSquadDeeplinkInviteId] = useState<string | null>(null)
  const [squadDeeplinkSquadId, setSquadDeeplinkSquadId] = useState<string | null>(null)
  /** PlayerProfile UUID from /u/{profileId} deep link — resolved after auth is ready. */
  const [pendingDeeplinkProfileId, setPendingDeeplinkProfileId] = useState<string | null>(null)

  // Scroll-driven nav bar hide/show (use a generous fixed height — avoids calling
  // useSafeAreaInsets before SafeAreaProvider is mounted)
  const NAV_SLIDE_DISTANCE = 100
  const navBarAnim = useRef(new Animated.Value(0)).current
  const navBarVisible = useRef(true)
  const handleNavScroll = useCallback((scrollingDown: boolean) => {
    if (scrollingDown && navBarVisible.current) {
      navBarVisible.current = false
      Animated.spring(navBarAnim, { toValue: NAV_SLIDE_DISTANCE, useNativeDriver: true, speed: 20, bounciness: 0 }).start()
    } else if (!scrollingDown && !navBarVisible.current) {
      navBarVisible.current = true
      Animated.spring(navBarAnim, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
    }
  }, [navBarAnim])

  // Fonts load in parallel — do not block the first paint on them (that caused
  // a solid black frame between the native splash and the JS splash).
  const [fontsLoaded, fontError] = useFonts({
    Bangers_400Regular: require('./assets/fonts/Bangers_400Regular.ttf'),
    Lobster_400Regular,
    DMSans_400Regular,
    DMSans_700Bold,
    DMSans_900Black,
  })
  useEffect(() => {
    if (fontError) console.warn('[BOOT] Font loading error:', fontError)
    else if (fontsLoaded) console.log('[BOOT] fonts ready')
  }, [fontsLoaded, fontError])

  const jwt = useAuthStore((s) => s.jwt)
  const authStore = useAuthStore()
  const profileId = useAuthStore((s) => s.profileId)
  const guestReclubUserId = useUiStore((s) => s.guestReclubUserId)
  const storedGender = useAuthStore((s) => s.gender)
  const pushTokenRegistered = useRef(false)
  const bootStatusFetched = useRef(false)
  const prevJwtRef = useRef<string | null | undefined>(undefined)
  const [csOrchestratorMode, setCsOrchestratorMode] = useState<CsOrchestratorMode>('full-identity')

  const setGenderInStore = useAuthStore((s) => s.setGender)

  const { gear, loading: gearLoading, saving: gearSaving, error: gearError, saveGear, savedConfirmation, gearSetupComplete } =
    useGearProfile(profileId ?? null, authStore.authedFetch, setGenderInStore)

  const handleGearSave = async (updated: GearProfile) => {
    const ok = await saveGear(updated)
    if (ok) setFlowScreen(gearReturnTo)
  }

  const handleGearSheetSave = async (updated: GearProfile) => {
    const ok = await saveGear(updated)
    if (ok) setGearSheetOpen(false)
  }

  // Deep link + push routing for squads, gangs, and Circle profiles
  useEffect(() => {
    function parseSquadDeeplink(url: string | null) {
      if (!url) return

      // /u/{profileId} — Circle profile deep link
      const profileMatch = url.match(/\/u\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      if (profileMatch) {
        const targetProfileId = profileMatch[1]
        const { jwt } = useAuthStore.getState()
        setActiveTab('circle')
        if (jwt) {
          // Auth ready — open profile sheet directly
          setTimeout(() => circleScreenRef.current?.openProfileByProfileId(targetProfileId), 200)
        } else {
          // Store for after sign-in
          setPendingDeeplinkProfileId(targetProfileId)
        }
        return
      }

      // Match /join/CODE with optional ?type=gang|clubhouse
      const match = url.match(/\/join\/([A-Za-z0-9]+)/)
      if (match) {
        const code = match[1].toUpperCase()
        // Discriminate by ?type param:
        //   type=gang       → Gang invite (friend-to-friend)
        //   type=clubhouse  → Clubhouse admin invite — routes to join-preview
        //   (no type)       → Legacy default — treat as clubhouse invite for backward compat
        const typeMatch = url.match(/[?&]type=([a-z]+)/)
        const inviteType = typeMatch?.[1] ?? 'clubhouse'
        if (inviteType === 'gang') {
          setGangInviteCode(code)
        } else {
          setSquadDeeplinkCode(code)
        }
        setActiveTab('squadd')
        return
      }

      // Bare /join — generic download landing (guest QR); open circle tab
      if (/\/join\/?$/.test(url.split('?')[0])) {
        setActiveTab('circle')
      }
    }

    Linking.getInitialURL().then(parseSquadDeeplink)
    const sub = Linking.addEventListener('url', (e) => parseSquadDeeplink(e.url))

    const pushData = (globalThis as any).__squadPushData
    if (pushData) {
      if (pushData.inviteId) setSquadDeeplinkInviteId(pushData.inviteId)
      if (pushData.squadId) setSquadDeeplinkSquadId(pushData.squadId)
      setActiveTab('squadd')
      delete (globalThis as any).__squadPushData
    }

    // Club Sessions push: route to sessions tab on cold-start tap
    const csPushData = (globalThis as any).__clubSessionsPushData
    if (csPushData) {
      setActiveTab('club-sessions')
      delete (globalThis as any).__clubSessionsPushData
    }

    return () => sub.remove()
  }, [])

  useEffect(() => {
    debugLog('App', '=== SQUADD Boot Diagnostics ===')
    debugLog('App', `Platform: ${Platform.OS} ${Platform.Version}`)
    debugLog('App', `__DEV__: ${__DEV__}`)
    debugLog('App', `API Base: ${resolveApiBase()}`)
    debugLog('App', `EXPO_PUBLIC_API_URL env: ${process.env.EXPO_PUBLIC_API_URL ?? '<not set>'}`)
    debugLog('App', `expoConfig.extra.apiUrl: ${Constants.expoConfig?.extra?.apiUrl ?? '<not set>'}`)
    debugLog('App', `EXPO_PUBLIC_GOOGLE_CLIENT_ID env: ${process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ? 'set' : '<not set>'}`)
    debugLog('App', '================================')

    if (__DEV__) {
      // Only resolve the API base URL — do NOT auto-sign-in on cold start.
      void useAuthStore.getState().ensureDevApiBase().then(() => {
        debugLog('App', `Dev API base resolved: ${resolveApiBase()}`)
      })
    }

    if (RNUxcam) {
      try {
        RNUxcam.optIntoSchematicRecordings()
        RNUxcam.startWithConfiguration({
          userAppKey: 'fex34xqkmrtg0cv-us',
          enableAutomaticScreenNameTagging: false,
          enableImprovedScreenCapture: true,
        })
        debugLog('App', 'UXCam initialized')
      } catch {
        debugLog('App', 'UXCam init failed — skipping')
      }
    } else {
      debugLog('App', 'UXCam not available (Expo Go) — skipping')
    }
  }, [])

  useEffect(() => {
    void useUiStore.getState().hydrate()
    void useAvatarCacheStore.getState().hydrate()
  }, [])

  // Resolve IP geolocation once after sign-in — sets showReclub + market in authStore.
  // This is what gates the 'reclub' step in the onboarding sequence.
  useIpGeolocation()

  // Auto-refresh content when app returns from background after 30+ minutes
  const backgroundTimestampRef = useRef<number | null>(null)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundTimestampRef.current = Date.now()
      } else if (nextState === 'active' && backgroundTimestampRef.current) {
        const elapsed = Date.now() - backgroundTimestampRef.current
        const THIRTY_MIN = 30 * 60 * 1000
        if (elapsed >= THIRTY_MIN) {
          debugLog('App', `Returned from background after ${Math.round(elapsed / 60000)}min — triggering refresh`)
          useUiStore.getState().triggerBackgroundRefresh()
          useSessionStore.getState().fetchSessions(
            useSessionStore.getState()._lastLat,
            useSessionStore.getState()._lastLng,
            useSessionStore.getState()._lastDate,
          )
        }
        backgroundTimestampRef.current = null
      }
    })
    return () => subscription.remove()
  }, [])

  // Re-fetch the swipe deck once authenticated so friend data is included.
  const didRefetchForAuth = useRef(false)
  useEffect(() => {
    if (!jwt || didRefetchForAuth.current) return
    didRefetchForAuth.current = true
    debugLog('App', 'Auth ready — re-fetching deck with credentials for friend data')
    useSessionStore.getState().fetchSessions(
      useSessionStore.getState()._lastLat,
      useSessionStore.getState()._lastLng,
      useSessionStore.getState()._lastDate,
    )
  }, [jwt])

  // Boot-status hydration — single call after JWT is available.
  // Hydrates hasCompletedOnboarding + hasActiveSquad from server truth.
  // The Squadd onboarding orchestrator is fully isolated and never called from here.
  useEffect(() => {
    if (!jwt || bootStatusFetched.current) return
    bootStatusFetched.current = true
    consumeSignedInFromClubSessions()
    void useAuthStore.getState().hydrateBootStatus().then(() => {
      debugLog('App', 'boot-status: hydrated → main')
      // Hydrate logbook sport preference from the boot-status payload
      void useLogbookStore.getState().hydrate(
        useAuthStore.getState().logbookSportId ?? 'pickleball'
      )
      // Only navigate to main if we are not already in a deliberate flow
      // (e.g. cs-orchestrator set by handleSignedIn — must not be overridden)
      setFlowScreen((current) => {
        if (current === 'cs-orchestrator' || current === 'guest-reclub' || current === 'guest-follow') {
          return current
        }
        return 'main'
      })
    })
  }, [jwt, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve a pending /u/{profileId} deep link once the user is authenticated.
  useEffect(() => {
    if (!jwt || !pendingDeeplinkProfileId) return
    const targetProfileId = pendingDeeplinkProfileId
    setPendingDeeplinkProfileId(null)
    setActiveTab('circle')
    setTimeout(() => circleScreenRef.current?.openProfileByProfileId(targetProfileId), 300)
  }, [jwt, pendingDeeplinkProfileId])

  // Detect sign-out / account deletion: when jwt transitions from a value to null,
  // reset all per-session refs and routing state so the next sign-in starts fresh.
  useEffect(() => {
    const wasSignedIn = prevJwtRef.current != null && prevJwtRef.current !== undefined
    const isNowSignedOut = !jwt
    if (wasSignedIn && isNowSignedOut) {
      debugLog('App', 'jwt cleared — resetting boot state for next sign-in')
      bootStatusFetched.current = false
      pushTokenRegistered.current = false
      setFlowScreen('main')
      setCsOrchestratorMode('full-identity')
      // Clear Circle screen local state and guest Reclub state so the
      // screen looks brand-new when the next user signs in.
      circleScreenRef.current?.reset()
      useUiStore.getState().clearGuestState()
    }
    prevJwtRef.current = jwt
  }, [jwt])

  // Register push token after authentication + listen for FCM token rotation
  useEffect(() => {
    if (!jwt || pushTokenRegistered.current) return

    const { authedFetch } = useAuthStore.getState()

    // Do not prompt the OS here — NotificationPermissionSheet requests permission
    // only after the user taps "Allow notifications" on the in-app popup.
    registerForPushNotifications({ requestPermission: false }).then(async (token) => {
      if (token) {
        console.log('[push] token obtained, uploading to backend. Platform:', Platform.OS, '| prefix:', token.slice(0, 30))
        const uploaded = await uploadPushToken(token, Platform.OS, authedFetch)
        if (uploaded) {
          pushTokenRegistered.current = true
          console.log('[push] ✅ token uploaded successfully')
        } else {
          console.warn('[push] ❌ token upload failed — will retry on next app launch')
        }
      } else {
        console.warn('[push] no token returned — permission denied or not a physical device')
      }
    })

    // Listen for FCM token rotation (Android token can change after app update,
    // Google Play Services update, or cache clear)
    let unsubscribeTokenRefresh: (() => void) | undefined
    if (!IS_EXPO_GO) {
      try {
        const messagingModule = require('@react-native-firebase/messaging')
        const messaging = messagingModule.default
        unsubscribeTokenRefresh = messaging().onTokenRefresh(async (newToken: string) => {
          console.log('[push] FCM token refreshed — uploading new token, prefix:', newToken.slice(0, 20))
          await uploadPushToken(newToken, Platform.OS, authedFetch)
        })
      } catch (err: any) {
        console.warn('[push] RN Firebase messaging unavailable for token refresh:', err?.message)
      }
    } else {
      console.log('[push] skipping RN Firebase token refresh listener in Expo Go')
    }

    return () => { unsubscribeTokenRefresh?.() }
  }, [jwt])

  // Handle notification taps — navigate to the correct screen
  useEffect(() => {
    return useNotificationListeners(
      (notification) => {
        if (__DEV__) console.log('[push] received:', notification.request.content)
      },
      (response) => {
        const data = response.notification.request.content.data as Record<string, string> | undefined
        if (data?.screen === 'ChestDetail') {
          debugLog('App', `Chest PNS tapped — chestId=${data?.chestId} squadId=${data?.squadId}`)
          setSquadDeeplinkSquadId(data?.squadId ?? null)
          setActiveTab('squadd')
        } else if (data?.type === 'squad_invite' || data?.screen === 'SquadInviteReceive') {
          debugLog('App', `Squad invite PNS tapped — squadId=${data?.squadId} inviteId=${data?.inviteId}`)
          setSquadDeeplinkInviteId(data?.inviteId ?? null)
          setSquadDeeplinkSquadId(data?.squadId ?? null)
          setActiveTab('squadd')
        } else if (isConquestPush(data)) {
          // Conquest push notification — navigate to the squad conquest alerts screen
          ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
          setActiveTab('squadd')
        } else if (
          data?.screen === 'ClubSessions' ||
          (typeof data?.type === 'string' && data.type.startsWith('cs_'))
        ) {
          // Club Sessions push notification — navigate to the sessions tab
          setActiveTab('club-sessions')
        } else if (data?.screen === 'Circle') {
          setActiveTab('circle')
          if (data?.type === 'pn4' && data.followerUserId) {
            const follower: PendingNewFollower = {
              userId: data.followerUserId,
              displayName: data.followerName || 'Someone',
              imageUrl: data.followerImageUrl || null,
            }
            useUiStore.getState().setPendingNewFollower(follower)
          }
          if (data?.type === 'pn6' && data.followeeUserId) {
            useUiStore.getState().setPendingKudosTarget(data.followeeUserId)
          }
          if (data?.type === 'pn7') {
            debugLog('App', `PN7 tap — sessionId=${data.sessionId ?? 'unknown'}`)
          }
          if (data?.type === 'pn8') {
            debugLog('App', `PN8 tap — gear setup, followee=${data.followeeUserId ?? 'unknown'}`)
          }
        }
      }
    )
  }, [])

  const handleSignedIn = (_needsOnboarding: boolean) => {
    bootStatusFetched.current = false
    const isGuestFlow = flowScreen === 'guest-follow' || flowScreen === 'guest-reclub'
    const hasLinkedReclub = !!useUiStore.getState().guestReclubUserId
    if (isGuestFlow || hasLinkedReclub) {
      // Guest flow: user browsed as guest (Reclub+follows already done).
      // Skip the Reclub step — go straight to nickname → avatar → dupr only.
      setSignedInFromClubSessions(true)
      setCsOrchestratorMode('post-guest')
      setFlowScreen('cs-orchestrator')
    } else {
      // All other sign-ins: hand off to ClubSessionsModule which owns the
      // full-identity onboarding and the smart "already done" check.
      setActiveTab('club-sessions')
    }
  }

  /**
   * Called after a successful Google/Apple sign-in from Circle's SignInPrompt.
   * Hands off to the Sessions tab (ClubSessionsModule) which already has the
   * correct smart check: existing users land on home, new users go through
   * onboarding. Once done the user can switch back to Circle.
   */
  const handleCircleSignedIn = () => {
    bootStatusFetched.current = false
    setSignedInFromClubSessions(true)
    setActiveTab('club-sessions')
  }

  const startLinkReclub = () => {
    setFlowScreen('reclub-link')
  }

  const startGuestReclubFlow = () => {
    setFlowScreen('guest-reclub')
  }

  const handleGuestReclubComplete = (reclubUserId: string) => {
    useUiStore.getState().setGuestReclubUserId(reclubUserId)
    setFlowScreen('guest-follow')
  }

  const handleGuestFollowComplete = () => {
    setFlowScreen('main')
    setActiveTab('circle')
    // Open Players sub-tab so the user immediately sees the circle they've browsed
    setTimeout(() => circleScreenRef.current?.openPlayersTab(), 100)
  }

  // Called when CsOnboardingOrchestrator finishes (Circle / Sessions paths).
  // Replays ghost-follows for guest sign-ins, then navigates to Circle or Sessions.
  // Never routes to Squadd.
  const handleCsOrchestratorComplete = () => {
    void csOnboardingStorage.setDone()
    void csOnboardingStorage.clearStep()
    const { guestPendingFollows, guestReclubUserId } = useUiStore.getState()

    if (guestPendingFollows.length > 0 || guestReclubUserId) {
      setFlowScreen('main')
      setActiveTab('circle')
      if (guestPendingFollows.length > 0) {
        setTimeout(() => circleScreenRef.current?.openPlayersTab(), 100)
      }

      void (async () => {
        const { authedFetch, profileId } = useAuthStore.getState()
        if (guestReclubUserId) {
          await authedFetch('/api/profile', {
            method: 'POST',
            body: JSON.stringify({ profileId, reclubUserId: guestReclubUserId }),
          }).catch(() => {})
          // Hydrate the auth store so reclubUserId is available to CircleScreen
          await useAuthStore.getState().hydrateBootStatus().catch(() => {})
        }
        if (guestPendingFollows.length > 0) {
          await Promise.allSettled(
            guestPendingFollows.map((userId) =>
              authedFetch('/api/follows', { method: 'POST', body: JSON.stringify({ followeeId: userId }) })
            )
          )
        }
        useUiStore.getState().clearGuestState()
        // Trigger a fresh reload of feed + friends + suggestions now that
        // the auth store has the real reclubUserId
        useUiStore.getState().triggerLinkReclub()
      })()
      return
    }

    setFlowScreen('main')
    setActiveTab('circle')
  }

  const handlePeopleComplete = () => {
    useSessionStore.getState().fetchSessions(null, null)
    setFlowScreen('main')
    setActiveTab('circle')
  }

  console.log('[BOOT] GATE: rendering app, showSplash:', showSplash, 'flowScreen:', flowScreen)

  // Splash stays as an opaque overlay while the real tree mounts underneath.
  const splashOverlay = showSplash ? <SplashScreen onFinish={dismissSplash} /> : null

  if (flowScreen === 'guest-reclub') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: BOOT_BG }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
            <SignUpModalProvider onSignedIn={handleSignedIn}>
              <GuestReclubScreen
                onComplete={handleGuestReclubComplete}
                onClose={() => setFlowScreen('main')}
              />
            </SignUpModalProvider>
          </ThemedAppChrome>
        </SafeAreaProvider>
        {splashOverlay}
      </GestureHandlerRootView>
    )
  }

  if (flowScreen === 'guest-follow') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: BOOT_BG }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
            <SignUpModalProvider onSignedIn={handleSignedIn}>
              <GuestFollowPlayersScreen
                reclubUserId={guestReclubUserId}
                onComplete={handleGuestFollowComplete}
                onBack={() => setFlowScreen('guest-reclub')}
              />
            </SignUpModalProvider>
          </ThemedAppChrome>
        </SafeAreaProvider>
        {splashOverlay}
      </GestureHandlerRootView>
    )
  }

  if (flowScreen === 'cs-orchestrator') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: BOOT_BG }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
            <CsOnboardingOrchestrator
              mode={csOrchestratorMode}
              onComplete={handleCsOrchestratorComplete}
              onDismiss={() => {
                setFlowScreen('main')
                setActiveTab('circle')
              }}
            />
          </ThemedAppChrome>
        </SafeAreaProvider>
        {splashOverlay}
      </GestureHandlerRootView>
    )
  }


  if (flowScreen === 'people') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: BOOT_BG }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
          <PeopleYouMayKnowScreen onComplete={handlePeopleComplete} />
          </ThemedAppChrome>
        </SafeAreaProvider>
        {splashOverlay}
      </GestureHandlerRootView>
    )
  }

  if (flowScreen === 'pushDebug') {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: BOOT_BG }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
          <PushDebugScreen onClose={() => setFlowScreen('profile')} />
          </ThemedAppChrome>
        </SafeAreaProvider>
        {splashOverlay}
      </GestureHandlerRootView>
    )
  }

  return (
    <PostHogProvider
      client={posthogClient}
      options={{
        enableSessionReplay: true,
        sessionReplayConfig: {
          maskAllTextInputs: true,
          maskAllImages: false,
          captureLog: true,
          androidDebouncerDelayMs: 500,
          iOSDebouncerDelayMs: 500,
        },
      }}
      autocapture
    >
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BOOT_BG }}>
      <SafeAreaProvider>
        <ThemedAppChrome>
        <SignUpModalProvider onSignedIn={handleSignedIn}>
          <ProfileMenuProvider
            onOpenProfile={() => setFlowScreen('profile')}
          >
            <View style={{ flex: 1 }}>
              {/* All screens stay mounted — hidden via display:'none' to prevent reloads */}
              <View style={{ flex: 1, display: activeTab === 'circle' ? 'flex' : 'none' }}>
                <CircleScreen
                  ref={circleScreenRef}
                  onOpenGear={() => {
                    setGearReturnTo('main')
                    setFlowScreen('gear')
                  }}
                  gearSaved={savedConfirmation}
                  gearSetupComplete={gearSetupComplete}
                  onStartGuestReclub={startGuestReclubFlow}
                  onLinkReclub={startLinkReclub}
                  onSignIn={() => { void handleCircleSignedIn() }}
                  onActivityChange={setCircleActivityOpen}
                  onNavScroll={handleNavScroll}
                />
              </View>
              <View style={{ flex: 1, display: activeTab === 'squadd' ? 'flex' : 'none' }}>
                <SquadModule
                  deeplinkCode={squadDeeplinkCode}
                  deeplinkInviteId={squadDeeplinkInviteId}
                  deeplinkSquadId={squadDeeplinkSquadId}
                  isActive={activeTab === 'squadd'}
                  onNavigateToPlayers={() => {
                    setActiveTab('circle')
                    circleScreenRef.current?.openPlayersTab()
                  }}
                />
              </View>
              <View style={{ flex: 1, display: activeTab === 'club-sessions' ? 'flex' : 'none' }}>
                <ClubSessionsModule
                  isActive={activeTab === 'club-sessions'}
                  onTabBarVisibilityChange={setCsTabBarVisible}
                  onOpenGearSheet={() => setGearSheetOpen(true)}
                  gearSaved={savedConfirmation}
                  gearSetupComplete={gearSetupComplete}
                  onLinkReclub={startLinkReclub}
                />
              </View>
              <View style={{ flex: 1, display: activeTab === 'my-business' ? 'flex' : 'none' }}>
                <MyBusinessModule
                  isActive={activeTab === 'my-business'}
                  onTabBarVisibilityChange={setMyBizTabBarVisible}
                  onLinkReclub={startLinkReclub}
                />
              </View>
              <View style={{ flex: 1, display: activeTab === 'logbook' ? 'flex' : 'none' }}>
                <LogbookScreen
                  isActive={activeTab === 'logbook'}
                  onModalOpenChange={setLogbookModalOpen}
                />
              </View>
              {/* Floating tab bar — hidden during reclub-link (fullscreen overlay), explore, circle activity, and logbook modals */}
              {flowScreen !== 'explore' && flowScreen !== 'reclub-link' && !circleActivityOpen && !logbookModalOpen && (activeTab !== 'club-sessions' || csTabBarVisible) && (activeTab !== 'my-business' || myBizTabBarVisible) && (
                <Animated.View
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, transform: [{ translateY: navBarAnim }] }}
                  pointerEvents="box-none"
                >
                  <NavBar active={activeTab} onChange={(tab) => {
                    // Reset nav bar when switching tabs
                    if (tab !== activeTab) {
                      navBarVisible.current = true
                      navBarAnim.setValue(0)
                    }
                    setActiveTab(tab)
                  }} />
                </Animated.View>
              )}
              <ToastOverlay />
            </View>
            {flowScreen === 'explore' && (
              <View style={StyleSheet.absoluteFillObject}>
                <ExploreSessionsScreen onClose={() => {
                  navBarVisible.current = true
                  navBarAnim.setValue(0)
                  setFlowScreen('main')
                }} />
              </View>
            )}
            {flowScreen === 'profile' && (
              <PostHogMaskView style={StyleSheet.absoluteFillObject}>
                <ProfileScreen
                  onClose={() => setFlowScreen('main')}
                  onLinkReclub={startLinkReclub}
                  onOpenGearSheet={() => {
                    setGearReturnTo('profile')
                    setFlowScreen('gear')
                  }}
                  onOpenPushDebug={() => setFlowScreen('pushDebug')}
                  onOpenClubSessions={() => {
                    setActiveTab('club-sessions')
                    setFlowScreen('main')
                  }}
                />
              </PostHogMaskView>
            )}
            {flowScreen === 'reclub-link' && (
              <View style={StyleSheet.absoluteFillObject}>
                <ReclubLinkScreen
                  onClose={() => {
                    navBarVisible.current = true
                    navBarAnim.setValue(0)
                    setFlowScreen('main')
                    // Only trigger a Circle refresh if a Reclub account was actually linked
                    if (useAuthStore.getState().reclubUserId) {
                      useUiStore.getState().triggerLinkReclub()
                    }
                  }}
                />
              </View>
            )}
          </ProfileMenuProvider>
        </SignUpModalProvider>

        {(flowScreen === 'gear' || gearSheetOpen) && (
          <PostHogMaskView style={overlayStyles.gearOverlay} pointerEvents="box-none">
            <Pressable
              style={overlayStyles.gearBackdrop}
              onPress={() => {
                if (gearSheetOpen) setGearSheetOpen(false)
                else setFlowScreen(gearReturnTo)
              }}
            />
            <View style={overlayStyles.gearSheet} pointerEvents="auto">
              <GearSetupScreen
                gender={playerGenderFromStored(storedGender ?? gear.gender)}
                initialGear={gear}
                saving={gearSaving}
                error={gearError}
                onSave={gearSheetOpen ? handleGearSheetSave : handleGearSave}
                onBack={() => {
                  if (gearSheetOpen) setGearSheetOpen(false)
                  else setFlowScreen(gearReturnTo)
                }}
                savedConfirmation={savedConfirmation}
                closeIcon="close"
                embedded
              />
            </View>
          </PostHogMaskView>
        )}
        </ThemedAppChrome>
      </SafeAreaProvider>
      {splashOverlay}
    </GestureHandlerRootView>
    </PostHogProvider>
  )
}
