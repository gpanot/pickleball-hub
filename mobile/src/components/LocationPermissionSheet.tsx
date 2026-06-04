import React, { useMemo } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'squadd_location_permission_asked'

export function LocationPermissionSheet({
  visible,
  onClose,
  onGranted,
}: {
  visible: boolean
  onClose: () => void
  onGranted?: (coords: { lat: number; lng: number }) => void
}) {
  const T = useTheme()
  const s = useMemo(() => createLocationSheetStyles(T), [T])

  const handleAllow = async () => {
    onClose()
    await AsyncStorage.setItem(STORAGE_KEY, '1')
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status === 'granted') {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        onGranted?.({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch {}
    }
  }

  const handleSkip = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '1')
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <View style={s.handle} />

          <View style={s.iconWrap}>
            <Text style={s.iconEmoji}>📍</Text>
          </View>

          <View style={s.badge}>
            <Text style={s.badgeText}>Better recommendations</Text>
          </View>

          <Text style={s.title}>Sessions near you</Text>
          <Text style={s.sub}>
            Squadd uses your location to show sessions nearby and rank them by
            distance.
          </Text>

          {[
            {
              icon: '🗺️',
              bg: T.input,
              title: 'Distance on every card',
              sub: 'See exactly how far each session is',
            },
            {
              icon: '⚡',
              bg: T.input,
              title: 'Ranked by proximity',
              sub: 'Sessions within 5km are prioritised in your Top 5',
            },
            {
              icon: '🟢',
              bg: T.input,
              title: 'Looking to play',
              sub: 'Women nearby show their distance from you',
            },
          ].map((item, i) => (
            <View key={i} style={s.benefitRow}>
              <View style={[s.benefitIcon, { backgroundColor: item.bg }]}>
                <Text style={s.benefitEmoji}>{item.icon}</Text>
              </View>
              <View style={s.benefitText}>
                <Text style={s.benefitTitle}>{item.title}</Text>
                <Text style={s.benefitSub}>{item.sub}</Text>
              </View>
            </View>
          ))}

          <TouchableOpacity style={s.btnPrimary} onPress={handleAllow}>
            <Text style={s.btnPrimaryText}>Allow location</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={handleSkip}>
            <Text style={s.btnSecondaryText}>Maybe later — Nearby Friends may not be visible</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function createLocationSheetStyles(T: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: T.sheetBackdrop,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: T.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: T.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 20,
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
      alignSelf: 'center',
      marginBottom: 16,
    },
    iconEmoji: { fontSize: 28 },
    badge: {
      backgroundColor: T.input,
      borderWidth: 0.5,
      borderColor: '#4a90e2',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: 'center',
      marginBottom: 12,
    },
    badgeText: { fontSize: 10, fontWeight: '700', color: '#4a90e2' },
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
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 0.5,
      borderBottomColor: T.borderSubtle,
    },
    benefitIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    benefitEmoji: { fontSize: 14 },
    benefitText: { flex: 1 },
    benefitTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: T.text,
      marginBottom: 2,
    },
    benefitSub: { fontSize: 11, color: T.textTertiary, lineHeight: 16 },
    btnPrimary: {
      backgroundColor: '#4a90e2',
      borderRadius: 14,
      padding: 14,
      alignItems: 'center',
      marginTop: 20,
    },
    btnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    btnSecondary: { padding: 10, alignItems: 'center', marginTop: 4 },
    btnSecondaryText: { fontSize: 13, color: T.textTertiary },
  })
}
