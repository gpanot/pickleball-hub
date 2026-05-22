import React from 'react'
import { View, Text, TouchableOpacity, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Zap, Bookmark } from 'lucide-react-native'
import { T } from '../theme'

export type TabId = 'swipe' | 'shortlist'

export function NavBar({
  active,
  onChange,
}: {
  active: TabId
  onChange: (key: TabId) => void
}) {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0)

  const tabs: { key: TabId; icon: typeof Zap; label: string }[] = [
    { key: 'swipe', icon: Zap, label: 'Swipe' },
    { key: 'shortlist', icon: Bookmark, label: 'Shortlist' },
  ]

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: '#0a0a0a',
        borderTopWidth: 0.5,
        borderTopColor: '#1e1e1e',
        paddingBottom: bottomPad,
        paddingTop: 10,
      }}
    >
      {tabs.map(({ key, icon: Icon, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => onChange(key)}
          style={{ flex: 1, alignItems: 'center', gap: 3 }}
        >
          <Icon
            size={20}
            color={active === key ? T.amber : '#444'}
            strokeWidth={1.5}
          />
          <Text
            style={{
              fontSize: 10,
              fontWeight: active === key ? '600' : '400',
              color: active === key ? T.amber : '#444',
            }}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
