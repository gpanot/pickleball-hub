import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { LinearGradient } from 'expo-linear-gradient'
import { RING_COLORS } from '../data'

const FROST_COLORS: [string, string][] = [
  ['#6B4C3B', '#A67C52'],
  ['#3B5C6B', '#5A8FA3'],
  ['#6B3B5C', '#A35A8F'],
  ['#3B6B4C', '#5AA370'],
]

/** Blurred friend placeholders — tap handled by parent (opens global sign-up modal). */
export function LockedFriendsRow({ onPress }: { onPress: () => void }) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.row}
      accessibilityLabel="Sign in to see which friends are joining"
      accessibilityRole="button"
    >
      {[0, 1, 2, 3].map((i) => (
        <View
          key={`frost-${i}`}
          style={[
            styles.avatar,
            { borderColor: RING_COLORS[i % RING_COLORS.length] },
          ]}
        >
          <LinearGradient
            colors={FROST_COLORS[i]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
          <View style={styles.frostOverlay} />
        </View>
      ))}
      <View style={styles.more}>
        <Text style={styles.moreText}>+?</Text>
      </View>
    </TouchableOpacity>
  )
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2.5,
      overflow: 'hidden',
    },
    gradient: {
      width: 47,
      height: 47,
      borderRadius: 24,
    },
    frostOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: T.overlay,
    },
    more: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: T.input,
      borderWidth: 1.5,
      borderColor: T.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moreText: {
      fontSize: 14,
      color: T.textSecondary,
      fontWeight: '500',
    },
  })
}
