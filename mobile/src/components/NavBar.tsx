import React from 'react'
import { View, Text, TouchableOpacity, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Zap, Users, Shield } from 'lucide-react-native'
import { T } from '../theme'

export type TabId = 'swipe' | 'circle' | 'squadd'

/** Content height of the bottom tab bar (excluding safe-area padding). */
export const NAV_BAR_CONTENT_HEIGHT = 46

export function useNavBarHeight() {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0)
  return NAV_BAR_CONTENT_HEIGHT + bottomPad
}

export function NavBar({
  active,
  onChange,
  badges = {},
}: {
  active: TabId
  onChange: (key: TabId) => void
  badges?: Partial<Record<TabId, number>>
}) {
  const insets = useSafeAreaInsets()
  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 0)

  const tabs: { key: TabId; icon: typeof Zap; label: string }[] = [
    { key: 'circle', icon: Users, label: 'Circle' },
    { key: 'squadd', icon: Shield, label: 'Squadd' },
    { key: 'swipe', icon: Zap, label: 'Play' },
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
      {tabs.map(({ key, icon: Icon, label }) => {
        const badge = badges[key] ?? 0
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onChange(key)}
            style={{ flex: 1, alignItems: 'center', gap: 3 }}
            accessibilityLabel={`${label} tab${badge > 0 ? `, ${badge} items` : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === key }}
          >
            <View style={{ position: 'relative' }}>
              <Icon
                size={20}
                color={active === key ? T.amber : '#444'}
                strokeWidth={1.5}
              />
              {badge > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: '#E53935',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '700',
                      color: '#fff',
                    }}
                  >
                    {badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              )}
            </View>
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
        )
      })}
    </View>
  )
}
