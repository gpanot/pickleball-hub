import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'

export function LocationPermissionPopup({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const T = useTheme()
  const s = useMemo(() => createStyles(T), [T])

  if (!visible) return null

  const handleAllow = async () => {
    await AsyncStorage.setItem('squadd_location_permission_asked', '1')
    await Location.requestForegroundPermissionsAsync()
    onClose()
  }

  const handleSkip = async () => {
    await AsyncStorage.setItem('squadd_location_permission_asked', '1')
    onClose()
  }

  return (
    <View style={s.backdrop}>
      <View style={s.popup}>

        <View style={s.iconWrap}>
          <Text style={s.iconEmoji}>📍</Text>
        </View>

        <View style={s.badge}>
          <Text style={s.badgeText}>Better recommendations</Text>
        </View>

        <Text style={s.title}>Sessions near you</Text>
        <Text style={s.sub}>
          Allow location to show sessions nearby and rank them by distance.
        </Text>

        {[
          { icon: '🗺️', label: 'Distance on every card' },
          { icon: '⚡', label: 'Ranked by proximity' },
          { icon: '🟢', label: 'Looking to play distance' },
        ].map((item, i) => (
          <View key={i} style={s.benefitRow}>
            <View style={s.benefitIcon}>
              <Text style={s.benefitEmoji}>{item.icon}</Text>
            </View>
            <Text style={s.benefitLabel}>{item.label}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.btnPrimary} onPress={handleAllow}>
          <Text style={s.btnPrimaryText}>Allow location</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btnSecondary} onPress={handleSkip}>
          <Text style={s.btnSecondaryText}>Maybe later — use default area</Text>
        </TouchableOpacity>

      </View>
    </View>
  )
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: T.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 999,
      paddingHorizontal: 24,
    },
    popup: {
      backgroundColor: T.bg,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      alignItems: 'center',
      borderWidth: 0.5,
      borderColor: T.border,
    },
    iconWrap: {
      width: 64,
      height: 64,
      backgroundColor: T.input,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: '#4a90e2',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    iconEmoji: { fontSize: 28 },
    badge: {
      backgroundColor: T.input,
      borderWidth: 0.5,
      borderColor: '#4a90e2',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 12,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#4a90e2',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: T.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    sub: {
      fontSize: 13,
      color: T.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      paddingVertical: 9,
      borderBottomWidth: 0.5,
      borderBottomColor: T.borderSubtle,
    },
    benefitIcon: {
      width: 34,
      height: 34,
      backgroundColor: T.input,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    benefitEmoji: { fontSize: 16 },
    benefitLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: T.text,
    },
    btnPrimary: {
      backgroundColor: T.amber,
      borderRadius: 12,
      padding: 13,
      width: '100%',
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 8,
    },
    btnPrimaryText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#0B0B0C',
    },
    btnSecondary: {
      padding: 10,
      width: '100%',
      alignItems: 'center',
    },
    btnSecondaryText: {
      fontSize: 13,
      color: T.textTertiary,
    },
  })
}
