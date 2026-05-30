import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
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
  const handleAllow = async () => {
    onClose()
    await AsyncStorage.setItem(STORAGE_KEY, '1')
    const { status } = await Notifications.requestPermissionsAsync()
    if (status === 'granted') {
      const token = await registerForPushNotifications()
      if (token) {
        const { authedFetch } = useAuthStore.getState()
        try {
          await authedFetch('/api/players/push-token', {
            method: 'POST',
            body: JSON.stringify({ token }),
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
            {
              icon: '⚡',
              bg: '#1f1400',
              title: 'Friend just booked',
              sub: 'Get notified when someone you follow joins a session today',
            },
            {
              icon: '🏆',
              bg: '#0a1f0a',
              title: 'DUPR improvements',
              sub: 'Know when your circle hits a new rating milestone',
            },
            {
              icon: '🎯',
              bg: '#140a2a',
              title: 'Sessions filling fast',
              sub: 'Last spots at sessions that match your level',
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
            <Text style={s.btnPrimaryText}>Allow notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.btnSecondary} onPress={handleSkip}>
            <Text style={s.btnSecondaryText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    backgroundColor: '#1a1000',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f5a623',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  iconEmoji: { fontSize: 28 },
  badge: {
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: '#f5a623',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#f5a623' },
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
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
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
    color: '#ddd',
    marginBottom: 2,
  },
  benefitSub: { fontSize: 11, color: '#555', lineHeight: 16 },
  btnPrimary: {
    backgroundColor: '#f5a623',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#0a0a0a' },
  btnSecondary: { padding: 10, alignItems: 'center', marginTop: 4 },
  btnSecondaryText: { fontSize: 13, color: '#444' },
})
