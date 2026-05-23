import React, { useState, useEffect, useRef } from 'react'
import { View, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { NavBar, type TabId } from './src/components/NavBar'
import { SwipeScreen } from './src/screens/SwipeScreen'
import { ShortlistScreen } from './src/screens/ShortlistScreen'
import { CircleScreen } from './src/screens/CircleScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { PeopleYouMayKnowScreen } from './src/screens/PeopleYouMayKnowScreen'
import { SignUpModalProvider } from './src/contexts/SignUpModalContext'
import { ProfileMenuProvider } from './src/contexts/ProfileMenuContext'
import { ToastOverlay } from './src/components/Toast'
import { useAuthStore, resolveApiBase } from './src/stores/authStore'
import { useSessionStore } from './src/stores/sessionStore'
import { useUiStore } from './src/stores/uiStore'
import { useAvatarCacheStore } from './src/stores/avatarCacheStore'
import { registerForPushNotifications, useNotificationListeners } from './src/services/notifications'
import { debugLog } from './src/lib/debug'

type FlowScreen = 'main' | 'onboarding' | 'people'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('swipe')
  const [flowScreen, setFlowScreen] = useState<FlowScreen>('main')
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0)
  const savedCount = useSessionStore((s) => s.savedIds.size)

  const jwt = useAuthStore((s) => s.jwt)
  const pushTokenRegistered = useRef(false)

  useEffect(() => {
    debugLog('App', '=== TheHub Boot Diagnostics ===')
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

  // Register push token after authentication
  useEffect(() => {
    if (!jwt || pushTokenRegistered.current) return
    pushTokenRegistered.current = true

    registerForPushNotifications().then((token) => {
      if (token) {
        const { authedFetch } = useAuthStore.getState()
        authedFetch('/api/players/push-token', {
          method: 'POST',
          body: JSON.stringify({ token }),
        }).catch((err) => console.warn('[push] token upload failed', err))
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
        if (data?.screen === 'Shortlist') setActiveTab('shortlist')
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
    if (reclubUserId) {
      setFlowScreen('people')
    } else {
      setFlowScreen('main')
      setActiveTab('swipe')
    }
  }

  const handlePeopleComplete = () => {
    setFlowScreen('main')
    setActiveTab('circle')
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

  const renderScreen = () => {
    switch (activeTab) {
      case 'swipe':
        return <SwipeScreen onNavigateToShortlist={() => setActiveTab('shortlist')} />
      case 'circle':
        return <CircleScreen />
      case 'shortlist':
        return <ShortlistScreen onNavigateToSwipe={() => setActiveTab('swipe')} />
      default:
        return null
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SignUpModalProvider onSignedIn={handleSignedIn}>
          <ProfileMenuProvider
            onLinkReclub={startLinkReclub}
            onRedoOnboarding={startRedoOnboarding}
          >
            <View style={{ flex: 1 }}>
              {renderScreen()}
              <NavBar
                active={activeTab}
                onChange={setActiveTab}
                badges={{ shortlist: savedCount }}
              />
              <ToastOverlay />
            </View>
          </ProfileMenuProvider>
        </SignUpModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
