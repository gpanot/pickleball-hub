import React from 'react'
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { GearZoneConfig } from './gearTypes'

type Props = {
  zone: GearZoneConfig
  value: string | null
  onPress: () => void
}

export function GearBubble({ zone, value, onPress }: Props) {
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
        {value ?? zone.label}
      </Text>
    </TouchableOpacity>
  )
}

export function GearDot({ selected }: { selected: boolean }) {
  return <View style={[styles.dot, selected && styles.dotActive]} />
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,20,0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(80,80,80,0.5)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    gap: 8,
  },
  bubbleSelected: {
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderColor: '#f5a623',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(50,50,50,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: 'rgba(245,166,35,0.15)' },
  emoji: { fontSize: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  labelSelected: { color: '#f5a623', textTransform: 'none' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(245,166,35,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.6)',
  },
  dotActive: {
    backgroundColor: '#f5a623',
    borderColor: '#f5a623',
    shadowColor: '#f5a623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
})
