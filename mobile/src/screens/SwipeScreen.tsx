import React, { useState } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { X, RotateCcw, Heart } from 'lucide-react-native'
import { T } from '../theme'
import {
  type Session,
  ALL_SESSIONS,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'

/* eslint-disable @typescript-eslint/no-var-requires */
const CARD_BG_IMAGES = [
  require('../../assets/images/card-bg.webp'),
  require('../../assets/images/card-bg-2.jpg'),
]

const { width: W } = Dimensions.get('window')

/* ── ProgressDots ────────────────────────────────────────────── */
function ProgressDot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 14 : 5)

  React.useEffect(() => {
    width.value = withTiming(active ? 14 : 5, { duration: 250 })
  }, [active])

  const animStyle = useAnimatedStyle(() => ({
    width: width.value,
    height: 5,
    borderRadius: active ? 3 : 999,
    backgroundColor: active ? T.amber : '#2a2a2a',
  }))

  return <Animated.View style={animStyle} />
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
      }}
    >
      <Text style={{ fontSize: 11, color: '#666' }}>
        {current} of {total} Selected
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {Array.from({ length: total }).map((_, i) => (
          <ProgressDot key={i} active={i < current} />
        ))}
      </View>
    </View>
  )
}

/* ── SwipeCard (with Shortlist CTA) ─────────────────────────── */
function SwipeCard({
  s,
  onSave,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
}) {
  const cta = (
    <TouchableOpacity
      onPress={onSave}
      style={{
        backgroundColor: T.amber,
        borderRadius: 14,
        paddingVertical: 11,
        alignItems: 'center',
        shadowColor: T.amber,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 32,
        elevation: 6,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a0a00' }}>
        Shortlist · {s.spotsLeft} spots left
      </Text>
      <Text style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 2 }}>
        {s.joined} / {s.maxPlayers} filled
      </Text>
    </TouchableOpacity>
  )

  return (
    <View style={{ width: '100%', height: CARD_HEIGHT }}>
      <CardBody s={s} renderCta={cta} />
    </View>
  )
}

/* ── AnimatedSwipeCard ───────────────────────────────────────── */
function AnimatedSwipeCard({
  s,
  onSkip,
  onSave,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
}) {
  const translateX = useSharedValue(0)
  const rotate = useSharedValue(0)

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX
      rotate.value = e.translationX / 15
    })
    .onEnd((e) => {
      if (e.translationX > 100) {
        translateX.value = withSpring(W * 1.5, {}, () => runOnJS(onSave)())
      } else if (e.translationX < -100) {
        translateX.value = withSpring(-W * 1.5, {}, () => runOnJS(onSkip)())
      } else {
        translateX.value = withSpring(0)
        rotate.value = withSpring(0)
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
        <SwipeCard s={s} onSkip={onSkip} onSave={onSave} />
      </Animated.View>
    </GestureDetector>
  )
}

/* ── SecondaryCard ───────────────────────────────────────────── */
function SecondaryCard({ s }: { s: Session }) {
  const mc =
    s.matchScore >= 85
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
            style={{ fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 }}
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
        </View>
      </View>
    </View>
  )
}

/* ── SwipeScreen (main export) ───────────────────────────────── */
export function SwipeScreen({
  onNavigateToShortlist,
}: {
  onNavigateToShortlist: () => void
}) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const deck = ALL_SESSIONS
  const total = deck.length
  const current = deck[currentIdx]
  const upNext = deck.slice(currentIdx + 1, currentIdx + 4)
  const isDone = currentIdx >= total

  const handleSave = () => {
    setHistory((prev) => [...prev, currentIdx])
    const next = currentIdx + 1
    setCurrentIdx(next)
    if (next >= total) setTimeout(onNavigateToShortlist, 400)
  }

  const handleSkip = () => setCurrentIdx((prev) => prev + 1)

  const handleUndo = () => {
    if (!history.length) return
    setCurrentIdx(history[history.length - 1])
    setHistory((prev) => prev.slice(0, -1))
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <TopBar title="Where to play?" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <ProgressDots total={total} current={currentIdx} />

        {isDone ? (
          <View style={{ alignItems: 'center', paddingVertical: 56 }}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🏓</Text>
            <Text
              style={{
                fontSize: 15,
                color: 'rgba(255,255,255,0.35)',
                marginBottom: 24,
              }}
            >
              You've seen all games tonight.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setCurrentIdx(0)
                setHistory([])
              }}
              style={{
                backgroundColor: T.amber,
                borderRadius: 14,
                paddingHorizontal: 28,
                paddingVertical: 12,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0B0B0C' }}>
                Start over
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          current && (
            <>
              <AnimatedSwipeCard s={current} onSkip={handleSkip} onSave={handleSave} />

              {/* Action buttons */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 28,
                  marginVertical: 16,
                }}
              >
                <TouchableOpacity
                  onPress={handleSkip}
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 29,
                    backgroundColor: '#1a1a1a',
                    borderWidth: 1.5,
                    borderColor: '#2a2a2a',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={24} color="#777" strokeWidth={2} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleUndo}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: '#1a1a1a',
                    borderWidth: 1.5,
                    borderColor: '#2a2a2a',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: history.length ? 1 : 0.35,
                  }}
                >
                  <RotateCcw size={18} color="#888" strokeWidth={2} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: T.amber,
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: T.amber,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.35,
                    shadowRadius: 18,
                    elevation: 8,
                  }}
                >
                  <Heart size={28} color="#0B0B0C" fill="#0B0B0C" strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {/* Up Next */}
              {upNext.length > 0 && (
                <View>
                  <Text
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.3)',
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    Up next
                  </Text>
                  <View style={{ gap: 10 }}>
                    {upNext.map((sess, i) => (
                      <View key={sess.id} style={{ opacity: 1 - i * 0.2 }}>
                        <SecondaryCard s={sess} />
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  )
}
