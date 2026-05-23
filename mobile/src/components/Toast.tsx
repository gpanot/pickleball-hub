import React, { useEffect, useCallback } from 'react'
import { Text, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'

type ToastType = 'success' | 'error' | 'info'

interface ToastState {
  message: string | null
  type: ToastType
  key: number
  show: (message: string, type?: ToastType) => void
}

export const useToast = create<ToastState>()((set) => ({
  message: null,
  type: 'info',
  key: 0,
  show: (message, type = 'info') => set((s) => ({ message, type, key: s.key + 1 })),
}))

const TYPE_COLORS: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
  error: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  info: { bg: 'rgba(245,166,35,0.15)', text: '#f5a623' },
}

export function ToastOverlay() {
  const insets = useSafeAreaInsets()
  const { message, type, key } = useToast()
  const translateY = useSharedValue(-80)
  const opacity = useSharedValue(0)

  const clear = useCallback(() => {
    useToast.setState({ message: null })
  }, [])

  useEffect(() => {
    if (!message) return
    translateY.value = withTiming(0, { duration: 250 })
    opacity.value = withTiming(1, { duration: 250 })

    const hideDelay = 2500
    translateY.value = withDelay(hideDelay, withTiming(-80, { duration: 250 }))
    opacity.value = withDelay(hideDelay, withTiming(0, { duration: 250 }, () => {
      runOnJS(clear)()
    }))
  }, [key])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }))

  if (!message) return null

  const colors = TYPE_COLORS[type]

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8, backgroundColor: colors.bg },
        animStyle,
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10000,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
})
