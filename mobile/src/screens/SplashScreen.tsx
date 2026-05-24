import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated'


interface SplashScreenProps {
  onFinish: () => void
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const glowOpacity = useSharedValue(0)
  const ring1Scale = useSharedValue(0)
  const ring1Opacity = useSharedValue(0)
  const ring2Scale = useSharedValue(0)
  const ring2Opacity = useSharedValue(0)
  const lionScale = useSharedValue(0.7)
  const lionOpacity = useSharedValue(0)
  const wordmarkOpacity = useSharedValue(0)
  const wordmarkY = useSharedValue(12)
  const taglineOpacity = useSharedValue(0)
  const taglineY = useSharedValue(10)
  const barScaleX = useSharedValue(0)
  const screenOpacity = useSharedValue(1)

  useEffect(() => {
    const ease = Easing.out(Easing.cubic)

    glowOpacity.value = withDelay(200,
      withTiming(1, { duration: 600, easing: ease }))

    ring1Scale.value = withDelay(200,
      withTiming(1, { duration: 800, easing: ease }))
    ring1Opacity.value = withDelay(200,
      withTiming(1, { duration: 800, easing: ease }))

    ring2Scale.value = withDelay(400,
      withTiming(1, { duration: 800, easing: ease }))
    ring2Opacity.value = withDelay(400,
      withTiming(1, { duration: 800, easing: ease }))

    lionScale.value = withDelay(400,
      withSpring(1, { stiffness: 180, damping: 12 }))
    lionOpacity.value = withDelay(400,
      withTiming(1, { duration: 400, easing: ease }))

    wordmarkOpacity.value = withDelay(1000,
      withTiming(1, { duration: 500, easing: ease }))
    wordmarkY.value = withDelay(1000,
      withTiming(0, { duration: 500, easing: ease }))

    taglineOpacity.value = withDelay(1200,
      withTiming(1, { duration: 500, easing: ease }))
    taglineY.value = withDelay(1200,
      withTiming(0, { duration: 500, easing: ease }))

    barScaleX.value = withDelay(1400,
      withTiming(1, { duration: 400, easing: ease }))

    screenOpacity.value = withDelay(2700,
      withTiming(0, { duration: 300, easing: ease }, (finished) => {
        if (finished) runOnJS(onFinish)()
      })
    )
  }, [])

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }))

  const ring1Style = useAnimatedStyle(() => ({
    opacity: ring1Opacity.value,
    transform: [{ scale: ring1Scale.value }],
  }))

  const ring2Style = useAnimatedStyle(() => ({
    opacity: ring2Opacity.value,
    transform: [{ scale: ring2Scale.value }],
  }))

  const lionStyle = useAnimatedStyle(() => ({
    opacity: lionOpacity.value,
    transform: [{ scale: lionScale.value }],
  }))

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }))

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineY.value }],
  }))

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: barScaleX.value }],
  }))

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }))

  return (
    <Animated.View style={[s.container, screenStyle]}>

      {/* Ambient glow behind lion */}
      <Animated.View style={[s.glowFill, glowStyle]} />

      {/* Expanding rings */}
      <Animated.View style={[s.ring, s.ring1, ring1Style]} />
      <Animated.View style={[s.ring, s.ring2, ring2Style]} />

      {/* Lion mark */}
      <Animated.Image
        source={require('../../assets/lion_no_background.png')}
        style={[s.lion, lionStyle]}
        resizeMode="contain"
      />

      {/* Wordmark */}
      <Animated.View style={[s.wordmarkRow, wordmarkStyle]}>
        <Text style={s.wordmarkWhite}>Squad</Text>
        <Text style={s.wordmarkAmber}>d</Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[s.tagline, taglineStyle]}>
        Where your game is
      </Animated.Text>

      {/* Bottom bar */}
      <Animated.View style={[s.bar, barStyle]} />

    </Animated.View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowFill: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(245,166,35,0.07)',
    alignSelf: 'center',
    top: '50%',
    marginTop: -290,
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: 'rgba(245,166,35,0.15)',
    alignSelf: 'center',
  },
  ring1: {
    width: 340,
    height: 340,
    top: '50%',
    marginTop: -280,
  },
  ring2: {
    width: 220,
    height: 220,
    top: '50%',
    marginTop: -220,
  },
  lion: {
    width: 220,
    height: 220,
    marginBottom: 28,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  wordmarkWhite: {
    fontSize: 38,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -1,
  },
  wordmarkAmber: {
    fontSize: 38,
    fontWeight: '700',
    color: '#f5a623',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 11,
    color: '#444444',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  bar: {
    position: 'absolute',
    bottom: 36,
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#f5a623',
    opacity: 0.5,
    alignSelf: 'center',
  },
})
