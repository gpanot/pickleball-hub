import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Users } from 'lucide-react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { useSignUpModal } from '../contexts/SignUpModalContext'

interface SignInPromptProps {
  title?: string
  subtitle?: string
}

export function SignInPrompt({
  title = 'See friend activities',
  subtitle = 'Sign in to see your friends, follow players, and track your sessions',
}: SignInPromptProps) {
  const T = useTheme()
  const s = useMemo(() => createS(T), [T])
  const { openSignUp } = useSignUpModal()

  return (
    <View style={s.container}>
      <Users size={48} color={T.textTertiary} strokeWidth={1.5} />
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>{subtitle}</Text>
      <TouchableOpacity
        onPress={openSignUp}
        style={s.button}
        activeOpacity={0.8}
        accessibilityLabel="Sign in with Google"
        accessibilityRole="button"
      >
        <Text style={s.buttonText}>Sign in with Google</Text>
      </TouchableOpacity>
    </View>
  )
}

function createS(T: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: T.text,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: T.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  button: {
    marginTop: 24,
    backgroundColor: T.amber,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
})
}
