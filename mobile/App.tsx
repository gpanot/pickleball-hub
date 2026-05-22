import React, { useState } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavBar, type TabId } from './src/components/NavBar'
import { SwipeScreen } from './src/screens/SwipeScreen'
import { ShortlistScreen } from './src/screens/ShortlistScreen'
import { ProfileScreen } from './src/screens/ProfileScreen'
import { OnboardingScreen } from './src/screens/OnboardingScreen'
import { PeopleYouMayKnowScreen } from './src/screens/PeopleYouMayKnowScreen'
import { SignUpModal } from './src/components/SignUpModal'
import { useAuthStore } from './src/stores/authStore'

type FlowScreen = 'main' | 'onboarding' | 'people'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('swipe')
  const [flowScreen, setFlowScreen] = useState<FlowScreen>('main')
  const [showSignUp, setShowSignUp] = useState(false)

  const isSignedIn = useAuthStore((s) => s.isSignedIn)

  const handleSignedIn = (needsOnboarding: boolean) => {
    if (needsOnboarding) {
      setFlowScreen('onboarding')
    } else {
      setFlowScreen('main')
    }
  }

  const handleOnboardingComplete = () => {
    const { reclubUserId } = useAuthStore.getState()
    if (reclubUserId) {
      setFlowScreen('people')
    } else {
      setFlowScreen('main')
    }
  }

  const handlePeopleComplete = () => {
    setFlowScreen('main')
  }

  // Full-screen flows (no nav bar)
  if (flowScreen === 'onboarding') {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <OnboardingScreen onComplete={handleOnboardingComplete} />
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
        return (
          <SwipeScreen
            onNavigateToShortlist={() => setActiveTab('shortlist')}
            onSignUpPrompt={() => setShowSignUp(true)}
            onNavigateToProfile={() => setActiveTab('profile')}
          />
        )
      case 'shortlist':
        return <ShortlistScreen />
      case 'profile':
        return <ProfileScreen />
      default:
        return null
    }
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          {renderScreen()}
          <NavBar active={activeTab} onChange={setActiveTab} />
        </View>

        <SignUpModal
          visible={showSignUp}
          onClose={() => setShowSignUp(false)}
          onSignedIn={handleSignedIn}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
