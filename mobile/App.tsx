import React, { useState, useEffect, useRef } from 'react'
import { View, Pressable, Platform, AppState, StyleSheet, Linking, Text as RNText } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { NavBar, type TabId } from './src/components/NavBar'
import { SwipeScreen } from './src/screens/SwipeScreen'
import { ExploreSessionsScreen } from './src/screens/ExploreSessionsScreen'
import { CircleScreen, type CircleScreenHandle } from './src/screens/CircleScreen'
import SquadModule from './src/modules/squad/SquadModule'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { PeopleYouMayKnowScreen } from './src/screens/PeopleYouMayKnowScreen'
import { ProfileSheet } from './src/components/ProfileSheet'
import { GearSetupScreen } from './src/components/gear/GearSetupScreen'
import { useGearProfile } from './src/hooks/useGearProfile'
import { playerGenderFromStored } from './src/components/gear/gearConstants'
import type { GearProfile } from './src/components/gear/gearTypes'
import { SignUpModalProvider } from './src/contexts/SignUpModalContext'
import { ProfileMenuProvider } from './src/contexts/ProfileMenuContext'
import { ToastOverlay } from './src/components/Toast'
import { useAuthStore, resolveApiBase } from './src/stores/authStore'
import { useSessionStore } from './src/stores/sessionStore'
import { useUiStore, type PendingNewFollower } from './src/stores/uiStore'
import { useAvatarCacheStore } from './src/stores/avatarCacheStore'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerForPushNotifications, useNotificationListeners, uploadPushToken } from './src/services/notifications'
import { PushDebugScreen } from './src/screens/PushDebugScreen'
import { SplashScreen } from './src/screens/SplashScreen'
import { debugLog } from './src/lib/debug'
import { useFonts } from 'expo-font'
import { DMSans_400Regular, DMSans_700Bold } from '@expo-google-fonts/dm-sans'
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

// All other conquest FCM types that route to the alerts screen
const CONQUEST_ALERT_PUSH_TYPES = new Set([
  'territory_claimed',
  'territory_lost',
  'counter_attack',
  'conquest_session_reveal',
  'conquest_overlord_gained',
  'conquest_overlord_lost',
  'conquest_rival_posted',
  'conquest_battle_progress',
])

function isClashPush(data: any): boolean {
  return CLASH_PUSH_TYPES.has(data?.type) || data?.screen === 'ConquestRivalReveal'
}
function isBattleResultPush(data: any): boolean {
  return BATTLE_RESULT_PUSH_TYPES.has(data?.type) || data?.screen === 'ConquestBattleResult'
}
function isConquestPush(data: any): boolean {
  return (
    isClashPush(data) ||
    isBattleResultPush(data) ||
    CONQUEST_ALERT_PUSH_TYPES.has(data?.type) ||
    data?.screen === 'ConquestAlerts' ||
    data?.screen === 'ConquestReveal' ||
    data?.screen === 'ConquestLeaderboard'
  )
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
    const data = remoteMessage?.data
    if (data?.type === 'squad_invite' || data?.screen === 'SquadInviteReceive') {
      globalThis.__squadPushData = { squadId: data.squadId, inviteId: data.inviteId }
    } else if (isClashPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-rival-reveal'
    } else if (isBattleResultPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-battle-result'
      ;(globalThis as any).__conquestPushBattleId = data?.battleId ?? null
      ;(globalThis as any).__conquestPushBattleResult = data?.result ?? null
    } else if (isConquestPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
    }
  })

  messaging().getInitialNotification().then((remoteMessage: any) => {
    if (remoteMessage) {
      console.log('[FCM_DEBUG] app opened from quit state:', JSON.stringify(remoteMessage, null, 2))
      const data = remoteMessage?.data
      if (data?.type === 'squad_invite' || data?.screen === 'SquadInviteReceive') {
        globalThis.__squadPushData = { squadId: data.squadId, inviteId: data.inviteId }
      } else if (isClashPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-rival-reveal'
      } else if (isBattleResultPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-battle-result'
        ;(globalThis as any).__conquestPushBattleId = data?.battleId ?? null
        ;(globalThis as any).__conquestPushBattleResult = data?.result ?? null
      } else if (isConquestPush(data)) {
        ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
      }
    }
  })

  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    console.log('[FCM_DEBUG] background message received:', JSON.stringify(remoteMessage, null, 2))
    const ts = new Date().toISOString().substring(11, 23)
    const log = `[${ts}] 🔴 BACKGROUND: title="${remoteMessage.notification?.title}" data=${JSON.stringify(remoteMessage.data)}`
    try {
      const existing = await AsyncStorage.getItem('pns_debug_logs')
      const stored: string[] = existing ? JSON.parse(existing) : []
      stored.push(log)
      await AsyncStorage.setItem('pns_debug_logs', JSON.stringify(stored.slice(-100)))
    } catch {}
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
      ;(globalThis as any).__conquestPushBattleResult = data?.result ?? null
    } else if (isConquestPush(data)) {
      ;(globalThis as any).__conquestPushScreen = 'conquest-alerts'
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
console.log('[BOOT] All top-level imports done')

type FlowScreen = 'main' | 'onboarding' | 'people' | 'profile' | 'gear' | 'explore' | 'pushDebug'

const POSTHOG_API_KEY = 'phc_uZqiFnt6NpnpjL3QPbD4RmpJZaByiJChD5pcrcySXjGJ'
const POSTHOG_HOST = 'https://us.i.posthog.com'

export default function App() {
  console.log('[BOOT] App() component rendering')
  const overlayStyles = useThemedOverlayStyles()
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('swipe')
  const [flowScreen, setFlowScreen] = useState<FlowScreen>('main')
  const [gearReturnTo, setGearReturnTo] = useState<FlowScreen>('main')
  const [gearSheetOpen, setGearSheetOpen] = useState(false)
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0)
  const [squadDeeplinkCode, setSquadDeeplinkCode] = useState<string | null>(null)
  const circleScreenRef = useRef<CircleScreenHandle>(null)
  const [squadDeeplinkInviteId, setSquadDeeplinkInviteId] = useState<string | null>(null)
  const [squadDeeplinkSquadId, setSquadDeeplinkSquadId] = useState<string | null>(null)

  console.log('[BOOT] Loading fonts...')
  const [fontsLoaded, fontError] = useFonts({
    Bangers_400Regular: require('./assets/fonts/Bangers_400Regular.ttf'),
    DMSans_400Regular,
    DMSans_700Bold,
  })
  console.log('[BOOT] fontsLoaded:', fontsLoaded, 'fontError:', fontError)

  const [fontTimeout, setFontTimeout] = useState(false)
  useEffect(() => {
    console.log('[BOOT] Font timeout timer started (5s)')
    const timer = setTimeout(() => {
      console.log('[BOOT] Font timeout reached — proceeding without fonts')
      setFontTimeout(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (fontError) {
      console.warn('[BOOT] Font loading error:', fontError)
    }
  }, [fontError])

  const jwt = useAuthStore((s) => s.jwt)
  const authStore = useAuthStore()
  const profileId = useAuthStore((s) => s.profileId)
  const storedGender = useAuthStore((s) => s.gender)
  const pushTokenRegistered = useRef(false)

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

  // Deep link + push routing for squads
  useEffect(() => {
    function parseSquadDeeplink(url: string | null) {
      if (!url) return
      const match = url.match(/\/join\/([A-Za-z0-9]+)/)
      if (match) {
        setSquadDeeplinkCode(match[1].toUpperCase())
        setActiveTab('squadd')
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
      const { jwt, ensureServerAuth, ensureDevApiBase } = useAuthStore.getState()
      if (!jwt || jwt === 'dev-token') {
        void ensureServerAuth().then((ok) => {
          debugLog('App', ok ? 'Dev server auth upgraded to real JWT' : 'Dev server auth unavailable (offline mode)')
        })
      } else {
        void ensureDevApiBase().then(() => {
          debugLog('App', `Dev API base: ${resolveApiBase()}`)
        })
      }
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
  // On first boot the deck is fetched before the JWT is ready (jwt=none),
  // meaning swipe-deck can't resolve followedPlayerIds → friendCount=0 everywhere.
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

  const handleSignedIn = (needsOnboarding: boolean) => {
    if (needsOnboarding) {
      setOnboardingInitialStep(0)
      setFlowScreen('onboarding')
    } else {
      setFlowScreen('main')
    }
  }

  const startLinkReclub = () => {
    setOnboardingInitialStep(2)
    setFlowScreen('onboarding')
  }

  const startRedoOnboarding = () => {
    setOnboardingInitialStep(0)
    setFlowScreen('onboarding')
  }

  const cancelOnboarding = () => {
    setFlowScreen('main')
    setActiveTab('swipe')
  }

  const handleOnboardingComplete = () => {
    const { reclubUserId } = useAuthStore.getState()
    useSessionStore.getState().fetchSessions(null, null)
    if (reclubUserId) {
      setFlowScreen('people')
    } else {
      setFlowScreen('main')
      setActiveTab('swipe')
    }
  }

  const handlePeopleComplete = () => {
    useSessionStore.getState().fetchSessions(null, null)
    setFlowScreen('main')
    setActiveTab('circle')
  }

  if (!fontsLoaded && !fontError && !fontTimeout) {
    console.log('[BOOT] GATE: waiting for fonts')
    return <View style={{ flex: 1, backgroundColor: '#000' }} />
  }

  if (showSplash) {
    console.log('[BOOT] GATE: showing SplashScreen')
    return <SplashScreen onFinish={() => {
      console.log('[BOOT] SplashScreen onFinish called')
      setShowSplash(false)
    }} />
  }
  console.log('[BOOT] GATE: past splash, flowScreen:', flowScreen)

  if (flowScreen === 'onboarding') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
          <OnboardingScreen
            initialStep={onboardingInitialStep}
            onComplete={handleOnboardingComplete}
            onCancel={cancelOnboarding}
          />
          </ThemedAppChrome>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  }

  if (flowScreen === 'people') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
          <PeopleYouMayKnowScreen onComplete={handlePeopleComplete} />
          </ThemedAppChrome>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  }

  if (flowScreen === 'pushDebug') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemedAppChrome>
          <PushDebugScreen onClose={() => setFlowScreen('profile')} />
          </ThemedAppChrome>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  }

  return (
    <PostHogProvider
      apiKey={POSTHOG_API_KEY}
      options={{
        host: POSTHOG_HOST,
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
              <View style={{ flex: 1, display: activeTab === 'swipe' ? 'flex' : 'none' }}>
                <SwipeScreen
                  onOpenGearSheet={() => setGearSheetOpen(true)}
                  gearSaved={savedConfirmation}
                  gearSetupComplete={gearSetupComplete}
                  onOpenExplore={() => setFlowScreen('explore')}
                  isActive={activeTab === 'swipe'}
                />
              </View>
              {flowScreen !== 'explore' && (
                <NavBar active={activeTab} onChange={setActiveTab} />
              )}
              <ToastOverlay />
            </View>
            {flowScreen === 'explore' && (
              <View style={StyleSheet.absoluteFillObject}>
                <ExploreSessionsScreen onClose={() => setFlowScreen('main')} />
              </View>
            )}
            {flowScreen === 'profile' && (
              <PostHogMaskView style={StyleSheet.absoluteFillObject}>
                <ProfileSheet
                  onClose={() => setFlowScreen('main')}
                  onLinkReclub={startLinkReclub}
                  onRedoOnboarding={startRedoOnboarding}
                  onOpenGear={() => {
                    setGearReturnTo('profile')
                    setFlowScreen('gear')
                  }}
                  onOpenPushDebug={() => setFlowScreen('pushDebug')}
                />
              </PostHogMaskView>
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
    </GestureHandlerRootView>
    </PostHogProvider>
  )
}
