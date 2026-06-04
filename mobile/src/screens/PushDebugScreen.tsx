import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'

const IS_EXPO_GO = Constants.appOwnership === 'expo'
const messaging: (() => any) | null = IS_EXPO_GO
  ? null
  : (() => {
      try { return require('@react-native-firebase/messaging').default }
      catch { return null }
    })()

const STORAGE_KEY = 'pns_debug_logs'

function createDebugStyles(T: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: T.bg, padding: 16, paddingTop: 48 },
    backBtn: { marginBottom: 8 },
    backBtnText: { fontSize: 14, color: T.textSecondary },
    title: { fontSize: 20, fontWeight: '800', color: T.text, marginBottom: 4 },
    sub: { fontSize: 11, color: T.textTertiary, marginBottom: 14, lineHeight: 17 },
    btnRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    btn: {
      flex: 1, backgroundColor: T.amber,
      borderRadius: 10, padding: 12, alignItems: 'center',
    },
    btnDelay: { backgroundColor: T.amber },
    btnGrey: { backgroundColor: T.surface, flex: 0, paddingHorizontal: 16 },
    btnText: { fontSize: 12, fontWeight: '700', color: '#0a0a0a' },
    logBox: {
      flex: 1, backgroundColor: T.input,
      borderRadius: 10, padding: 10,
      borderWidth: 0.5, borderColor: T.border,
    },
    log: { fontSize: 11, color: T.muted, marginBottom: 4, lineHeight: 16 },
    empty: { fontSize: 12, color: T.textTertiary, textAlign: 'center', marginTop: 20 },
    hint: { fontSize: 10, color: T.textTertiary, textAlign: 'center', marginTop: 8 },
  })
}

export function PushDebugScreen({ onClose }: { onClose?: () => void }) {
  const T = useTheme()
  const s = useMemo(() => createDebugStyles(T), [T])
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
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try { setLogs(JSON.parse(raw)) } catch { /* ignore */ }
      }
    })
    addLog('📱 Push Debug Screen opened')
    if (messaging) {
      messaging().hasPermission().then((status: number) => {
        addLog(`Permission status: ${status}`)
      })
      messaging().getToken().then((token: string) => {
        addLog(`TOKEN prefix: ${token?.slice(0, 30)}... (len=${token?.length})`)
      }).catch((e: Error) => addLog(`TOKEN ERROR: ${e.message}`))
    } else {
      addLog('Expo Go — Firebase messaging unavailable')
    }
  }, [])

  const sendTest = async (delaySec = 0) => {
    const { authedFetch } = useAuthStore.getState()
    addLog(`⏱️ Sending test PNS (delay=${delaySec}s)...`)
    try {
      const res = await authedFetch('/api/notifications/test', {
        method: 'POST',
        body: JSON.stringify({ platform: Platform.OS, delaySeconds: delaySec }),
      })
      const data = await res.json()
      addLog(data.ok ? `✅ Sent! ${JSON.stringify(data)}` : `❌ Failed: ${JSON.stringify(data)}`)
    } catch (e: unknown) {
      addLog(`ERROR: ${e instanceof Error ? e.message : String(e)}`)
    }
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
        Foreground logs appear live. Background logs persist via AsyncStorage.
      </Text>

      <View style={s.btnRow}>
        <TouchableOpacity style={s.btn} onPress={() => sendTest(0)}>
          <Text style={s.btnText}>Send Test</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnDelay]} onPress={() => sendTest(5)}>
          <Text style={s.btnText}>5s Delay</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.btn, s.btnGrey]}
          onPress={async () => {
            setLogs([])
            await AsyncStorage.removeItem(STORAGE_KEY)
            addLog('Logs cleared')
          }}
        >
          <Text style={[s.btnText, { color: T.textSecondary }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollRef} style={s.logBox}>
        {logs.length === 0 ? (
          <Text style={s.empty}>No logs yet — send a test notification</Text>
        ) : (
        logs.map((log, i) => (
          <Text key={i} style={[
            s.log,
            log.includes('🟢') && { color: T.green },
            log.includes('🔴') && { color: T.red },
            log.includes('🔵') && { color: '#4a90e2' },
            log.includes('🟣') && { color: '#9b59b6' },
            log.includes('ERROR') && { color: T.red },
            log.includes('TOKEN') && { color: T.amber },
            log.includes('⏱️') && { color: T.amber },
          ]}>
            {log}
          </Text>
        ))
        )}
      </ScrollView>

      <Text style={s.hint}>
        Logs saved across restarts · background logs via setBackgroundMessageHandler
      </Text>
    </View>
  )
}
