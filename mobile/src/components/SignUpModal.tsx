import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { BlurView } from 'expo-blur'
import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'

WebBrowser.maybeCompleteAuthSession()

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? ''

const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com')

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

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.IdToken,
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'com.thehub.app' }),
    },
    discovery
  )

  React.useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token
      if (idToken) {
        handleIdToken(idToken)
      }
    }
  }, [response])

  const handleIdToken = async (idToken: string) => {
    setLoading(true)
    const ok = await signIn(idToken)
    setLoading(false)
    if (ok) {
      const state = useAuthStore.getState()
      onClose()
      onSignedIn(!state.hasCompletedOnboarding)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.card}>
          <Text style={styles.title}>See who's joining</Text>
          <Text style={styles.subtitle}>
            Sign up to see if your friends and the regulars are joining the
            session
          </Text>

          <TouchableOpacity
            style={[styles.googleBtn, !request && styles.disabled]}
            disabled={!request || loading}
            onPress={() => promptAsync()}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.gLogo}>G</Text>
                <Text style={styles.googleLabel}>Continue with Google</Text>
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
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    width: '85%',
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
