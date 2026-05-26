import React, { useState, useEffect, useRef } from 'react'
import { View, Platform, StyleSheet } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { NavBar, type TabId } from './src/components/NavBar'
import { SwipeScreen } from './src/screens/SwipeScreen'
import { CircleScreen } from './src/screens/CircleScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { PeopleYouMayKnowScreen } from './src/screens/PeopleYouMayKnowScreen'
import { ProfileSheet } from './src/components/ProfileSheet'
import { GearSetupScreen } from './src/components/gear/GearSetupScreen'
import { useGearProfile } from './src/hooks/useGearProfile'
import { playerGenderFromStored } from './src/components/gear/gearConstants'
import { SignUpModalProvider } from './src/contexts/SignUpModalContext'
import { ProfileMenuProvider } from './src/contexts/ProfileMenuContext'
import { ToastOverlay } from './src/components/Toast'
import { useAuthStore, resolveApiBase } from './src/stores/authStore'
import { useSessionStore } from './src/stores/sessionStore'
import { useUiStore } from './src/stores/uiStore'
import { useAvatarCacheStore } from './src/stores/avatarCacheStore'
import { registerForPushNotifications, useNotificationListeners } from './src/services/notifications'
import { SplashScreen } from './src/screens/SplashScreen'
import { debugLog } from './src/lib/debug'

type FlowScreen = 'main' | 'onboarding' | 'people' | 'profile' | 'gear'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('swipe')
  const [flowScreen, setFlowScreen] = useState<FlowScreen>('main')
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0)

  const jwt = useAuthStore((s) => s.jwt)
  const authStore = useAuthStore()
  const profileId = useAuthStore((s) => s.profileId)
  const pushTokenRegistered = useRef(false)

  const { gear, loading: gearLoading, saving: gearSaving, error: gearError, saveGear, savedConfirmation } =
    useGearProfile(profileId ?? null, authStore.authedFetch)

  useEffect(() => {
    debugLog('App', '=== SQUADD Boot Diagnostics ===')
    debugLog('App', `Platform: ${Platform.OS} ${Platform.Version}`)
    debugLog('App', `__DEV__: ${__DEV__}`)
    debugLog('App', `API Base: ${resolveApiBase()}`)
    debugLog('App', `EXPO_PUBLIC_API_URL env: ${process.env.EXPO_PUBLIC_API_URL ?? '<not set>'}`)
    debugLog('App', `expoConfig.extra.apiUrl: ${Constants.expoConfig?.extra?.apiUrl ?? '<not set>'}`)
    debugLog('App', `EXPO_PUBLIC_GOOGLE_CLIENT_ID env: ${process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ? 'set' : '<not set>'}`)
    debugLog('App', '================================')
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

  // Register push token after authentication
  // Re-registers on every app launch (FCM tokens can rotate)
  useEffect(() => {
    if (!jwt || pushTokenRegistered.current) return

    registerForPushNotifications().then((token) => {
      if (token) {
        pushTokenRegistered.current = true
        console.log('[push] uploading token to backend...')
        const { authedFetch } = useAuthStore.getState()
        authedFetch('/api/players/push-token', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })
          .then((res) => console.log('[push] token upload response:', res.status))
          .catch((err) => {
            pushTokenRegistered.current = false
            console.warn('[push] token upload failed', err)
          })
      } else {
        console.warn('[push] no token returned — permission denied or not a physical device')
      }
    })
  }, [jwt])

  // Handle notification taps — navigate to the correct screen
  useEffect(() => {
    return useNotificationListeners(
      (notification) => {
        if (__DEV__) console.log('[push] received:', notification.request.content)
      },
      (response) => {
        const data = response.notification.request.content.data as Record<string, string> | undefined
        if (data?.screen === 'Circle') setActiveTab('circle')
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

  if (flowScreen === 'gear') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <GearSetupScreen
            gender={playerGenderFromStored(null)}
            initialGear={gear}
            saving={gearSaving}
            error={gearError}
            onSave={saveGear}
            onBack={() => setFlowScreen('profile')}
            savedConfirmation={savedConfirmation}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    )
  }

  return (
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
                <CircleScreen />
              </View>
              <View style={{ flex: 1, display: activeTab === 'swipe' ? 'flex' : 'none' }}>
                <SwipeScreen />
              </View>
              <NavBar
                active={activeTab}
                onChange={setActiveTab}
              />
              <ToastOverlay />
            </View>
            {flowScreen === 'profile' && (
              <View style={StyleSheet.absoluteFillObject}>
                <ProfileSheet
                  onClose={() => setFlowScreen('main')}
                  onLinkReclub={startLinkReclub}
                  onRedoOnboarding={startRedoOnboarding}
                  onOpenGear={() => setFlowScreen('gear')}
                />
              </View>
            )}
          </ProfileMenuProvider>
        </SignUpModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
