import React, { useMemo, useState } from 'react'
import { View, Text, Image, StyleSheet } from 'react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { resolvePlayerImageUrl, reclubAvatarUrl } from '../lib/avatar'
import { useAvatarCacheStore } from '../stores/avatarCacheStore'

export function PlayerAvatar({
  userId,
  displayName,
  imageUrl,
  size = 46,
  style,
}: {
  userId: string
  displayName?: string | null
  imageUrl?: string | null
  size?: number
  style?: object
}) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const cached = useAvatarCacheStore((s) => s.cache[userId])
  const remember = useAvatarCacheStore((s) => s.remember)
  const [failed, setFailed] = useState(false)

  const primaryUri = resolvePlayerImageUrl(userId, imageUrl, cached)
  const fallbackUri = reclubAvatarUrl(userId)
  const [useFallback, setUseFallback] = useState(
    () => !!imageUrl && primaryUri === fallbackUri
  )
  const uri = useFallback ? fallbackUri : primaryUri

  const initials = (displayName ?? '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const onLoad = () => {
    remember(userId, uri)
    setFailed(false)
  }

  const onError = () => {
    if (!useFallback) {
      setUseFallback(true)
      return
    }
    setFailed(true)
  }

  if (failed) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2 },
          style,
        ]}
      >
        <Text style={[styles.initial, { fontSize: size * 0.36 }]}>
          {initials}
        </Text>
      </View>
    )
  }

  return (
    <Image
      key={uri}
      source={{ uri }}
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
      onLoad={onLoad}
      onError={onError}
    />
  )
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
    fallback: {
      backgroundColor: T.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initial: {
      color: T.text,
      fontWeight: '600',
    },
  })
}
