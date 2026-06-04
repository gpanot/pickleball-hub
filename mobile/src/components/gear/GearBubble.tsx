import React, { useMemo } from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../useTheme'
import type { ThemeColors } from '../../theme'
import { GearZoneConfig } from './gearTypes'
import { NO_BRAND_KEY } from './gearConstants'

type Props = {
  zone: GearZoneConfig
  value: string | null
  onPress: () => void
}

export function GearBubble({ zone, value, onPress }: Props) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const selected = value !== null
  return (
    <TouchableOpacity
      style={[styles.bubble, selected && styles.bubbleSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <Text style={styles.emoji}>{zone.emoji}</Text>
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {value === NO_BRAND_KEY ? "None" : (value ?? zone.label)}
      </Text>
    </TouchableOpacity>
  )
}

export function GearDot({ selected }: { selected: boolean }) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  return <View style={[styles.dot, selected && styles.dotActive]} />
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
    bubble: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: T.surface,
      borderWidth: 1.5,
      borderColor: T.border,
      borderRadius: 20,
      paddingVertical: 6,
      paddingLeft: 6,
      paddingRight: 14,
      gap: 8,
    },
    bubbleSelected: {
      backgroundColor: T.input,
      borderColor: T.amber,
    },
    icon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: T.borderSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconSelected: { backgroundColor: T.amber + '26' },
    emoji: { fontSize: 16 },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: T.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    labelSelected: { color: T.amber, textTransform: 'none' },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: T.amber + '66',
      borderWidth: 1,
      borderColor: T.amber + '99',
    },
    dotActive: {
      backgroundColor: T.amber,
      borderColor: T.amber,
      shadowColor: T.amber,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 6,
      elevation: 4,
    },
  })
}
