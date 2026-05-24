import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import { T } from '../theme'
import { useAuthStore, resolveApiBase } from '../stores/authStore'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { debugLog, debugError, debugWarn } from '../lib/debug'

const isExpoGo = Constants.appOwnership === 'expo'

let GoogleSignin: any = null
let isErrorWithCode: any = () => false
let statusCodes: any = {}

if (!isExpoGo) {
  const mod = require('@react-native-google-signin/google-signin')
  GoogleSignin = mod.GoogleSignin
  isErrorWithCode = mod.isErrorWithCode
  statusCodes = mod.statusCodes
}

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  )
}

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '140906288105-0do1cdl3ldk2ceblnu56f6oguh3u5odb.apps.googleusercontent.com'

if (GoogleSignin) {
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: false,
  })
}

/** Root-level overlay (not RN Modal) — avoids Android layout glitches inside Expo Go. */
export function SignUpModalOverlay({
  visible,
  onClose,
  onSignedIn,
}: {
  visible: boolean
  onClose: () => void
  onSignedIn: (needsOnboarding: boolean) => void
}) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)
  const signIn = useAuthStore((s) => s.signIn)

  if (!visible) return null

  const handleDevSignIn = async () => {
    setLoading(true)
    const base = resolveApiBase()
    const url = `${base}/api/auth/mobile-token?dev=1`
    debugLog('signIn', `Dev sign-in → ${url}`)
    try {
      const res = await fetchWithTimeout(url, undefined, 10000)
      debugLog('signIn', `Dev sign-in status=${res.status}`)
      if (!res.ok) throw new Error(`Dev sign-in failed: ${res.status}`)
      const data = await res.json()
      debugLog('signIn', `Dev sign-in OK, userId=${data.userId}`)
      useAuthStore.setState({
        jwt: data.jwt,
        userId: data.userId,
        profileId: data.profileId,
        displayName: data.displayName,
        imageUrl: data.imageUrl,
        reclubUserId: data.reclubUserId,
        hasCompletedOnboarding: data.hasCompletedOnboarding,
      })
      onSignedIn(!data.hasCompletedOnboarding)
    } catch (e) {
      debugError('signIn', 'Dev sign-in failed, using offline token', e)
      useAuthStore.setState({
        jwt: 'dev-token',
        userId: 'dev-user',
        profileId: 'dev-profile',
        displayName: 'Dev Player',
        imageUrl: null,
        reclubUserId: null,
        hasCompletedOnboarding: false,
      })
      onSignedIn(true)
    } finally {
      setLoading(false)
    }
  }

  const handleRealSignIn = async () => {
    debugLog('signIn', `Google native sign-in starting (Platform=${Platform.OS})`)
    debugLog('signIn', `webClientId=${WEB_CLIENT_ID}`)

    setLoading(true)
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
      const response = await GoogleSignin.signIn()
      debugLog('signIn', `GoogleSignin result type=${response.type}`)

      if (response.type === 'success' && response.data?.idToken) {
        debugLog('signIn', 'Got idToken, calling server signIn...')
        const ok = await signIn(response.data.idToken)
        if (ok) {
          debugLog('signIn', 'signIn OK')
          const state = useAuthStore.getState()
          onSignedIn(!state.hasCompletedOnboarding)
          return
        }
        debugWarn('signIn', 'signIn returned false (server rejected token)')
        Alert.alert('Sign-in failed', 'Could not verify your Google account. Please try again.')
      } else {
        debugWarn('signIn', `Sign-in cancelled or no idToken`, response)
      }
    } catch (e) {
      if (isErrorWithCode(e)) {
        debugError('signIn', `Google error code=${e.code}`, e)
        if (e.code === statusCodes.SIGN_IN_CANCELLED) {
          return
        }
      } else {
        debugError('signIn', 'Google sign-in error', e)
      }
      Alert.alert('Sign-in failed', 'Something went wrong. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePress = () => {
    if (__DEV__ || isExpoGo || !GoogleSignin) {
      handleDevSignIn()
    } else {
      handleRealSignIn()
    }
  }

  return (
    <View
      style={[styles.host, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss sign-in"
      />

      <View style={styles.card} pointerEvents="auto">
        <Text style={styles.title}>See who's joining</Text>
        <Text style={styles.subtitle}>
          Sign in to see if your friends and the regulars are joining the session
        </Text>

        <TouchableOpacity
          style={[styles.googleBtn, loading && styles.disabled]}
          disabled={loading}
          onPress={handlePress}
          activeOpacity={0.8}
          accessibilityLabel={__DEV__ ? 'Dev Sign-in' : 'Sign in with Google'}
          accessibilityRole="button"
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <GoogleLogo size={20} />
              <Text style={styles.googleLabel}>
                {__DEV__ ? 'Dev Sign-in' : 'Sign in with Google'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
          <Text style={styles.skipLabel}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  card: {
    width: '85%',
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    gap: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  googleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  skipBtn: {
    marginTop: 16,
    paddingVertical: 8,
  },
  skipLabel: {
    fontSize: 14,
    color: T.muted,
  },
})
