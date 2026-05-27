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
  averageDupr,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'
import { LockedFriendsRow } from '../components/LockedFriendsRow'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { GearTeaserCard } from '../components/GearTeaserCard'
import { SignInPrompt } from '../components/SignInPrompt'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import type { SwipeDateFilter, TimeSlotKey, SwipeMaxCards } from '../stores/uiStore'
import { FriendsListModal } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'
import { FriendGoingCard } from '../components/FriendGoingCard'
import type { FriendGoingItem } from '../components/FriendGoingCard'
import { debugLog } from '../lib/debug'
import Slider from '@react-native-community/slider'

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
  const showScore = s.matchScore >= 50
  const mc = !showScore
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

const HCMC_LAT = 10.78
const HCMC_LNG = 106.69

/** Returns a YYYY-MM-DD date string offset by `days` days in Vietnam time (UTC+7). */
function vnDateString(offsetDays: number): string {
  const now = new Date()
  now.setTime(now.getTime() + (7 * 60 + offsetDays * 24 * 60) * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

/* ── SwipeScreen (main export) ───────────────────────────────── */
export function SwipeScreen({ onOpenGearSheet, gearSaved }: { onOpenGearSheet?: () => void; gearSaved?: boolean }) {
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
  const dateFilter = useUiStore((s) => s.swipeDateFilter)
  const setDateFilter = useUiStore((s) => s.setSwipeDateFilter)
  const swipeDuprMin = useUiStore((s) => s.swipeDuprMin)
  const setSwipeDuprMin = useUiStore((s) => s.setSwipeDuprMin)
  const swipeTimeSlots = useUiStore((s) => s.swipeTimeSlots)
  const setSwipeTimeSlots = useUiStore((s) => s.setSwipeTimeSlots)
  const swipeMaxCards = useUiStore((s) => s.swipeMaxCards)
  const setSwipeMaxCards = useUiStore((s) => s.setSwipeMaxCards)
  const swipeRangeKm = useUiStore((s) => s.swipeRangeKm)
  const setSwipeRangeKm = useUiStore((s) => s.setSwipeRangeKm)
  const [filterModalVisible, setFilterModalVisible] = useState(false)
  const [filterOpenKey, setFilterOpenKey] = useState(0)
  const [draftDupr, setDraftDupr] = useState(swipeDuprMin)
  const [slidingDupr, setSlidingDupr] = useState(swipeDuprMin)
  const [draftTimeSlots, setDraftTimeSlots] = useState<TimeSlotKey[]>(swipeTimeSlots)
  const [draftMaxCards, setDraftMaxCards] = useState(swipeMaxCards)
  const [draftRangeKm, setDraftRangeKm] = useState<number | null>(swipeRangeKm)
  const [vibeFilter, setVibeFilter] = useState<'social' | 'competitive' | null>(null)
  const [spotsOnly, setSpotsOnly] = useState(false)
  const [viewIdx, setViewIdx] = useState(0)
  const [viewHistory, setViewHistory] = useState<{ id: number; saved: boolean }[]>([])
  const [friendsModal, setFriendsModal] = useState<{
    visible: boolean
    title: string
    friends: FriendListItem[]
    overflowNote?: string
    showFollow?: boolean
  }>({ visible: false, title: '', friends: [] })

  const [playTab, setPlayTab] = useState<'discover' | 'shortlist'>('discover')
  const [expandedSession, setExpandedSession] = useState<Session | null>(null)
  const [friendsGoingToday, setFriendsGoingToday] = useState<FriendGoingItem[]>([])
  const [friendsGoingTomorrow, setFriendsGoingTomorrow] = useState<FriendGoingItem[]>([])
  const [goingLoading, setGoingLoading] = useState(false)
  const [removedSavedIds, setRemovedSavedIds] = useState<Set<number>>(new Set())

  const auth = useAuthStore.getState()

  const loadGoing = useCallback(async () => {
    setGoingLoading(true)
    try {
      const [todayRes, tomorrowRes] = await Promise.all([
        auth.authedFetch('/api/feed/friends-going?filter=today'),
        auth.authedFetch('/api/feed/friends-going?filter=tomorrow'),
      ])
      if (todayRes.ok) {
        const data = await todayRes.json()
        const items: FriendGoingItem[] = data.friendsGoing ?? []
        setFriendsGoingToday(items)
        debugLog('Going', `today friendsGoing=${items.length}`)
      }
      if (tomorrowRes.ok) {
        const data = await tomorrowRes.json()
        const items: FriendGoingItem[] = data.friendsGoing ?? []
        setFriendsGoingTomorrow(items)
        debugLog('Going', `tomorrow friendsGoing=${items.length}`)
      }
    } finally {
      setGoingLoading(false)
    }
  }, [auth])

  const goingLoadedRef = useRef(false)

  useEffect(() => {
    if (playTab === 'shortlist' && !goingLoadedRef.current) {
      goingLoadedRef.current = true
      loadGoing()
    }
  }, [playTab, loadGoing])

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
        duprDoubles: f.duprDoubles ?? null,
      })),
      overflowNote:
        session.friendsOverflow > 0
          ? `+${session.friendsOverflow} more on this session`
          : undefined,
    })
  }, [signedIn])

  const openGoingFriends = useCallback((item: FriendGoingItem) => {
    if (!signedIn) return
    setFriendsModal({
      visible: true,
      title: `${item.friendCount} ${item.friendCount === 1 ? 'friend' : 'friends'} going`,
      friends: item.friends.map((f) => ({
        userId: f.userId,
        displayName: f.displayName,
        imageUrl: f.imageUrl,
        duprDoubles: f.duprDoubles,
      })),
      overflowNote:
        item.friendCount > item.friends.length
          ? `+${item.friendCount - item.friends.length} more on this session`
          : undefined,
    })
  }, [signedIn])

  const openTopDupr = useCallback((session: Session) => {
    if (!signedIn) return
    const topPlayers = session.roster
      .filter((p) => p.duprDoubles != null && p.duprDoubles > 0)
      .sort((a, b) => (b.duprDoubles ?? 0) - (a.duprDoubles ?? 0))
      .slice(0, 6)
    const avg = averageDupr(topPlayers)
    const title =
      avg != null
        ? `Top 6 DUPR joining - Avge. ${avg.toFixed(2)}`
        : 'Top 6 DUPR joining'
    setFriendsModal({
      visible: true,
      title,
      showFollow: true,
      friends: topPlayers.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        imageUrl: p.imageUrl,
        duprDoubles: p.duprDoubles,
        isFollowing: p.isFollowing ?? false,
      })),
    })
  }, [signedIn])

  const handleFollowFromTopDupr = useCallback(
    async (userId: string) => {
      try {
        await auth.authedFetch(`/api/players/${userId}/follow`, { method: 'POST' })
        setFriendsModal((m) => ({
          ...m,
          friends: m.friends.map((f) =>
            f.userId === userId ? { ...f, isFollowing: true } : f,
          ),
        }))
      } catch {
        // ignore
      }
    },
    [auth],
  )

  const displayDeck = useMemo(() => {
    let result = deck
    if (vibeFilter) result = result.filter(s => s.vibeTag === vibeFilter)
    if (spotsOnly) result = result.filter(s => s.spotsLeft >= 3)
    return result
  }, [deck, vibeFilter, spotsOnly])

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
            ? `${viewIdx + (viewIdx < total ? 1 : 0)}/${totalCount ?? total}`
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
          {/* Date filter pills + filter button */}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingHorizontal: 16,
              paddingBottom: 10,
              alignItems: 'center',
            }}
          >
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
            <View style={{ flex: 1 }} />
            {/* Filter pill */}
            {(() => {
              const activeCount = (swipeDuprMin !== 3.0 ? 1 : 0) + (swipeTimeSlots.length < 3 ? 1 : 0) + (swipeMaxCards !== 20 ? 1 : 0) + (vibeFilter ? 1 : 0) + (spotsOnly ? 1 : 0) + (swipeRangeKm != null ? 1 : 0)
              return (
                <TouchableOpacity
                  onPress={() => {
                    setDraftDupr(swipeDuprMin)
                    setSlidingDupr(swipeDuprMin)
                    setDraftTimeSlots([...swipeTimeSlots])
                    setDraftMaxCards(swipeMaxCards)
                    setDraftRangeKm(swipeRangeKm)
                    setFilterOpenKey(k => k + 1)
                    setFilterModalVisible(true)
                  }}
                  style={[s.filterPill, activeCount > 0 && s.filterPillActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[s.filterPillText, activeCount > 0 && s.filterPillTextActive]}>
                    ⚡ Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
                  </Text>
                </TouchableOpacity>
              )
            })()}
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
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16 }}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.amber} />
              }
            >
              {isDone ? (
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
                      key={`card-${viewIdx}-${current.id}`}
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
                            <View key={`upnext-${viewIdx + 1 + i}-${sess.id}`} style={{ opacity: 1 - i * 0.2 }}>
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
      {playTab === 'shortlist' && !signedIn && <SignInPrompt />}

      {playTab === 'shortlist' && signedIn && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => {
                setRemovedSavedIds(new Set())
                loadGoing()
              }}
              tintColor={T.amber}
            />
          }
        >
          <GearTeaserCard
            height={230}
            onPress={() => onOpenGearSheet?.()}
            gearSaved={gearSaved}
          />

          {goingLoading ? (
            <ActivityIndicator color={T.amber} style={{ marginTop: 40 }} />
          ) : (
            <>
              {friendsGoingToday.length > 0 && (
                <>
                  <View style={s.goingSectionHeader}>
                    <Text style={s.goingSectionLabel}>
                      FRIENDS GOING{' '}
                      <Text style={s.goingSectionDay}>TODAY</Text>
                    </Text>
                    <Text style={s.goingSectionCount}>
                      {friendsGoingToday.length} session{friendsGoingToday.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {friendsGoingToday.map((item) => (
                    <FriendGoingCard
                      key={item.sessionId}
                      item={item}
                      onFriendsPress={() => openGoingFriends(item)}
                    />
                  ))}
                </>
              )}

              {friendsGoingTomorrow.length > 0 && (
                <>
                  <View style={s.goingSectionHeader}>
                    <Text style={s.goingSectionLabel}>
                      FRIENDS GOING{' '}
                      <Text style={s.goingSectionDay}>TOMORROW</Text>
                    </Text>
                    <Text style={s.goingSectionCount}>
                      {friendsGoingTomorrow.length} session{friendsGoingTomorrow.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {friendsGoingTomorrow.map((item) => (
                    <FriendGoingCard
                      key={item.sessionId}
                      item={item}
                      onFriendsPress={() => openGoingFriends(item)}
                    />
                  ))}
                </>
              )}

              {friendsGoingToday.length === 0 && friendsGoingTomorrow.length === 0 && (
                <View style={s.emptyFriends}>
                  <Text style={s.emptyFriendsIcon}>👥</Text>
                  <Text style={s.emptyFriendsTitle}>No friends going today or tomorrow</Text>
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
                            {item.matchScore >= 50 ? `${item.matchScore}%` : '—'}
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
              {friendsGoingToday.length === 0 && friendsGoingTomorrow.length === 0 && shortlistItems.length === 0 && (
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

      {/* Expanded shortlist card — root-level overlay (same pattern as SignUpModal) */}
      {expandedSession && (
        <View style={s.expandedHost} pointerEvents="box-none">
          <Pressable
            style={s.expandedBackdrop}
            onPress={() => setExpandedSession(null)}
          />
          <View style={s.expandedCard} pointerEvents="auto">
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
          </View>
        </View>
      )}

      <FriendsListModal
        visible={friendsModal.visible}
        onClose={() => setFriendsModal((m) => ({ ...m, visible: false }))}
        title={friendsModal.title}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
        onFollow={friendsModal.showFollow ? handleFollowFromTopDupr : undefined}
      />

      {/* Filter overlay — root-level so it always covers the full screen */}
      {filterModalVisible && (
        <View style={s.filterHost} pointerEvents="box-none">
          <Pressable style={s.filterBackdrop} onPress={() => setFilterModalVisible(false)} />
          <View style={s.filterSheet} pointerEvents="auto">
            <View style={s.filterHandle} />

            {/* Header */}
            <View style={s.filterHeader}>
              <Text style={s.filterTitle}>Filters</Text>
              <View style={s.filterHeaderRight}>
                <TouchableOpacity
                  onPress={() => {
                    setDraftDupr(3.0)
                    setSlidingDupr(3.0)
                    setDraftTimeSlots(['morning', 'afternoon', 'evening'])
                    setDraftRangeKm(null)
                    setVibeFilter(null)
                    setSpotsOnly(false)
                  }}
                >
                  <Text style={s.filterReset}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.filterClose} onPress={() => setFilterModalVisible(false)}>
                  <X size={16} color="#555" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              {/* DUPR slider */}
              <View style={s.filterSection}>
                <View style={s.filterSectionRow}>
                  <Text style={s.filterLabel}>Min DUPR</Text>
                  <Text style={s.filterValue}>{slidingDupr.toFixed(1)}+</Text>
                </View>
                <Slider
                  key={`slider-${filterOpenKey}`}
                  style={{ width: '100%', height: 32 }}
                  minimumValue={2.0}
                  maximumValue={6.0}
                  step={0.1}
                  value={draftDupr}
                  onValueChange={(val) => setSlidingDupr(Math.round(val * 10) / 10)}
                  onSlidingComplete={(val) => {
                    const rounded = Math.round(val * 10) / 10
                    setSlidingDupr(rounded)
                    setDraftDupr(rounded)
                  }}
                  minimumTrackTintColor={T.amber}
                  maximumTrackTintColor="#1e1e1e"
                  thumbTintColor={T.amber}
                />
                <View style={s.sliderLabels}>
                  {['2.0', '3.0', '4.0', '5.0', '6.0'].map(l => (
                    <Text key={l} style={s.sliderLabel}>{l}</Text>
                  ))}
                </View>
              </View>

              {/* Time of day */}
              <View style={s.filterSection}>
                <Text style={s.filterLabel}>Time of day</Text>
                <View style={s.filterChipRow}>
                  {([
                    { key: 'morning' as TimeSlotKey, label: 'Morning', sub: 'Before 12h' },
                    { key: 'afternoon' as TimeSlotKey, label: 'Afternoon', sub: '12h — 17h' },
                    { key: 'evening' as TimeSlotKey, label: 'Evening', sub: 'After 17h' },
                  ]).map(t => {
                    const on = draftTimeSlots.includes(t.key)
                    return (
                      <TouchableOpacity
                        key={t.key}
                        style={[s.filterTimeBtn, on && s.filterTimeBtnOn]}
                        onPress={() => setDraftTimeSlots(prev =>
                          prev.includes(t.key)
                            ? prev.filter(k => k !== t.key).length > 0 ? prev.filter(k => k !== t.key) : prev
                            : [...prev, t.key]
                        )}
                      >
                        <Text style={[s.filterTimeLbl, on && s.filterTimeLblOn]}>{t.label}</Text>
                        <Text style={[s.filterTimeSub, on && s.filterTimeSubOn]}>{t.sub}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Vibe */}
              <View style={s.filterSection}>
                <Text style={s.filterLabel}>Vibe</Text>
                <View style={s.filterChipRow}>
                  {([
                    { key: 'social' as const, label: 'Social' },
                    { key: 'competitive' as const, label: 'Competitive' },
                  ]).map(v => (
                    <TouchableOpacity
                      key={v.key}
                      style={[s.filterVibeBtn, vibeFilter === v.key && s.filterVibeBtnOn]}
                      onPress={() => setVibeFilter(prev => prev === v.key ? null : v.key)}
                    >
                      <Text style={[s.filterVibeLbl, vibeFilter === v.key && s.filterVibeLblOn]}>{v.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[s.filterVibeBtn, vibeFilter === null && s.filterVibeBtnOn]}
                    onPress={() => setVibeFilter(null)}
                  >
                    <Text style={[s.filterVibeLbl, vibeFilter === null && s.filterVibeLblOn]}>Any</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Distance range */}
              <View style={s.filterSection}>
                <Text style={s.filterLabel}>Max distance</Text>
                <View style={s.filterChipRow}>
                  {([null, 5, 10, 20, 30] as (number | null)[]).map((v) => (
                    <TouchableOpacity
                      key={v ?? 'any'}
                      style={[s.filterVibeBtn, draftRangeKm === v && s.filterVibeBtnOn]}
                      onPress={() => setDraftRangeKm(v)}
                    >
                      <Text style={[s.filterVibeLbl, draftRangeKm === v && s.filterVibeLblOn]}>
                        {v == null ? 'Any' : `${v} km`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Spots toggle */}
              <View style={s.filterSection}>
                <TouchableOpacity
                  style={s.filterToggleRow}
                  onPress={() => setSpotsOnly(prev => !prev)}
                  activeOpacity={0.8}
                >
                  <View style={s.filterToggleLeft}>
                    <Text style={s.filterToggleLbl}>3+ spots available only</Text>
                    <Text style={s.filterToggleSub}>Hide sessions that are nearly full</Text>
                  </View>
                  <View style={[s.filterToggle, spotsOnly && s.filterToggleOn]}>
                    <View style={[s.filterToggleDot, spotsOnly && s.filterToggleDotOn]} />
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Apply */}
            <TouchableOpacity
              style={s.filterApply}
              onPress={() => {
                console.log(
                  `\n[Filters] ─────────────────────────────\n` +
                  `  DUPR min   : ${draftDupr.toFixed(1)}+\n` +
                  `  Time slots : ${draftTimeSlots.join(', ')}\n` +
                  `  Max dist   : ${draftRangeKm != null ? draftRangeKm + ' km' : 'any'}\n` +
                  `  Max cards  : ${draftMaxCards}\n` +
                  `  Vibe       : ${vibeFilter ?? 'any'}\n` +
                  `  3+ spots   : ${spotsOnly ? 'ON' : 'off'}\n` +
                  `────────────────────────────────────────`
                )
                // Commit to store for persistence
                setSwipeDuprMin(draftDupr)
                setSwipeTimeSlots(draftTimeSlots)
                setSwipeMaxCards(draftMaxCards)
                setSwipeRangeKm(draftRangeKm)
                setFilterModalVisible(false)
                const date = dateFilter === 'tomorrow' ? vnDateString(1) : undefined
                // Pass draft values directly so the fetch doesn't race with Zustand batching
                fetchSessions(locationRef.current.lat, locationRef.current.lng, date, {
                  duprMin: draftDupr,
                  timeSlots: draftTimeSlots,
                  maxCards: draftMaxCards,
                  rangeKm: draftRangeKm,
                })
              }}
              activeOpacity={0.85}
            >
              <Text style={s.filterApplyText}>Apply Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  expandedHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  expandedBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  expandedCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    overflow: 'hidden',
  },
  // ── Going tab styles ──────────────────────────────────────────
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
  goingSectionDay: {
    color: T.amber,
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
  // ── Filter overlay (root-level, same pattern as FriendsListModal) ───────────
  filterHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  filterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  filterSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: '#222',
    maxHeight: '85%',
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  // ── Filter pill ──────────────────────────────────────────────
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
  },
  filterPillActive: {
    backgroundColor: T.amber,
    borderColor: T.amber,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: T.amber,
  },
  filterPillTextActive: {
    color: '#1a0a00',
  },
  filterHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 4,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  filterHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterReset: {
    fontSize: 13,
    color: T.amber,
    fontWeight: '500',
  },
  filterClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSection: {
    paddingHorizontal: 18,
    marginBottom: 22,
  },
  filterSectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 11,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '500',
    marginBottom: 10,
  },
  filterValue: {
    fontSize: 22,
    fontWeight: '700',
    color: T.amber,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sliderLabel: {
    fontSize: 10,
    color: '#333',
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 7,
  },
  filterTimeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
  },
  filterTimeBtnOn: {
    backgroundColor: '#1f1400',
    borderColor: T.amber,
  },
  filterTimeLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  filterTimeLblOn: {
    color: T.amber,
  },
  filterTimeSub: {
    fontSize: 9,
    color: '#2a2a2a',
  },
  filterTimeSubOn: {
    color: T.amber,
    opacity: 0.6,
  },
  filterVibeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterVibeBtnOn: {
    backgroundColor: '#1f1400',
    borderColor: T.amber,
  },
  filterVibeLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  filterVibeLblOn: {
    color: T.amber,
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  filterToggleLeft: {
    flex: 1,
  },
  filterToggleLbl: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '500',
  },
  filterToggleSub: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
  },
  filterToggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2a2a2a',
    position: 'relative',
    flexShrink: 0,
  },
  filterToggleOn: {
    backgroundColor: T.amber,
  },
  filterToggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#555',
    position: 'absolute',
    top: 2,
    left: 2,
  },
  filterToggleDotOn: {
    backgroundColor: '#fff',
    left: 18,
  },
  filterApply: {
    marginHorizontal: 18,
    marginBottom: 24,
    backgroundColor: T.amber,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  filterApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a0a00',
  },
})
