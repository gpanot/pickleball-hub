import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { X, RotateCcw, Heart } from 'lucide-react-native'
import * as Location from 'expo-location'
import { T } from '../theme'
import {
  type Session,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'

/* eslint-disable @typescript-eslint/no-var-requires */
const CARD_BG_IMAGES = [
  require('../../assets/images/card-bg.webp'),
  require('../../assets/images/card-bg-2.jpg'),
]

const { width: W } = Dimensions.get('window')

/* ── ProgressBar ─────────────────────────────────────────────── */
function ProgressBar({ total, current }: { total: number; current: number }) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingBottom: 12,
      }}
    >
      <View
        style={{
          flex: 1,
          height: 3,
          borderRadius: 2,
          backgroundColor: '#2a2a2a',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${pct * 100}%`,
            height: '100%',
            backgroundColor: T.amber,
            borderRadius: 2,
          }}
        />
      </View>
      <Text style={{ fontSize: 11, color: '#666', minWidth: 44, textAlign: 'right' }}>
        {current}/{total}
      </Text>
    </View>
  )
}

/* ── SwipeCard (with Shortlist CTA) ─────────────────────────── */
function SwipeCard({
  s,
  onSave,
  isSignedIn,
  onSignUpPrompt,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
  isSignedIn: boolean
  onSignUpPrompt?: () => void
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
      <CardBody
        s={s}
        renderCta={cta}
        isSignedIn={isSignedIn}
        onSignUpPrompt={onSignUpPrompt}
      />
    </View>
  )
}

/* ── AnimatedSwipeCard ───────────────────────────────────────── */
function AnimatedSwipeCard({
  s,
  onSkip,
  onSave,
  isSignedIn,
  onSignUpPrompt,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
  isSignedIn: boolean
  onSignUpPrompt?: () => void
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
        <SwipeCard s={s} onSkip={onSkip} onSave={onSave} isSignedIn={isSignedIn} onSignUpPrompt={onSignUpPrompt} />
      </Animated.View>
    </GestureDetector>
  )
}

/* ── SecondaryCard ───────────────────────────────────────────── */
function SecondaryCard({ s }: { s: Session }) {
  const isNew = s.matchScore === 0
  const mc = isNew
    ? '#666'
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
            {isNew ? 'New' : `${s.matchScore}%`}
          </Text>
          {!isNew && (
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
          )}
        </View>
      </View>
    </View>
  )
}

const HCMC_LAT = 10.78
const HCMC_LNG = 106.69

/* ── SwipeScreen (main export) ───────────────────────────────── */
export function SwipeScreen({
  onNavigateToShortlist,
  onSignUpPrompt,
}: {
  onNavigateToShortlist: () => void
  onSignUpPrompt?: () => void
}) {
  const signedIn = useAuthStore((s) => s.isSignedIn)()
  const deck = useSessionStore((s) => s.sessions)
  const loading = useSessionStore((s) => s.loading)
  const currentIdx = useSessionStore((s) => s.currentIdx)
  const swipeHistory = useSessionStore((s) => s.swipeHistory)
  const { fetchIfNeeded, loadSavedIds, advanceSave, advanceSkip, undo, resetDeck } =
    useSessionStore.getState()
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    loadSavedIds()
    ;(async () => {
      let lat: number | null = HCMC_LAT
      let lng: number | null = HCMC_LNG
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          lat = loc.coords.latitude
          lng = loc.coords.longitude
        }
      } catch {
        // fallback to HCMC
      }
      await fetchIfNeeded(lat, lng)
    })()
  }, [])

  const total = deck.length
  const current = deck[currentIdx]
  const upNext = deck.slice(currentIdx + 1, currentIdx + 4)
  const isDone = currentIdx >= total && total > 0

  const handleSave = () => {
    advanceSave()
    if (currentIdx + 1 >= total) setTimeout(onNavigateToShortlist, 400)
  }

  const handleSkip = () => advanceSkip()

  const handleUndo = () => undo()

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <TopBar
        title="Where to play?"
        isSignedIn={signedIn}
        onSignIn={onSignUpPrompt}
      />

      {loading && total === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.amber} />
          <Text style={{ fontSize: 13, color: '#666', marginTop: 12 }}>
            Loading sessions...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <ProgressBar total={total} current={currentIdx} />

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
                onPress={resetDeck}
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
                <AnimatedSwipeCard s={current} onSkip={handleSkip} onSave={handleSave} isSignedIn={signedIn} onSignUpPrompt={onSignUpPrompt} />

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
                      opacity: swipeHistory.length ? 1 : 0.35,
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
      )}
    </View>
  )
}
