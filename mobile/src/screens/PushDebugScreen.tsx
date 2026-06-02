import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useAuthStore } from '../stores/authStore'

const IS_EXPO_GO = Constants.appOwnership === 'expo'
const messaging: (() => any) | null = IS_EXPO_GO
  ? null
  : (() => {
      try { return require('@react-native-firebase/messaging').default }
      catch { return null }
    })()

const STORAGE_KEY = 'pns_debug_logs'

export function PushDebugScreen({ onClose }: { onClose?: () => void }) {
  const [logs, setLogs] = useState<string[]>([])
  const scrollRef = useRef<ScrollView>(null)

  const addLog = async (msg: string) => {
    const ts = new Date().toISOString().substring(11, 23)
    const line = `[${ts}] ${msg}`
    setLogs(prev => {
      const updated = [...prev, line]
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(-100)))
      return updated.slice(-100)
    })
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored) setLogs(JSON.parse(stored))
    })

    addLog('--- Debug screen opened ---')

    if (!messaging) {
      addLog('⚠️ Firebase unavailable in Expo Go — FCM tests require a dev/release build')
      return
    }

    messaging().getToken()
      .then(t => addLog(`TOKEN: ${t?.substring(0, 35)}... (${t?.length} chars)`))
      .catch(e => addLog(`TOKEN ERROR: ${e.message}`))

    messaging().hasPermission()
      .then(s => addLog(`PERMISSION: ${s}`))

    const unsubFG = messaging().onMessage(async msg => {
      addLog(`🟢 FOREGROUND received`)
      addLog(`  title: ${msg.notification?.title ?? 'none'}`)
      addLog(`  body: ${msg.notification?.body ?? 'none'}`)
      addLog(`  data: ${JSON.stringify(msg.data ?? {})}`)
    })

    const unsubOpen = messaging().onNotificationOpenedApp(msg => {
      addLog(`🔵 TAPPED from background`)
      addLog(`  title: ${msg.notification?.title ?? 'none'}`)
      addLog(`  data: ${JSON.stringify(msg.data ?? {})}`)
    })

    messaging().getInitialNotification().then(msg => {
      if (msg) {
        addLog(`🟣 OPENED from quit state`)
        addLog(`  title: ${msg.notification?.title ?? 'none'}`)
      } else {
        addLog(`INITIAL: app not opened from notification`)
      }
    })

    return () => {
      unsubFG()
      unsubOpen()
    }
  }, [])

  const sendTest = async () => {
    addLog(`📤 Calling /api/notifications/test...`)
    try {
      const { authedFetch } = useAuthStore.getState()
      const res = await authedFetch('/api/notifications/test', {
        method: 'POST',
        body: JSON.stringify({ platform: Platform.OS }),
      })
      const data = await res.json()
      addLog(`📤 HTTP ${res.status}: ${JSON.stringify(data)}`)
    } catch (e: any) {
      addLog(`📤 FAILED: ${e.message}`)
    }
  }

  const clearLogs = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY)
    setLogs([])
  }

  return (
    <View style={s.container}>
      {onClose && (
        <TouchableOpacity onPress={onClose} style={s.backBtn}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
      )}
      <Text style={s.title}>FCM Debug</Text>
      <Text style={s.sub}>
        1. Tap Send · 2. Press home · 3. Come back · 4. Check for 🔴
      </Text>

      <View style={s.btnRow}>
        <TouchableOpacity style={s.btn} onPress={sendTest}>
          <Text style={s.btnText}>Send Test PNS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnGrey]} onPress={clearLogs}>
          <Text style={[s.btnText, { color: '#fff' }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={s.logBox}>
        {logs.length === 0 && (
          <Text style={s.empty}>No logs yet.</Text>
        )}
        {logs.map((log, i) => (
          <Text key={i} style={[
            s.log,
            log.includes('🟢') && { color: '#1D9E75' },
            log.includes('🔴') && { color: '#e74c3c' },
            log.includes('🔵') && { color: '#4a90e2' },
            log.includes('🟣') && { color: '#9b59b6' },
            log.includes('ERROR') && { color: '#e74c3c' },
            log.includes('TOKEN') && { color: '#f5a623' },
          ]}>
            {log}
          </Text>
        ))}
      </ScrollView>

      <Text style={s.hint}>
        Logs saved across restarts · background logs via setBackgroundMessageHandler
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 16, paddingTop: 48 },
  backBtn: { marginBottom: 8 },
  backBtnText: { fontSize: 14, color: '#999' },
  title: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  sub: { fontSize: 11, color: '#555', marginBottom: 14, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  btn: {
    flex: 1, backgroundColor: '#f5a623',
    borderRadius: 10, padding: 12, alignItems: 'center',
  },
  btnGrey: { backgroundColor: '#1a1a1a', flex: 0, paddingHorizontal: 20 },
  btnText: { fontSize: 13, fontWeight: '700', color: '#0a0a0a' },
  logBox: {
    flex: 1, backgroundColor: '#0e0e0e',
    borderRadius: 10, padding: 10,
    borderWidth: 0.5, borderColor: '#1a1a1a',
  },
  log: { fontSize: 11, color: '#666', marginBottom: 4, lineHeight: 16 },
  empty: { fontSize: 12, color: '#333', textAlign: 'center', marginTop: 20 },
  hint: { fontSize: 10, color: '#2a2a2a', textAlign: 'center', marginTop: 8 },
})
