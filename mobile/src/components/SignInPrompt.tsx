import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Users } from 'lucide-react-native'
import { T } from '../theme'
import { useSignUpModal } from '../contexts/SignUpModalContext'

interface SignInPromptProps {
  title?: string
  subtitle?: string
}

export function SignInPrompt({
  title = 'See friend activities',
  subtitle = 'Sign in to see your friends, follow players, and track your sessions',
}: SignInPromptProps) {
  const { openSignUp } = useSignUpModal()

  return (
    <View style={s.container}>
      <Users size={48} color="#444" strokeWidth={1.5} />
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

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
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
