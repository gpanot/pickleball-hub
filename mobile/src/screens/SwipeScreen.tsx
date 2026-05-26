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
  Linking,
  Modal,
  Pressable,
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
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { X, RotateCcw, Heart, RefreshCw, AlertCircle, Inbox, CheckCircle2, Users, Bookmark } from 'lucide-react-native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { T } from '../theme'
import {
  type Session,
  RING_COLORS,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'
import { LockedFriendsRow } from '../components/LockedFriendsRow'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { SignInPrompt } from '../components/SignInPrompt'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import type { SwipeDateFilter } from '../stores/uiStore'
import { FriendsListModal } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'
import { FriendGoingCard } from '../components/FriendGoingCard'
import type { FriendGoingItem } from '../components/FriendGoingCard'
import { PlayerProfileSheet } from '../components/PlayerProfileSheet'
import { debugLog } from '../lib/debug'

/* eslint-disable @typescript-eslint/no-var-requires */
const CARD_BG_IMAGES = [
  require('../../assets/images/card-bg.webp'),
  require('../../assets/images/card-bg-2.jpg'),
]

const { width: W, height: H } = Dimensions.get('window')

/* ── SwipeCard (with Shortlist CTA) ─────────────────────────── */
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
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a0a00', textAlign: 'center' }}>
        Shortlist · {s.spotsLeft} spots left
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', marginTop: 6, gap: 6, maxWidth: 180 }}>
        <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.15)' }}>
          <View
            style={{
              width: `${Math.round(fillPct * 100)}%`,
              height: 5,
              borderRadius: 3,
              backgroundColor: fillPct >= 0.85 ? '#c0392b' : '#1a0a00',
              opacity: fillPct >= 0.85 ? 1 : 0.6,
            }}
          />
        </View>
        <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(0,0,0,0.5)' }}>
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

/** Returns a YYYY-MM-DD date string offset by `days` days in Vietnam time (UTC+7). */
function vnDateString(offsetDays: number): string {
  const now = new Date()
  now.setTime(now.getTime() + (7 * 60 + offsetDays * 24 * 60) * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

/* ── SwipeScreen (main export) ───────────────────────────────── */
export function SwipeScreen() {
  const { openSignUp } = useSignUpModal()
  const signedIn = useAuthStore((s) => s.isSignedIn)()
  const allSessions = useSessionStore((s) => s.sessions)
  const savedIds = useSessionStore((s) => s.savedIds)
  const deck = useMemo(() => allSessions.filter((s) => !savedIds.has(s.id)), [allSessions, savedIds])
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const { fetchSessions, fetchIfNeeded, loadSavedIds, saveSession, unsaveSession, resetDeck, prefetchNextBatch } =
    useSessionStore.getState()
  const hasMore = useSessionStore((s) => s.hasMore)
  const totalCount = useSessionStore((s) => s.totalCount)
  const bootedRef = useRef(false)
  const locationRef = useRef<{ lat: number; lng: number }>({ lat: HCMC_LAT, lng: HCMC_LNG })
  const [refreshing, setRefreshing] = useState(false)
  const sort = useUiStore((s) => s.swipeSort)
  const setSwipeSort = useUiStore((s) => s.setSwipeSort)
  const dateFilter = useUiStore((s) => s.swipeDateFilter)
  const setDateFilter = useUiStore((s) => s.setSwipeDateFilter)
  const [viewIdx, setViewIdx] = useState(0)
  const [viewHistory, setViewHistory] = useState<{ id: number; saved: boolean }[]>([])
  const [friendsModal, setFriendsModal] = useState<{
    visible: boolean
    title: string
    friends: FriendListItem[]
    overflowNote?: string
  }>({ visible: false, title: '', friends: [] })

  const [playTab, setPlayTab] = useState<'discover' | 'shortlist'>('discover')
  const [expandedSession, setExpandedSession] = useState<Session | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [goingData, setGoingData] = useState<{ friendsGoing: FriendGoingItem[] } | null>(null)
  const [goingLoading, setGoingLoading] = useState(false)
  const [goingFilter, setGoingFilter] = useState<'today' | 'tomorrow' | 'all'>('today')
  const [removedSavedIds, setRemovedSavedIds] = useState<Set<number>>(new Set())

  const auth = useAuthStore.getState()

  const loadGoing = useCallback(async () => {
    setGoingLoading(true)
    try {
      const res = await auth.authedFetch(
        `/api/feed/friends-going?filter=${goingFilter}`
      )
      if (res.ok) {
        const data = await res.json()
        setGoingData(data)
        debugLog('Going', `filter=${goingFilter} friendsGoing=${data.friendsGoing?.length ?? 0}`)
        if (data.friendsGoing?.length > 0) {
          data.friendsGoing.forEach((s: FriendGoingItem) => {
            debugLog('Going', `  → "${s.name}" startTime=${s.startTime} friendCount=${s.friendCount} friends=${s.friends.map((f) => f.displayName).join(', ')}`)
          })
        } else {
          debugLog('Going', '  → no friend sessions returned')
        }
      } else {
        debugLog('Going', `fetch failed status=${res.status}`)
      }
    } finally {
      setGoingLoading(false)
    }
  }, [auth, goingFilter])

  useEffect(() => {
    if (playTab === 'shortlist') {
      loadGoing()
    }
  }, [playTab, goingFilter])

  const savedSessions = useSessionStore((s) => s.getSavedSessions)()
  const shortlistItems = useMemo(
    () => savedSessions.filter((s) => !removedSavedIds.has(s.id)),
    [savedSessions, removedSavedIds],
  )
  const shortlistCount = shortlistItems.length

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

  const openTopDupr = useCallback((session: Session) => {
    if (!signedIn) return
    const topPlayers = session.roster
      .filter((p) => p.duprDoubles != null && p.duprDoubles > 0)
      .sort((a, b) => (b.duprDoubles ?? 0) - (a.duprDoubles ?? 0))
      .slice(0, 3)
    setFriendsModal({
      visible: true,
      title: 'Top 3 DUPR joining',
      friends: topPlayers.map((p, i) => ({
        userId: `dupr-${i}`,
        displayName: p.displayName,
        imageUrl: p.imageUrl,
        duprDoubles: p.duprDoubles,
      })),
    })
  }, [signedIn])

  const displayDeck = useMemo(() => {
    const withFriends = deck.filter((s) => s.friendCount > 0)
    debugLog('Discover', `deck=${deck.length} withFriends=${withFriends.length} sort=${sort} dateFilter=${dateFilter}`)
    withFriends.forEach((s) => {
      debugLog('Discover', `  → [FRIEND] "${s.name}" startTime=${s.startTime} friendCount=${s.friendCount} friends=${s.friends.map((f) => f.displayName).join(', ')}`)
    })
    if (sort === 'friends') {
      return withFriends.sort((a, b) => b.friendCount - a.friendCount)
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
    const date = dateFilter === 'tomorrow' ? vnDateString(1) : undefined
    fetchSessions(locationRef.current.lat, locationRef.current.lng, date)
  }, [dateFilter])

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
      const date = dateFilter === 'tomorrow' ? vnDateString(1) : undefined
      await fetchIfNeeded(locationRef.current.lat, locationRef.current.lng, date)
    })()
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    const date = dateFilter === 'tomorrow' ? vnDateString(1) : undefined
    await fetchSessions(locationRef.current.lat, locationRef.current.lng, date)
    setRefreshing(false)
  }, [fetchSessions, dateFilter])

  const total = displayDeck.length
  const current = displayDeck[viewIdx]
  const upNext = displayDeck.slice(viewIdx + 1, viewIdx + 4)
  const isDone = viewIdx >= total && total > 0
  const friendsFilterEmpty =
    sort === 'friends' && total === 0 && deck.length > 0 && !loading && !error

  const triggerPrefetchIfNeeded = (nextIdx: number) => {
    if (hasMore && total - nextIdx <= 5) {
      prefetchNextBatch()
    }
  }

  const handleSave = () => {
    if (!current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    saveSession(current.id)
    setViewHistory((h) => [...h, { id: current.id, saved: true }])
    const nextIdx = viewIdx + 1
    setViewIdx(nextIdx)
    triggerPrefetchIfNeeded(nextIdx)
  }

  const handleSkip = () => {
    if (!current) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setViewHistory((h) => [...h, { id: current.id, saved: false }])
    const nextIdx = viewIdx + 1
    setViewIdx(nextIdx)
    triggerPrefetchIfNeeded(nextIdx)
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
          playTab === 'discover' && total > 0
            ? `${viewIdx + (viewIdx < total ? 1 : 0)}/${sort === 'friends' ? total : (totalCount ?? total)}`
            : undefined
        }
      />

      {/* Sub-tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, playTab === 'discover' && s.tabActive]}
          onPress={() => setPlayTab('discover')}
        >
          <Text style={[s.tabText, playTab === 'discover' && s.tabTextActive]}>
            Discover
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, playTab === 'shortlist' && s.tabActive]}
          onPress={() => setPlayTab('shortlist')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[s.tabText, playTab === 'shortlist' && s.tabTextActive]}>
              Going
            </Text>
            {shortlistCount > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeText}>{shortlistCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Discover tab ─────────────────────────────────────── */}
      {playTab === 'discover' && (
        <>
          {/* Filter pills — always visible, never hidden during loading */}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingHorizontal: 16,
              paddingBottom: 10,
              alignItems: 'center',
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

            {/* Divider */}
            <View style={{ width: 1, height: 16, backgroundColor: T.border, marginHorizontal: 2 }} />

            {(['today', 'tomorrow'] as const).map((key: SwipeDateFilter) => {
              const on = dateFilter === key
              const label = key === 'today' ? 'Today' : 'Tomorrow'
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setDateFilter(key)}
                  style={{ paddingVertical: 5, paddingHorizontal: 2 }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: on ? '600' : '400',
                      color: on ? '#fff' : T.muted,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

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
          ) : !loading && deck.length === 0 && !error ? (
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
          ) : friendsFilterEmpty && !signedIn ? (
            <SignInPrompt
              title="See friends' games"
              subtitle="Sign in to follow players and filter sessions they join"
            />
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.amber} />
              }
            >
              {friendsFilterEmpty && signedIn ? (
                <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 }}>
                  <Users size={40} color="#444" strokeWidth={1.5} style={{ marginBottom: 12 }} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', textAlign: 'center' }}>
                    {`None of your friends are playing ${dateFilter === 'tomorrow' ? 'Tomorrow' : 'Today'}`}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#888', marginTop: 8, textAlign: 'center' }}>
                    Follow players from your sessions, or switch to Best match.
                  </Text>
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
                      onTopDuprPress={() => openTopDupr(current)}
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
        </>
      )}

      {/* ── Going tab ─────────────────────────────────────────── */}
      {playTab === 'shortlist' && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={goingLoading}
              onRefresh={() => {
                setRemovedSavedIds(new Set())
                loadGoing()
              }}
              tintColor={T.amber}
            />
          }
        >
          {/* Filter pills */}
          <View style={s.goingFilterRow}>
            {(['today', 'tomorrow', 'all'] as const).map((key) => {
              const on = goingFilter === key
              const label = key === 'today' ? 'Today' : key === 'tomorrow' ? 'Tomorrow' : 'All'
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setGoingFilter(key)}
                  style={[s.goingFilterPill, on && s.goingFilterPillActive]}
                >
                  <Text style={[s.goingFilterText, on && s.goingFilterTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {goingLoading ? (
            <ActivityIndicator color={T.amber} style={{ marginTop: 40 }} />
          ) : (
            <>
              {/* Friends going section */}
              {goingData && goingData.friendsGoing.length > 0 ? (
                <>
                  <View style={s.goingSectionHeader}>
                    <Text style={s.goingSectionLabel}>
                      {goingFilter === 'today' ? 'Friends going today'
                        : goingFilter === 'tomorrow' ? 'Friends going tomorrow'
                        : 'Friends going'}
                    </Text>
                    <Text style={s.goingSectionCount}>
                      {goingData.friendsGoing.length} session{goingData.friendsGoing.length !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {goingData.friendsGoing.map((item, index) => (
                    <FriendGoingCard
                      key={item.sessionId}
                      item={item}
                      isTop={index === 0}
                      onPlayerPress={(userId) => setSelectedPlayerId(userId)}
                    />
                  ))}
                </>
              ) : (
                <View style={s.emptyFriends}>
                  <Text style={s.emptyFriendsIcon}>👥</Text>
                  <Text style={s.emptyFriendsTitle}>
                    {goingFilter === 'today'
                      ? 'No friends going today yet'
                      : goingFilter === 'tomorrow'
                        ? 'No friends going tomorrow yet'
                        : 'No friends going'}
                  </Text>
                  <Text style={s.emptyFriendsSub}>
                    Follow players in Circle to see where they play
                  </Text>
                </View>
              )}

              {/* Saved sessions section */}
              {shortlistItems.length > 0 && (
                <>
                  <View style={s.savedDivider} />
                  <View style={s.goingSectionHeader}>
                    <Text style={s.goingSectionLabel}>Your saved sessions</Text>
                    <Text style={s.goingSectionCount}>
                      {shortlistItems.length} saved
                    </Text>
                  </View>
                  {shortlistItems.map((item, index) => (
                    <ReanimatedSwipeable
                      key={`saved-${item.id}-${index}`}
                      friction={2}
                      leftThreshold={60}
                      renderLeftActions={() => (
                        <View style={s.savedSwipeDelete}>
                          <Text style={s.savedSwipeDeleteText}>Remove</Text>
                        </View>
                      )}
                      onSwipeableOpen={(direction) => {
                        if (direction === 'left') {
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                          setRemovedSavedIds((prev) => new Set([...prev, item.id]))
                          unsaveSession(item.id)
                        }
                      }}
                    >
                      <TouchableOpacity
                        style={[
                          s.savedRow,
                          index === shortlistItems.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      activeOpacity={0.8}
                      onPress={() => setExpandedSession(item)}
                    >
                      <View style={s.savedThumb}>
                          <Text style={s.savedThumbPct} numberOfLines={1}>
                            {item.matchScore > 0 ? `${item.matchScore}%` : 'New'}
                          </Text>
                        </View>
                        <View style={s.savedInfo}>
                          <Text style={s.savedName} numberOfLines={1}>{item.name}</Text>
                          <Text style={s.savedMeta}>
                            {formatTime(item.startTime)} · {item.spotsLeft} spots left
                          </Text>
                          {item.club?.name && (
                            <Text style={s.savedVenue} numberOfLines={1}>{item.club.name}</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={s.savedJoinBtn}
                          onPress={() => item.eventUrl && Linking.openURL(item.eventUrl)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={s.savedJoinText}>Join on{'\n'}Reclub</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </ReanimatedSwipeable>
                  ))}
                  <TouchableOpacity style={s.keepSwiping} onPress={() => setPlayTab('discover')}>
                    <Text style={s.keepSwipingText}>Keep swiping for more →</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Both empty */}
              {goingData && goingData.friendsGoing.length === 0 && shortlistItems.length === 0 && (
                <View style={s.emptyShortlist}>
                  <Bookmark size={44} color="#1e1e1e" />
                  <Text style={s.emptyShortlistText}>
                    Swipe sessions in Discover to save them here
                  </Text>
                  <TouchableOpacity
                    style={s.emptyShortlistBtn}
                    onPress={() => setPlayTab('discover')}
                  >
                    <Text style={s.emptyShortlistBtnText}>Start swiping</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Expanded shortlist card modal */}
      <Modal
        visible={!!expandedSession}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setExpandedSession(null)}
      >
        <Pressable style={s.expandedBackdrop} onPress={() => setExpandedSession(null)}>
          <Pressable style={s.expandedSheet} onPress={(e) => e.stopPropagation()}>
            {expandedSession && (
              <View style={{ width: '100%', height: Math.min(CARD_HEIGHT, H * 0.72) }}>
                <CardBody
                  s={expandedSession}
                  renderCta={
                    <TouchableOpacity
                      onPress={() => {
                        Linking.openURL(expandedSession.eventUrl)
                        setExpandedSession(null)
                      }}
                      style={{
                        backgroundColor: T.amber,
                        borderRadius: 14,
                        paddingVertical: 11,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#1a0a00' }}>
                        Join on Reclub · {expandedSession.spotsLeft} spots left
                      </Text>
                      <Text style={{ fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 2 }}>
                        {expandedSession.joined} / {expandedSession.maxPlayers} filled
                      </Text>
                    </TouchableOpacity>
                  }
                  isSignedIn={signedIn}
                  onFriendsPress={() => openSessionFriends(expandedSession)}
                  onTopDuprPress={() => openTopDupr(expandedSession)}
                />
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <FriendsListModal
        visible={friendsModal.visible}
        onClose={() => setFriendsModal((m) => ({ ...m, visible: false }))}
        title={friendsModal.title}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
      />

      <PlayerProfileSheet
        userId={selectedPlayerId}
        onClose={() => setSelectedPlayerId(null)}
      />
    </View>
  )
}

const s = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#141414',
    borderRadius: 9,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 7,
  },
  tabActive: {
    backgroundColor: '#1e1e1e',
  },
  tabText: {
    fontSize: 12,
    color: '#555',
  },
  tabTextActive: {
    fontSize: 12,
    color: '#f5a623',
    fontWeight: '500',
  },
  tabBadge: {
    backgroundColor: '#f5a623',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tabBadgeText: {
    fontSize: 9,
    color: '#1a0a00',
    fontWeight: '600',
  },
  emptyShortlist: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyShortlistText: {
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyShortlistBtn: {
    backgroundColor: '#f5a623',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  emptyShortlistBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a0a00',
  },
  shortlistHeader: {
    fontSize: 11,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  shortlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#111',
    gap: 12,
  },
  shortlistRowBest: {
    backgroundColor: '#1f1400',
    borderBottomColor: '#2a1400',
  },
  shortlistInfo: {
    flex: 1,
    minWidth: 0,
  },
  shortlistName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#eee',
  },
  shortlistMeta: {
    fontSize: 11,
    color: '#555',
    marginTop: 3,
  },
  shortlistBestLabel: {
    fontSize: 10,
    color: '#f5a623',
    fontWeight: '600',
    marginTop: 4,
  },
  shortlistFriendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  shortlistFriendAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  shortlistFriendsLabel: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },
  shortlistRight: {
    alignItems: 'flex-end',
    gap: 5,
    flexShrink: 0,
  },
  shortlistPct: {
    fontSize: 15,
    fontWeight: '600',
  },
  shortlistJoin: {
    backgroundColor: '#f5a623',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    flexShrink: 0,
  },
  shortlistJoinText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a0a00',
    textAlign: 'center',
  },
  keepSwiping: {
    padding: 14,
    alignItems: 'center',
  },
  keepSwipingText: {
    fontSize: 11,
    color: '#2a2a2a',
  },
  expandedBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  expandedSheet: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  // ── Going tab styles ──────────────────────────────────────────
  goingFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    alignItems: 'center',
  },
  goingFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: T.input,
    borderWidth: 1,
    borderColor: T.border,
  },
  goingFilterPillActive: {
    backgroundColor: T.amber,
    borderColor: T.amber,
  },
  goingFilterText: {
    fontSize: 12,
    fontWeight: '400',
    color: T.muted,
  },
  goingFilterTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  goingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  goingSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  goingSectionCount: {
    fontSize: 11,
    color: '#444',
  },
  emptyFriends: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyFriendsIcon: {
    fontSize: 36,
    marginBottom: 4,
  },
  emptyFriendsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#aaa',
    textAlign: 'center',
  },
  emptyFriendsSub: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 2,
  },
  savedDivider: {
    height: 1,
    backgroundColor: '#161616',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 2,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#111',
    backgroundColor: '#000',
    gap: 12,
  },
  savedThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  savedThumbPct: {
    fontSize: 13,
    fontWeight: '700',
    color: T.amber,
  },
  savedInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  savedName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#eee',
  },
  savedMeta: {
    fontSize: 11,
    color: '#555',
  },
  savedVenue: {
    fontSize: 10,
    color: '#3a3a3a',
  },
  savedJoinBtn: {
    backgroundColor: '#f5a623',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    flexShrink: 0,
  },
  savedJoinText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a0a00',
    textAlign: 'center',
  },
  savedSwipeDelete: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    width: 80,
    marginVertical: 1,
  },
  savedSwipeDeleteText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
})
