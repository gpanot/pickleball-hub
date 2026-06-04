import React, { useMemo } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import {
  type Session,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { CardBody, CARD_HEIGHT } from './CardBody'

/* eslint-disable @typescript-eslint/no-var-requires */
const CARD_BG_IMAGES = [
  require('../../assets/images/card-bg.webp'),
  require('../../assets/images/card-bg-2.jpg'),
]

const { width: W } = Dimensions.get('window')

function SwipeCard({
  s,
  onSave,
  isSignedIn,
  lockedFriendsSlot,
  onSignIn,
  onFriendsPress,
  onTopDuprPress,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
  isSignedIn: boolean
  lockedFriendsSlot?: React.ReactNode
  onSignIn?: () => void
  onFriendsPress?: () => void
  onTopDuprPress?: () => void
}) {
  const T = useTheme()
  const fillPct = s.maxPlayers > 0 ? Math.min(1, s.joined / s.maxPlayers) : 0
  const cta = (
    <TouchableOpacity
      onPress={onSave}
      accessibilityLabel={`Shortlist this session, ${s.spotsLeft} spots left`}
      accessibilityRole="button"
      style={{
        backgroundColor: T.amber,
        borderRadius: 14,
        paddingVertical: 11,
        paddingHorizontal: 16,
        shadowColor: T.amber,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 32,
        elevation: 6,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: T.textOnPrimary, textAlign: 'center' }}>
        Shortlist · {s.spotsLeft} spots left
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 6, gap: 6, maxWidth: 180 }}>
        <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.15)' }}>
          <View
            style={{
              width: `${Math.round(fillPct * 100)}%`,
              height: 5,
              borderRadius: 3,
              backgroundColor: fillPct >= 0.85 ? T.red : T.textOnPrimary,
              opacity: fillPct >= 0.85 ? 1 : 0.6,
            }}
          />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '600', color: T.textOnPrimary + '80' }}>
          {s.joined}/{s.maxPlayers}
        </Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={{ width: '100%', height: CARD_HEIGHT }}>
      <CardBody
        s={s}
        renderCta={cta}
        isSignedIn={isSignedIn}
        lockedFriendsSlot={lockedFriendsSlot}
        onSignIn={onSignIn}
        onFriendsPress={onFriendsPress}
        onTopDuprPress={onTopDuprPress}
      />
    </View>
  )
}

function SwipeOverlayLabel({
  text,
  color,
  align,
  opacity,
}: {
  text: string
  color: string
  align: 'left' | 'right'
  opacity: Animated.SharedValue<number>
}) {
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 24,
          [align === 'left' ? 'left' : 'right']: 20,
          zIndex: 50,
          borderWidth: 3,
          borderColor: color,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 6,
          transform: [{ rotate: align === 'left' ? '-15deg' : '15deg' }],
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: '900',
          color,
          letterSpacing: 2,
        }}
      >
        {text}
      </Text>
    </Animated.View>
  )
}

export function AnimatedSwipeCard({
  s,
  onSkip,
  onSave,
  isSignedIn,
  lockedFriendsSlot,
  onSignIn,
  onFriendsPress,
  onTopDuprPress,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
  isSignedIn: boolean
  lockedFriendsSlot?: React.ReactNode
  onSignIn?: () => void
  onFriendsPress?: () => void
  onTopDuprPress?: () => void
}) {
  const T = useTheme()
  const translateX = useSharedValue(0)
  const rotate = useSharedValue(0)
  const likeOpacity = useSharedValue(0)
  const nopeOpacity = useSharedValue(0)

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }

  const gesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX
      rotate.value = e.translationX / 15
      likeOpacity.value = interpolate(e.translationX, [0, 80], [0, 1], 'clamp')
      nopeOpacity.value = interpolate(e.translationX, [-80, 0], [1, 0], 'clamp')
    })
    .onEnd((e) => {
      if (e.translationX > 100) {
        runOnJS(triggerHaptic)()
        translateX.value = withTiming(W * 1.5, { duration: 200 }, () => runOnJS(onSave)())
      } else if (e.translationX < -100) {
        runOnJS(triggerHaptic)()
        translateX.value = withTiming(-W * 1.5, { duration: 200 }, () => runOnJS(onSkip)())
      } else {
        translateX.value = withSpring(0)
        rotate.value = withSpring(0)
        likeOpacity.value = withSpring(0)
        nopeOpacity.value = withSpring(0)
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
  }))

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width: '100%' }, animStyle]}>
        <SwipeOverlayLabel text="SHORTLIST" color={T.amber} align="left" opacity={likeOpacity} />
        <SwipeOverlayLabel text="NOPE" color="#ef4444" align="right" opacity={nopeOpacity} />
        <SwipeCard
          s={s}
          onSkip={onSkip}
          onSave={onSave}
          isSignedIn={isSignedIn}
          lockedFriendsSlot={lockedFriendsSlot}
          onSignIn={onSignIn}
          onFriendsPress={onFriendsPress}
          onTopDuprPress={onTopDuprPress}
        />
      </Animated.View>
    </GestureDetector>
  )
}

export function SecondaryCard({ s }: { s: Session }) {
  const T = useTheme()
  const showScore = s.matchScore >= 50
  const mc = !showScore
    ? T.muted
    : s.matchScore >= 85
      ? T.amber
      : s.matchScore >= 70
        ? 'rgba(255,255,255,0.5)'
        : 'rgba(255,255,255,0.3)'
  const price = formatPriceDuration(s.feeAmount, s.durationMin)
  const distance = formatDistance(s.distanceKm)
  const timeLabel = formatTime(s.startTime)

  return (
    <View
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <View style={StyleSheet.absoluteFillObject}>
        <Image
          source={CARD_BG_IMAGES[1]}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0,0,0,0.88)',
          }}
        />
      </View>
      <View
        style={{
          position: 'relative',
          zIndex: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '600', color: T.text, marginBottom: 4 }}
            numberOfLines={1}
          >
            {s.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{timeLabel}</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>·</Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{price}</Text>
            {distance !== '' && (
              <>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>·</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{distance}</Text>
              </>
            )}
          </View>
          {s.friendCount > 0 && (
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
              {s.friends[0]?.displayName ?? 'A friend'}
              {s.friendCount > 1
                ? ` +${s.friendCount - 1} ${s.friendCount === 2 ? 'friend' : 'friends'}`
                : ' joining'}
            </Text>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {showScore ? (
            <>
              <Text style={{ fontSize: 20, fontWeight: '700', color: mc, lineHeight: 22 }}>
                {s.matchScore}%
              </Text>
              <Text
                style={{
                  fontSize: 9,
                  color: 'rgba(255,255,255,0.3)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  marginTop: 2,
                }}
              >
                Match
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  )
}
