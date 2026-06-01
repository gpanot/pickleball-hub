import React, { useState, useEffect, useRef } from 'react'
import { View, Pressable, Platform, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { NavBar, type TabId } from './src/components/NavBar'
import { SwipeScreen } from './src/screens/SwipeScreen'
import { ExploreSessionsScreen } from './src/screens/ExploreSessionsScreen'
import { CircleScreen } from './src/screens/CircleScreen'
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
import * as Notifications from 'expo-notifications'
import { registerForPushNotifications, useNotificationListeners, uploadPushToken } from './src/services/notifications'
import { SplashScreen } from './src/screens/SplashScreen'
import { debugLog } from './src/lib/debug'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
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

// FCM debug listeners — log every message event regardless of app state
try {
  const messagingModule = require('@react-native-firebase/messaging')
  const messaging = messagingModule.default

  messaging().onMessage(async (remoteMessage: any) => {
    console.log('[FCM_DEBUG] foreground message received:', JSON.stringify(remoteMessage, null, 2))
  })

  messaging().onNotificationOpenedApp((remoteMessage: any) => {
    console.log('[FCM_DEBUG] notification opened app:', JSON.stringify(remoteMessage, null, 2))
  })

  messaging().getInitialNotification().then((remoteMessage: any) => {
    if (remoteMessage) {
      console.log('[FCM_DEBUG] app opened from quit state:', JSON.stringify(remoteMessage, null, 2))
    }
  })

  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    console.log('[FCM_DEBUG] background message received:', JSON.stringify(remoteMessage, null, 2))
  })
} catch (err: any) {
  console.warn('[FCM_DEBUG] could not attach FCM debug listeners:', err?.message)
}

Notifications.addNotificationReceivedListener((notification) => {
  console.log('[EXPO_DEBUG] notification received:', JSON.stringify(notification, null, 2))
})

Notifications.addNotificationResponseReceivedListener((response) => {
  console.log('[EXPO_DEBUG] notification tapped:', JSON.stringify(response, null, 2))
})

let RNUxcam: any = null
try {
  RNUxcam = require('react-native-ux-cam').default
} catch {}
import { PostHogProvider, PostHogMaskView } from 'posthog-react-native'

type FlowScreen = 'main' | 'onboarding' | 'people' | 'profile' | 'gear' | 'explore'

const POSTHOG_API_KEY = 'phc_uZqiFnt6NpnpjL3QPbD4RmpJZaByiJChD5pcrcySXjGJ'
const POSTHOG_HOST = 'https://us.i.posthog.com'
const IS_EXPO_GO = Constants.appOwnership === 'expo'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('swipe')
  const [flowScreen, setFlowScreen] = useState<FlowScreen>('main')
  const [gearReturnTo, setGearReturnTo] = useState<FlowScreen>('main')
  const [gearSheetOpen, setGearSheetOpen] = useState(false)
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0)

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

  useEffect(() => {
    debugLog('App', '=== SQUADD Boot Diagnostics ===')
    debugLog('App', `Platform: ${Platform.OS} ${Platform.Version}`)
    debugLog('App', `__DEV__: ${__DEV__}`)
    debugLog('App', `API Base: ${resolveApiBase()}`)
    debugLog('App', `EXPO_PUBLIC_API_URL env: ${process.env.EXPO_PUBLIC_API_URL ?? '<not set>'}`)
    debugLog('App', `expoConfig.extra.apiUrl: ${Constants.expoConfig?.extra?.apiUrl ?? '<not set>'}`)
    debugLog('App', `EXPO_PUBLIC_GOOGLE_CLIENT_ID env: ${process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ? 'set' : '<not set>'}`)
    debugLog('App', '================================')

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

    registerForPushNotifications().then(async (token) => {
      if (token) {
        pushTokenRegistered.current = true
        console.log('[push] token obtained, uploading to backend. Prefix:', token.slice(0, 30))
        await uploadPushToken(token, Platform.OS, authedFetch)
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
        if (data?.screen === 'Circle') {
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
            // Scroll Circle feed to the player who just finished so user can give kudos
            useUiStore.getState().setPendingKudosTarget(data.followeeUserId)
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

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />
  }

  if (flowScreen === 'onboarding') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <OnboardingScreen
            initialStep={onboardingInitialStep}
            onComplete={handleOnboardingComplete}
            onCancel={cancelOnboarding}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  }

  if (flowScreen === 'people') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <PeopleYouMayKnowScreen onComplete={handlePeopleComplete} />
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
        <StatusBar style="light" />
        <SignUpModalProvider onSignedIn={handleSignedIn}>
          <ProfileMenuProvider
            onOpenProfile={() => setFlowScreen('profile')}
          >
            <View style={{ flex: 1 }}>
              {/* All screens stay mounted — hidden via display:'none' to prevent reloads */}
              <View style={{ flex: 1, display: activeTab === 'circle' ? 'flex' : 'none' }}>
                <CircleScreen
                  onOpenGear={() => {
                    setGearReturnTo('main')
                    setFlowScreen('gear')
                  }}
                  gearSaved={savedConfirmation}
                  gearSetupComplete={gearSetupComplete}
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
                />
              </PostHogMaskView>
            )}
          </ProfileMenuProvider>
        </SignUpModalProvider>

        {(flowScreen === 'gear' || gearSheetOpen) && (
          <PostHogMaskView style={styles.gearOverlay} pointerEvents="box-none">
            <Pressable
              style={styles.gearBackdrop}
              onPress={() => {
                if (gearSheetOpen) setGearSheetOpen(false)
                else setFlowScreen(gearReturnTo)
              }}
            />
            <View style={styles.gearSheet} pointerEvents="auto">
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </PostHogProvider>
  )
}

const styles = StyleSheet.create({
  gearOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  gearBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  gearSheet: {
    height: '92%',
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
})
