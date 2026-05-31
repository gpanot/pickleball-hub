import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerForPushNotifications } from '../services/notifications'
import { useAuthStore } from '../stores/authStore'

const STORAGE_KEY = 'squadd_notif_permission_asked'

export function NotificationPermissionSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  if (!visible) return null

  const handleAllow = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '1')
    const { status } = await Notifications.requestPermissionsAsync()
    onClose()
    if (status === 'granted') {
      const token = await registerForPushNotifications()
      if (token) {
        const { authedFetch } = useAuthStore.getState()
        try {
          await authedFetch('/api/players/push-token', {
            method: 'POST',
            body: JSON.stringify({ token, platform: Platform.OS }),
          })
        } catch {}
      }
    }
  }

  const handleSkip = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '1')
    onClose()
  }

  return (
    <View style={s.backdrop}>
      <View style={s.popup}>

        <View style={s.iconWrap}>
          <Text style={s.iconEmoji}>🔔</Text>
        </View>

        <View style={s.badge}>
          <Text style={s.badgeText}>Stay in the loop</Text>
        </View>

        <Text style={s.title}>Never miss your circle</Text>
        <Text style={s.sub}>
          Know the moment a friend joins a session — so you can join too.
        </Text>

        {[
          { icon: '⚡', label: 'Friend just booked' },
          { icon: '🏆', label: 'DUPR improvements' },
          { icon: '🎯', label: 'Sessions filling fast' },
        ].map((item, i) => (
          <View key={i} style={s.benefitRow}>
            <View style={s.benefitIcon}>
              <Text style={s.benefitEmoji}>{item.icon}</Text>
            </View>
            <Text style={s.benefitLabel}>{item.label}</Text>
          </View>
        ))}

        <TouchableOpacity style={s.btnPrimary} onPress={handleAllow}>
          <Text style={s.btnPrimaryText}>Allow notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btnSecondary} onPress={handleSkip}>
          <Text style={s.btnSecondaryText}>Not now</Text>
        </TouchableOpacity>

      </View>
    </View>
  )
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    paddingHorizontal: 24,
  },
  popup: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
  },
  iconWrap: {
    width: 64, height: 64,
    backgroundColor: '#1a1000',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f5a623',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconEmoji: { fontSize: 28 },
  badge: {
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: '#f5a623',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f5a623',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  sub: {
    fontSize: 13,
    color: '#666',
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
    borderBottomColor: '#1a1a1a',
  },
  benefitIcon: {
    width: 34, height: 34,
    backgroundColor: '#1f1400',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitEmoji: { fontSize: 16 },
  benefitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ddd',
  },
  btnPrimary: {
    backgroundColor: '#f5a623',
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
    color: '#0a0a0a',
  },
  btnSecondary: {
    padding: 10,
    width: '100%',
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: 13,
    color: '#444',
  },
})
