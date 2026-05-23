import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
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
import { X, RotateCcw, Heart, RefreshCw, AlertCircle, Inbox, CheckCircle2, Users } from 'lucide-react-native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { T } from '../theme'
import {
  type Session,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'
import { LockedFriendsRow } from '../components/LockedFriendsRow'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import { FriendsListModal } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'

/* eslint-disable @typescript-eslint/no-var-requires */
const CARD_BG_IMAGES = [
  require('../../assets/images/card-bg.webp'),
  require('../../assets/images/card-bg-2.jpg'),
]

const { width: W } = Dimensions.get('window')

/* ── SwipeCard (with Shortlist CTA) ─────────────────────────── */
function SwipeCard({
  s,
  onSave,
  isSignedIn,
  lockedFriendsSlot,
  onSignIn,
  onFriendsPress,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
  isSignedIn: boolean
  lockedFriendsSlot?: React.ReactNode
  onSignIn?: () => void
  onFriendsPress?: () => void
}) {
  const cta = (
    <TouchableOpacity
      onPress={onSave}
      accessibilityLabel={`Shortlist this session, ${s.spotsLeft} spots left`}
      accessibilityRole="button"
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
        lockedFriendsSlot={lockedFriendsSlot}
        onSignIn={onSignIn}
        onFriendsPress={onFriendsPress}
      />
    </View>
  )
}

/* ── SwipeOverlayLabel ────────────────────────────────────────── */
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

/* ── AnimatedSwipeCard ───────────────────────────────────────── */
function AnimatedSwipeCard({
  s,
  onSkip,
  onSave,
  isSignedIn,
  lockedFriendsSlot,
  onSignIn,
  onFriendsPress,
}: {
  s: Session
  onSkip: () => void
  onSave: () => void
  isSignedIn: boolean
  lockedFriendsSlot?: React.ReactNode
  onSignIn?: () => void
  onFriendsPress?: () => void
}) {
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
        />
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
}: {
  onNavigateToShortlist: () => void
}) {
  const { openSignUp } = useSignUpModal()
  const signedIn = useAuthStore((s) => s.isSignedIn)()
  const deck = useSessionStore((s) => s.sessions)
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const { fetchSessions, fetchIfNeeded, loadSavedIds, saveSession, unsaveSession, resetDeck } =
    useSessionStore.getState()
  const bootedRef = useRef(false)
  const locationRef = useRef<{ lat: number; lng: number }>({ lat: HCMC_LAT, lng: HCMC_LNG })
  const [refreshing, setRefreshing] = useState(false)
  const sort = useUiStore((s) => s.swipeSort)
  const setSwipeSort = useUiStore((s) => s.setSwipeSort)
  const [viewIdx, setViewIdx] = useState(0)
  const [viewHistory, setViewHistory] = useState<{ id: number; saved: boolean }[]>([])
  const [friendsModal, setFriendsModal] = useState<{
    visible: boolean
    title: string
    friends: FriendListItem[]
    overflowNote?: string
  }>({ visible: false, title: '', friends: [] })

  const openSessionFriends = useCallback((session: Session) => {
    if (!signedIn) return
    setFriendsModal({
      visible: true,
      title: `${session.friendCount} ${session.friendCount === 1 ? 'friend' : 'friends'} joining`,
      friends: session.friends.map((f) => ({
        userId: f.userId,
        displayName: f.displayName,
        imageUrl: f.imageUrl,
      })),
      overflowNote:
        session.friendsOverflow > 0
          ? `+${session.friendsOverflow} more on this session`
          : undefined,
    })
  }, [signedIn])

  const displayDeck = useMemo(() => {
    if (sort === 'friends') {
      return [...deck]
        .filter((s) => s.friendCount > 0)
        .sort((a, b) => b.friendCount - a.friendCount)
    }
    return deck
  }, [deck, sort])

  useEffect(() => {
    setViewIdx(0)
    setViewHistory([])
  }, [sort])

  useEffect(() => {
    setViewIdx(0)
    setViewHistory([])
  }, [deck.length])

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    loadSavedIds()
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          locationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        }
      } catch {
        // fallback to HCMC
      }
      await fetchIfNeeded(locationRef.current.lat, locationRef.current.lng)
    })()
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchSessions(locationRef.current.lat, locationRef.current.lng)
    setRefreshing(false)
  }, [fetchSessions])

  const total = displayDeck.length
  const current = displayDeck[viewIdx]
  const upNext = displayDeck.slice(viewIdx + 1, viewIdx + 4)
  const isDone = viewIdx >= total && total > 0
  const friendsFilterEmpty =
    sort === 'friends' && total === 0 && deck.length > 0 && !loading && !error

  const handleSave = () => {
    if (!current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    saveSession(current.id)
    setViewHistory((h) => [...h, { id: current.id, saved: true }])
    const nextIdx = viewIdx + 1
    setViewIdx(nextIdx)
    if (nextIdx >= total) setTimeout(onNavigateToShortlist, 600)
  }

  const handleSkip = () => {
    if (!current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setViewHistory((h) => [...h, { id: current.id, saved: false }])
    setViewIdx((i) => i + 1)
  }

  const handleUndo = () => {
    if (!viewHistory.length) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const last = viewHistory[viewHistory.length - 1]
    if (last.saved) unsaveSession(last.id)
    setViewHistory((h) => h.slice(0, -1))
    setViewIdx((i) => Math.max(0, i - 1))
  }

  const handleStartOver = () => {
    resetDeck()
    setViewIdx(0)
    setViewHistory([])
  }

  const lockedFriends = !signedIn ? (
    <LockedFriendsRow onPress={openSignUp} />
  ) : undefined

  const doneMessage = (() => {
    if (deck.length === 0) return "You've seen all sessions."
    const hours = deck.map((s) => parseInt(s.startTime.split(':')[0], 10))
    const maxHour = Math.max(...hours)
    if (maxHour >= 17) return "You've seen all games tonight."
    if (maxHour < 12) return "You've seen all morning sessions."
    return "You've seen all sessions for today."
  })()

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <TopBar
        title="Where to play?"
        counter={
          total > 0
            ? `${viewIdx + (viewIdx < total ? 1 : 0)}/${total}`
            : undefined
        }
      />

      {loading && total === 0 && !error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.amber} />
          <Text style={{ fontSize: 13, color: '#666', marginTop: 12 }}>
            Loading sessions...
          </Text>
        </View>
      ) : error && total === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <AlertCircle size={40} color="#666" strokeWidth={1.5} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', marginTop: 16, textAlign: 'center' }}>
            Couldn't load sessions
          </Text>
          <Text style={{ fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center' }}>
            Check your connection and try again
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={{
              marginTop: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: T.amber,
              borderRadius: 12,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
            accessibilityLabel="Retry loading sessions"
          >
            <RefreshCw size={16} color="#0B0B0C" strokeWidth={2} />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B0B0C' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !loading && total === 0 ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.amber} />
          }
        >
          <Inbox size={48} color="#444" strokeWidth={1.5} style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' }}>
            No sessions available
          </Text>
          <Text style={{ fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center' }}>
            Pull down to refresh, or check back later for new games
          </Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.amber} />
          }
        >
          {/* Filter pills */}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingBottom: 10,
            }}
          >
            {(['match', 'friends'] as const).map((key) => {
              const on = sort === key
              const label = key === 'match' ? 'Best match' : 'Friends'
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSwipeSort(key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 5,
                    borderRadius: 20,
                    backgroundColor: on ? T.amber : T.input,
                    borderWidth: 1,
                    borderColor: on ? T.amber : T.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: on ? '600' : '400',
                      color: on ? '#000' : T.muted,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {friendsFilterEmpty ? (
            <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
              <Users size={40} color="#444" strokeWidth={1.5} style={{ marginBottom: 12 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' }}>
                No games with friends joining
              </Text>
              <Text style={{ fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' }}>
                {signedIn
                  ? 'Follow players from your sessions, or switch to Best match.'
                  : 'Sign in and follow players to filter sessions they join.'}
              </Text>
              {!signedIn && (
                <TouchableOpacity
                  onPress={openSignUp}
                  style={{
                    marginTop: 20,
                    backgroundColor: T.amber,
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B0B0C' }}>
                    Sign in
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : isDone ? (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <CheckCircle2 size={48} color="#444" strokeWidth={1.5} style={{ marginBottom: 16 }} />
              <Text
                style={{
                  fontSize: 15,
                  color: 'rgba(255,255,255,0.35)',
                  marginBottom: 24,
                  textAlign: 'center',
                }}
              >
                {doneMessage}
              </Text>
              <TouchableOpacity
                onPress={handleStartOver}
                style={{
                  backgroundColor: T.amber,
                  borderRadius: 14,
                  paddingHorizontal: 28,
                  paddingVertical: 12,
                }}
                accessibilityLabel="Start swiping over"
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0B0B0C' }}>
                  Start over
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            current && (
              <>
                <AnimatedSwipeCard
                  key={current.id}
                  s={current}
                  onSkip={handleSkip}
                  onSave={handleSave}
                  isSignedIn={signedIn}
                  lockedFriendsSlot={lockedFriends}
                  onSignIn={openSignUp}
                  onFriendsPress={() => openSessionFriends(current)}
                />

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
                    accessibilityLabel="Skip this session"
                    accessibilityRole="button"
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
                    accessibilityLabel="Undo last swipe"
                    accessibilityRole="button"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: '#1a1a1a',
                      borderWidth: 1.5,
                      borderColor: '#2a2a2a',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: viewHistory.length ? 1 : 0.35,
                    }}
                  >
                    <RotateCcw size={18} color="#888" strokeWidth={2} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSave}
                    accessibilityLabel="Save to shortlist"
                    accessibilityRole="button"
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

      <FriendsListModal
        visible={friendsModal.visible}
        onClose={() => setFriendsModal((m) => ({ ...m, visible: false }))}
        title={friendsModal.title}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
      />
    </View>
  )
}
