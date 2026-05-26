import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Animated,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GEAR_AVATAR } from './gear/gearConstants'

const GEAR_PROMPT_KEY = 'hasSeenGearPrompt'
const FADE_DURATION = 1200
const HOLD_DURATION = 3000

interface Props {
  height?: number
  onPress: () => void
  gearSaved?: boolean
}

export function GearTeaserCard({ height = 230, onPress, gearSaved }: Props) {
  const [visible, setVisible] = useState(false)
  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    AsyncStorage.getItem(GEAR_PROMPT_KEY).then((val) => {
      if (!val) setVisible(true)
    })
  }, [])

  useEffect(() => {
    if (gearSaved) setVisible(false)
  }, [gearSaved])

  useEffect(() => {
    if (!visible) return
    let cancelled = false

    const cycle = () => {
      if (cancelled) return
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }),
        Animated.delay(HOLD_DURATION),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_DURATION,
          useNativeDriver: true,
        }),
        Animated.delay(HOLD_DURATION),
      ]).start(() => {
        if (!cancelled) cycle()
      })
    }

    const timer = setTimeout(cycle, HOLD_DURATION)
    return () => {
      cancelled = true
      clearTimeout(timer)
      fadeAnim.stopAnimation()
    }
  }, [visible])

  const dismissTemporary = () => {
    setVisible(false)
  }

  if (!visible) return null

  return (
    <View style={[s.card, { height }]}>
      <ImageBackground
        source={GEAR_AVATAR.female}
        style={s.image}
        resizeMode="cover"
        imageStyle={[s.imageStyle, { height: height * 3, top: -50 }]}
      >
        <Animated.View style={[s.crossfadeLayer, { opacity: fadeAnim }]}>
          <ImageBackground
            source={GEAR_AVATAR.man}
            style={s.image}
            resizeMode="cover"
            imageStyle={[s.imageStyle, { height: height * 3, top: -50 }]}
          />
        </Animated.View>

        <View style={s.overlayFull} />
        <View style={s.overlayRight} />

        <View style={s.content}>
          <Text style={s.label}>Your gear</Text>
          <Text style={s.title}>What do you{'\n'}play with?</Text>
          <TouchableOpacity style={s.btn} onPress={onPress}>
            <Text style={s.btnText}>Set up my gear →</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.dismiss} onPress={dismissTemporary}>
          <Text style={s.dismissText}>×</Text>
        </TouchableOpacity>
      </ImageBackground>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
  },
  image: {
    flex: 1,
    overflow: 'hidden',
  },
  imageStyle: {
    resizeMode: 'cover',
    width: '100%',
  },
  crossfadeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  overlayFull: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 2,
  },
  overlayRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '45%',
    backgroundColor: 'rgba(0,0,0,0)',
    zIndex: 2,
  },
  content: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '60%',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    zIndex: 3,
  },
  label: {
    fontSize: 9,
    color: '#f5a623',
    textTransform: 'uppercase',
    letterSpacing: 0.1,
    fontWeight: '600',
    marginBottom: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 22,
    marginBottom: 12,
  },
  btn: {
    backgroundColor: '#f5a623',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
  },
  btnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1a0a00',
  },
  dismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  dismissText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 16,
  },
})
