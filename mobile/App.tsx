import React, { useState } from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { NavBar, type TabId } from './src/components/NavBar'
import { SwipeScreen } from './src/screens/SwipeScreen'
import { ShortlistScreen } from './src/screens/ShortlistScreen'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('swipe')

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={{ flex: 1 }}>
          {activeTab === 'swipe' ? (
            <SwipeScreen onNavigateToShortlist={() => setActiveTab('shortlist')} />
          ) : (
            <ShortlistScreen />
          )}
          <NavBar active={activeTab} onChange={setActiveTab} />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
