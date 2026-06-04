import React from 'react'
import { TouchableOpacity, View, Text, Image } from 'react-native'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../useTheme'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { useProfileMenu } from '../contexts/ProfileMenuContext'

export function ProfileAvatar({ size = 28 }: { size?: number }) {
  const T = useTheme()
  const { jwt, displayName, imageUrl } = useAuthStore()
  const { openSignUp } = useSignUpModal()
  const { openProfileSheet } = useProfileMenu()

  const initial = (displayName ?? '?')[0]?.toUpperCase() ?? '?'
  const borderWidth = size >= 40 ? 2 : 1.5

  const onPress = () => {
    if (!jwt) {
      openSignUp()
      return
    }
    openProfileSheet()
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={jwt ? 'Open profile menu' : 'Sign in'}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor: T.amber,
          overflow: 'hidden',
          backgroundColor: T.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={{
              fontSize: size * 0.38,
              fontWeight: '600',
              color: T.textSecondary,
            }}
          >
            {initial}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}
