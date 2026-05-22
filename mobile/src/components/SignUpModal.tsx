import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
  Pressable,
} from 'react-native'
import Constants from 'expo-constants'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? ''

function resolveApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0]
    return `http://${ip}:3000`
  }
  return 'http://localhost:3000'
}

export function SignUpModal({
  visible,
  onClose,
  onSignedIn,
}: {
  visible: boolean
  onClose: () => void
  onSignedIn: (needsOnboarding: boolean) => void
}) {
  const [loading, setLoading] = useState(false)
  const signIn = useAuthStore((s) => s.signIn)

  const handleDevSignIn = async () => {
    setLoading(true)
    try {
      const base = resolveApiBase()
      const res = await fetch(`${base}/api/auth/mobile-token?dev=1`)
      if (!res.ok) throw new Error('Dev sign-in failed')
      const data = await res.json()
      useAuthStore.setState({
        jwt: data.jwt,
        userId: data.userId,
        profileId: data.profileId,
        displayName: data.displayName,
        imageUrl: data.imageUrl,
        reclubUserId: data.reclubUserId,
        hasCompletedOnboarding: data.hasCompletedOnboarding,
      })
      onClose()
      onSignedIn(!data.hasCompletedOnboarding)
    } catch (err) {
      console.warn('[SignUpModal] Dev sign-in error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRealSignIn = async () => {
    const AuthSession = await import('expo-auth-session')
    const WebBrowser = await import('expo-web-browser')
    WebBrowser.maybeCompleteAuthSession()

    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'com.thehub.app',
    })

    setLoading(true)
    try {
      const result = await AuthSession.startAsync({
        authUrl:
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${GOOGLE_CLIENT_ID}` +
          `&redirect_uri=${encodeURIComponent(redirectUri)}` +
          `&response_type=id_token` +
          `&scope=${encodeURIComponent('openid profile email')}` +
          `&nonce=${Math.random().toString(36).slice(2)}`,
      } as { authUrl: string })

      if (result.type === 'success' && result.params?.id_token) {
        const ok = await signIn(result.params.id_token)
        if (ok) {
          const state = useAuthStore.getState()
          onClose()
          onSignedIn(!state.hasCompletedOnboarding)
          return
        }
      }
    } catch (err) {
      console.warn('[SignUpModal] Google sign-in error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePress = () => {
    if (!GOOGLE_CLIENT_ID) {
      handleDevSignIn()
    } else {
      handleRealSignIn()
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Dismiss" />

        <View style={styles.card}>
          <Text style={styles.title}>See who's joining</Text>
          <Text style={styles.subtitle}>
            Sign up to see if your friends and the regulars are joining the session
          </Text>

          <TouchableOpacity
            style={[styles.googleBtn, loading && styles.disabled]}
            disabled={loading}
            onPress={handlePress}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.gLogo}>G</Text>
                <Text style={styles.googleLabel}>
                  {GOOGLE_CLIENT_ID ? 'Sign in with Google' : 'Dev Sign-in'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
            <Text style={styles.skipLabel}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    zIndex: 1,
    elevation: 8,
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
  gLogo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
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
