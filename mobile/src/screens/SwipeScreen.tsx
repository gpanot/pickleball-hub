import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SectionList,
  RefreshControl,
  StyleSheet,
  Dimensions,
  Linking,
  Pressable,
  Image,
  Animated,
} from 'react-native'
import { RefreshCw, Trophy, Users } from 'lucide-react-native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { T } from '../theme'
import { type Session, averageDupr, isSessionStarted } from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'
import { SquaddLoader } from '../components/SquaddLoader'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { GearTeaserCard } from '../components/GearTeaserCard'
import { SignInPrompt } from '../components/SignInPrompt'
import { useAuthStore, resolveApiBase } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import { type SwipeDateFilter, type TimeSlotKey } from '../stores/uiStore'
import { FilterPill, SwipeFilterSheet } from '../components/SwipeFilterControls'
import { FriendsListModal, type RecommendedPlayer } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'
import {
  FriendGoingCard,
  sessionToFriendGoingItem,
  getStartHour,
} from '../components/FriendGoingCard'
import type { FriendGoingItem } from '../components/FriendGoingCard'
import { IntentSheet } from '../components/IntentSheet'
import { PlayerProfileSheet } from '../components/PlayerProfileSheet'

type GoingTabFilter = SwipeDateFilter | 'saved'

type PlayIntent = {
  profileId: string
  displayName: string
  imageUrl: string | null
  timeSlot: string
  date: string
  distanceKm: number | null
  zaloNumber: string | null
  expiresAt: string
}

type MyActiveIntent = {
  timeSlot: string
  date: string
  zaloNumber: string | null
  expiresAt: string
} | null

type PlayApiCard = {
  sessionId: number
  name: string
  clubName: string
  venueName: string
  startTime: string
  scrapedDate: string
  spotsLeft: number
  totalSpots: number
  eventUrl: string
  matchScore: number
  distanceKm: number | null
  fillingFast: boolean
  fillRate?: number | null
  friendCount: number
  friends: FriendGoingItem['friends']
  topDupr: FriendGoingItem['topDupr']
  totalRoster: number
  duprCount?: number
  duprRange?: { min: number; max: number } | null
  returningPlayerPct?: number | null
  vibeTag?: string
}

function playCardToFriendGoingItem(c: PlayApiCard, userDupr?: number | null): FriendGoingItem {
  const duprCount =
    c.duprCount ??
    (c.topDupr ?? []).filter((p) => p.duprDoubles != null && p.duprDoubles > 0)
      .length
  return {
    sessionId: c.sessionId,
    name: c.name,
    clubName: c.clubName,
    venueName: c.venueName,
    startTime: c.startTime,
    scrapedDate: c.scrapedDate,
    spotsLeft: c.spotsLeft,
    totalSpots: c.totalSpots,
    eventUrl: c.eventUrl,
    matchScore: c.matchScore,
    fillingFast: c.fillingFast,
    fillRate: c.fillRate ?? null,
    distanceKm: c.distanceKm,
    friendCount: c.friendCount,
    friends: c.friends,
    topDupr: c.topDupr,
    totalRoster: c.totalRoster,
    duprCount,
    duprRange: c.duprRange ?? null,
    returningPlayerPct: c.returningPlayerPct ?? null,
    vibeTag: c.vibeTag,
    userDupr: userDupr ?? null,
  }
}
import { debugLog } from '../lib/debug'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LocationPermissionPopup } from '../components/LocationPermissionPopup'

const { height: H } = Dimensions.get('window')

const HCMC_LAT = 10.78
const HCMC_LNG = 106.69

/* ── SwipeScreen (main export) ───────────────────────────────── */
export function SwipeScreen({
  onOpenGearSheet,
  gearSaved,
  gearSetupComplete,
  onOpenExplore,
  isActive,
}: {
  onOpenGearSheet?: () => void
  gearSaved?: boolean
  gearSetupComplete?: boolean
  onOpenExplore?: () => void
  isActive?: boolean
}) {
  const { openSignUp } = useSignUpModal()
  const signedIn = useAuthStore((s) => s.isSignedIn)()
  const userDupr = useAuthStore((s) => s.duprRating)
  const { loadSavedIds, saveSession, unsaveSession } =
    useSessionStore.getState()
  const bootedRef = useRef(false)
  const locationRef = useRef<{ lat: number; lng: number }>({ lat: HCMC_LAT, lng: HCMC_LNG })
  const [refreshing, setRefreshing] = useState(false)
  const [top5DateFilter, setTop5DateFilter] = useState<SwipeDateFilter>('today')
  const [friendsModal, setFriendsModal] = useState<{
    visible: boolean
    title: string
    subtitle?: string
    friends: FriendListItem[]
    overflowNote?: string
    showFollow?: boolean
  }>({ visible: false, title: '', friends: [] })

  const [playTab, setPlayTab] = useState<'discover' | 'shortlist'>('discover')
  const [expandedSession, setExpandedSession] = useState<Session | null>(null)
  const [friendsGoingToday, setFriendsGoingToday] = useState<FriendGoingItem[]>([])
  const [friendsGoingTomorrow, setFriendsGoingTomorrow] = useState<FriendGoingItem[]>([])
  const [goingTabFilter, setGoingTabFilter] = useState<GoingTabFilter>('today')
  const [goingLoading, setGoingLoading] = useState(false)
  const [removedSavedIds, setRemovedSavedIds] = useState<Set<number>>(new Set())
  const [top5, setTop5] = useState<FriendGoingItem[]>([])
  const [playLoading, setPlayLoading] = useState(false)
  const [slotStats, setSlotStats] = useState<{ morning: number | null; afternoon: number | null; evening: number | null }>({ morning: null, afternoon: null, evening: null })
  const [top5FilterVisible, setTop5FilterVisible] = useState(false)
  const [top5FilterKey, setTop5FilterKey] = useState(0)
  const [top5VibeFilter, setTop5VibeFilter] = useState<'social' | 'competitive' | null>(null)
  const [top5SpotsOnly, setTop5SpotsOnly] = useState(false)

  const [playIntents, setPlayIntents] = useState<PlayIntent[]>([])
  const [intentSheetOpen, setIntentSheetOpen] = useState(false)
  const [myActiveIntent, setMyActiveIntent] = useState<MyActiveIntent>(null)
  const [intentExpanded, setIntentExpanded] = useState(false)
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendedPlayer[]>([])

  const currentUserGender = useAuthStore((s) => s.gender)
  const displayName = useAuthStore((s) => s.displayName)
  const imageUrl = useAuthStore((s) => s.imageUrl)
  const [showLocationPopup, setShowLocationPopup] = useState(false)
  const locationPopupShownRef = useRef(false)

  const pulseAnim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start()
  }, [pulseAnim])

  const auth = useAuthStore.getState()

  const playDataLoadedRef = useRef(false)

  const loadPlayData = useCallback(async (filterOverrides?: { duprMin: number; timeSlots: TimeSlotKey[] }) => {
    const t0 = Date.now()
    debugLog('PERF[TOP5]', `⏱ load started (filter=${top5DateFilter})`)
    setPlayLoading(true)
    try {
      const { lat, lng } = locationRef.current
      const filter = top5DateFilter === 'tomorrow' ? 'tomorrow' : 'today'
      const uiState = useUiStore.getState()
      const duprMin = filterOverrides?.duprMin ?? uiState.swipeDuprMin
      const timeSlots = filterOverrides?.timeSlots ?? uiState.swipeTimeSlots

      const qs = new URLSearchParams({
        filter,
        lat: String(lat),
        lng: String(lng),
        duprMin: String(duprMin),
        timeSlots: timeSlots.join(','),
      })

      const tFetch = Date.now()
      const res = signedIn
        ? await auth.authedFetch(`/api/play?${qs}`)
        : await fetch(`${resolveApiBase()}/api/play?${qs}`)
      debugLog('PERF[TOP5]', `⏱ /api/play network: ${Date.now() - tFetch}ms → HTTP ${res.status}`)

      if (!res.ok) {
        debugLog('Play', `loadPlayData /api/play returned ${res.status}`)
        debugLog('PERF[TOP5]', `⏱ TOTAL (error): ${Date.now() - t0}ms`)
        return
      }
      const tParse = Date.now()
      const data = await res.json()
      debugLog('PERF[TOP5]', `⏱ JSON parse: ${Date.now() - tParse}ms — cards=${data.top5?.length ?? 0}`)

      const mapCards = (cards: PlayApiCard[]) =>
        (cards ?? []).map((c) => playCardToFriendGoingItem(c, useAuthStore.getState().duprRating))

      setTop5(mapCards(data.top5))
      if (data.slotStats) setSlotStats(data.slotStats)
      debugLog('PERF[TOP5]', `⏱ TOTAL: ${Date.now() - t0}ms ✅`)
    } finally {
      setPlayLoading(false)
    }
  }, [auth, signedIn, top5DateFilter])

  const loadGoing = useCallback(async () => {
    const t0 = Date.now()
    debugLog('PERF[FRIENDS]', '⏱ load started (filter=both — single request)')
    setGoingLoading(true)
    try {
      const { lat, lng } = locationRef.current
      const locQs = `&lat=${lat}&lng=${lng}`
      const tFetch = Date.now()
      const [friendsRes, intentRes] = await Promise.all([
        auth.authedFetch(`/api/feed/friends-going?filter=both${locQs}`),
        auth.authedFetch('/api/play-intent/feed'),
      ])
      debugLog('PERF[FRIENDS]', `⏱ network: ${Date.now() - tFetch}ms → HTTP ${friendsRes.status}`)
      if (friendsRes.ok) {
        const data = await friendsRes.json()
        const todayItems: FriendGoingItem[] = data.today ?? []
        const tomorrowItems: FriendGoingItem[] = data.tomorrow ?? []
        setFriendsGoingToday(todayItems)
        setFriendsGoingTomorrow(tomorrowItems)
        debugLog('PERF[FRIENDS]', `⏱ parsed: today=${todayItems.length} tomorrow=${tomorrowItems.length}`)
      }
      if (intentRes.ok) {
        const intentData = await intentRes.json()
        setPlayIntents(intentData.items ?? [])
        setMyActiveIntent(intentData.myActiveIntent ?? null)
      }
      debugLog('PERF[FRIENDS]', `⏱ TOTAL: ${Date.now() - t0}ms ✅`)
    } finally {
      setGoingLoading(false)
    }
  }, [auth])

  const goingLoadedRef = useRef(false)

  const friendsGoingTodayUpcoming = useMemo(
    () => friendsGoingToday.filter((i) => !isSessionStarted(i)),
    [friendsGoingToday],
  )
  const friendsGoingTomorrowUpcoming = useMemo(
    () => friendsGoingTomorrow.filter((i) => !isSessionStarted(i)),
    [friendsGoingTomorrow],
  )

  const friendsGoingForDay =
    goingTabFilter === 'today' ? friendsGoingTodayUpcoming : friendsGoingTomorrowUpcoming

  const removeSavedSession = useCallback(
    (id: number) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setRemovedSavedIds((prev) => new Set([...prev, id]))
      unsaveSession(id)
    },
    [unsaveSession],
  )

  useEffect(() => {
    if (playTab === 'shortlist' && !goingLoadedRef.current) {
      goingLoadedRef.current = true
      loadGoing()
    }
  }, [playTab, loadGoing])

  const savedSessions = useSessionStore((s) => s.getSavedSessions)()
  const shortlistItems = useMemo(
    () =>
      savedSessions.filter(
        (s) => !removedSavedIds.has(s.id) && !isSessionStarted(s),
      ),
    [savedSessions, removedSavedIds],
  )
  const shortlistCount = shortlistItems.length

  // Drop expired saves from storage so the badge stays accurate
  useEffect(() => {
    if (playTab !== 'shortlist') return
    const expired = savedSessions.filter((s) => isSessionStarted(s))
    if (expired.length === 0) return
    expired.forEach((s) => unsaveSession(s.id))
  }, [playTab, savedSessions, unsaveSession])

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

  const openTopDuprModal = useCallback(
    async (
      topPlayers: Array<{
        userId: string
        displayName: string | null
        imageUrl: string | null
        duprDoubles: number | null
        isFollowing?: boolean
      }>,
      duprCount: number,
      totalRoster: number,
      extra?: {
        duprRange?: { min: number; max: number } | null
        returningPlayerPct?: number | null
        vibeTag?: string
        sessionId?: number
      },
    ) => {
      if (!signedIn || topPlayers.length === 0) return
      const avg = averageDupr(topPlayers)
      const title =
        avg != null
          ? `Top 8 DUPR joining - Avge. ${avg.toFixed(2)}`
          : 'Top 8 DUPR joining'

      const duprPct =
        totalRoster > 0 ? Math.round((duprCount / totalRoster) * 100) : null

      const lines: string[] = []
      if (duprPct != null) lines.push(`${duprPct}% of the players have a DUPR rating`)
      if (extra?.duprRange) lines.push(`DUPR : ${extra.duprRange.min.toFixed(1)} – ${extra.duprRange.max.toFixed(1)}`)
      if (extra?.returningPlayerPct != null) lines.push(`${Math.round(extra.returningPlayerPct)}% are regulars`)
      if (extra?.vibeTag) lines.push(`Vibe : ${extra.vibeTag.charAt(0).toUpperCase() + extra.vibeTag.slice(1)}`)

      const subtitle = lines.length > 0 ? lines.join('\n') : undefined

      const friends: FriendListItem[] = topPlayers.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        imageUrl: p.imageUrl,
        duprDoubles: p.duprDoubles,
        isFollowing: p.isFollowing ?? false,
      }))

      setFriendsModal({
        visible: true,
        title,
        subtitle,
        showFollow: true,
        friends,
      })

      // Compute recommendations in background
      setRecommendations([])
      if (extra?.sessionId) {
        try {
          const currentAuth = useAuthStore.getState()
          const profileId = currentAuth.profileId ?? ''
          const duprDoubles = currentAuth.duprRating

          // Fetch overlap counts
          const overlapRes = await auth.authedFetch(
            `/api/sessions/overlap?sessionId=${extra.sessionId}`
          )
          debugLog('Recommendations', `overlap fetch → HTTP ${overlapRes.status}`)
          const overlapData = overlapRes.ok ? await overlapRes.json() : { overlaps: [] }
          const sessionOverlapCounts = new Map<string, number>(
            (overlapData.overlaps ?? []).map((o: { userId: string; count: number }) => [o.userId, o.count])
          )
          debugLog('Recommendations', `overlap counts: ${JSON.stringify([...sessionOverlapCounts.entries()])}`)

          // Build following set and mutual-follow counts (approximated from existing friends list)
          const followingIds = new Set(
            friends.filter((f) => f.isFollowing).map((f) => f.userId)
          )
          const mutualFollowCounts = new Map<string, number>()

          const recs = getRecommendations(
            friends,
            { profileId, duprDoubles },
            followingIds,
            sessionOverlapCounts,
            mutualFollowCounts,
          )
          debugLog('Recommendations', `computed ${recs.length} recs for sessionId=${extra.sessionId}`)
          setRecommendations(recs)
        } catch (e) {
          debugLog('Recommendations', `error computing recs: ${e}`)
        }
      }
    },
    [signedIn, auth],
  )

  const openTopDupr = useCallback(
    (session: Session) => {
      const topPlayers = session.roster
        .filter((p) => p.duprDoubles != null && p.duprDoubles > 0)
        .sort((a, b) => (b.duprDoubles ?? 0) - (a.duprDoubles ?? 0))
        .slice(0, 8)
      const duprCount = session.roster.filter(
        (p) => p.duprDoubles != null && p.duprDoubles > 0,
      ).length
      openTopDuprModal(topPlayers, duprCount, session.roster.length, {
        duprRange: session.duprRange,
        returningPlayerPct: session.returningPlayerPct,
        vibeTag: session.vibeTag,
        sessionId: session.id,
      })
    },
    [openTopDuprModal],
  )

  const openTopDuprFromItem = useCallback(
    (item: FriendGoingItem) => {
      if (!item.topDupr?.length) return
      const dc = item.duprCount ?? item.topDupr.filter(
        (p) => p.duprDoubles != null && p.duprDoubles > 0,
      ).length
      openTopDuprModal(item.topDupr, dc, item.totalRoster, {
        duprRange: item.duprRange,
        returningPlayerPct: item.returningPlayerPct,
        vibeTag: item.vibeTag,
        sessionId: item.sessionId,
      })
    },
    [openTopDuprModal],
  )

  const handleFollowFromTopDupr = useCallback(
    async (userId: string) => {
      try {
        const res = await auth.authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Follow failed')
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

  // Boot: load data immediately with default location, resolve location in background.
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    debugLog('PERF[TOP5]', '⏱ screen mounted — starting boot load')
    loadSavedIds()
    playDataLoadedRef.current = true
    loadPlayData()
    ;(async () => {
      try {
        const tLoc = Date.now()
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          })
          const prev = locationRef.current
          locationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude }
          debugLog('PERF[TOP5]', `⏱ location resolved: ${Date.now() - tLoc}ms`)
          if (prev.lat !== locationRef.current.lat || prev.lng !== locationRef.current.lng) {
            loadPlayData()
          }
        } else {
          debugLog('PERF[TOP5]', `⏱ location not granted (status=${status}): ${Date.now() - tLoc}ms — using HCMC default`)
        }
      } catch {
        // fallback to HCMC
      }
    })()
  }, [])

  const swipeTabVisitCount = useRef(0)

  useEffect(() => {
    if (!isActive) return
    if (locationPopupShownRef.current) return
    // Only show location popup after user has signed in (both platforms)
    if (!signedIn) return

    swipeTabVisitCount.current += 1
    console.log('[LOCATION_DEBUG] swipe tab activated, visit #', swipeTabVisitCount.current, 'signedIn:', signedIn)

    if (swipeTabVisitCount.current < 2) return

    const check = async () => {
      const alreadyAsked = await AsyncStorage.getItem('squadd_location_permission_asked')
      console.log('[LOCATION_DEBUG] alreadyAsked:', alreadyAsked)
      if (alreadyAsked) return

      const { status } = await Location.getForegroundPermissionsAsync()
      console.log('[LOCATION_DEBUG] current permission status:', status)
      if (status === 'granted') return

      console.log('[LOCATION_DEBUG] showing location popup!')
      locationPopupShownRef.current = true
      setShowLocationPopup(true)
    }

    check()
  }, [isActive, signedIn])

  // Re-fetch when date filter changes or jwt arrives after boot.
  // Skip the very first render (boot effect handles that).
  useEffect(() => {
    if (!playDataLoadedRef.current) return
    loadPlayData()
  }, [top5DateFilter, signedIn, loadPlayData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadPlayData()
    setRefreshing(false)
  }, [loadPlayData])

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <TopBar
        title="WHERE TO PLAY?"
        counter={undefined}
      />

      {/* Sub-tab switcher — matches Circle screen style */}
      <View style={s.tabRow}>
        {([
          { key: 'discover' as const, label: 'Top 5', Icon: Trophy },
          { key: 'shortlist' as const, label: 'Friends', Icon: Users },
        ] as const).map(({ key, label, Icon }) => {
          const active = playTab === key
          return (
            <TouchableOpacity
              key={key}
              style={[s.tab, active && s.tabActive]}
              onPress={() => {
                debugLog(key === 'discover' ? 'PERF[TOP5]' : 'PERF[FRIENDS]', '⏱ tab tapped by user')
                setPlayTab(key)
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon size={14} color={active ? T.amber : '#555'} strokeWidth={2} />
                <Text style={[s.tabText, active && s.tabTextActive]}>
                  {label}
                </Text>
                {key === 'shortlist' && shortlistCount > 0 && (
                  <View style={s.tabBadge}>
                    <Text style={s.tabBadgeText}>{shortlistCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── TOP 5 tab ─────────────────────────────────────────── */}
      {playTab === 'discover' && (
        <>
          {/* Today / Tomorrow + Filters */}
          <View style={s.top5DateRow}>
            {(['today', 'tomorrow'] as const).map((key: SwipeDateFilter) => {
              const on = top5DateFilter === key
              const label = key === 'today' ? 'Today' : 'Tomorrow'
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTop5DateFilter(key)}
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
            <FilterPill
              onPress={() => {
                if (!signedIn) {
                  openSignUp()
                  return
                }
                setTop5FilterKey((k) => k + 1)
                setTop5FilterVisible(true)
              }}
              hideSections={{ maxDistance: true, vibe: true, spotsOnly: true }}
            />
          </View>

          {(() => {
            type Period = 'MORNING' | 'AFTERNOON' | 'EVENING'
            const getPeriod = (item: FriendGoingItem): Period => {
              const h = getStartHour(item)
              if (h < 12) return 'MORNING'
              if (h < 17) return 'AFTERNOON'
              return 'EVENING'
            }

            const sections: { title: Period; data: FriendGoingItem[] }[] = []
            for (const item of top5) {
              const period = getPeriod(item)
              const last = sections[sections.length - 1]
              if (last && last.title === period) {
                last.data.push(item)
              } else {
                sections.push({ title: period, data: [item] })
              }
            }

            return (
              <SectionList
                style={{ flex: 1 }}
                sections={sections}
                keyExtractor={(item) => String(item.sessionId)}
                stickySectionHeadersEnabled
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={playLoading || refreshing}
                    onRefresh={handleRefresh}
                    tintColor={T.amber}
                  />
                }
                renderSectionHeader={({ section }) => (
                  <View style={s.periodHeader}>
                    <View style={s.periodPill}>
                      <Text style={s.periodPillText}>{section.title}</Text>
                    </View>
                  </View>
                )}
                renderItem={({ item }) =>
                  signedIn ? (
                    <FriendGoingCard
                      item={item}
                      onFriendsPress={
                        item.friendCount > 0
                          ? () => openGoingFriends(item)
                          : undefined
                      }
                      onTopDuprPress={
                        item.topDupr && item.topDupr.length > 0
                          ? () => openTopDuprFromItem(item)
                          : undefined
                      }
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => openSignUp()}
                      activeOpacity={1}
                    >
                      <FriendGoingCard item={item} />
                    </TouchableOpacity>
                  )
                }
                ListEmptyComponent={
                  playLoading ? (
                    <SquaddLoader />
                  ) : (
                    <View style={s.emptyTop5}>
                      <Text style={s.emptyTop5Text}>
                        No sessions found · try changing the date
                      </Text>
                    </View>
                  )
                }
                ListFooterComponent={
                  !signedIn && top5.length > 0 ? (
                    <TouchableOpacity
                      style={s.signInBanner}
                      onPress={() => openSignUp()}
                      activeOpacity={0.85}
                    >
                      <Text style={s.signInBannerText}>
                        Sign in for personalised matches
                      </Text>
                    </TouchableOpacity>
                  ) : null
                }
              />
            )
          })()}
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
          {/* Today / Tomorrow — same pattern as Discover */}
          <View style={s.goingDateFilterRow}>
            {(['today', 'tomorrow'] as const).map((key) => {
              const on = goingTabFilter === key
              const count =
                key === 'today'
                  ? friendsGoingTodayUpcoming.length
                  : key === 'tomorrow'
                    ? friendsGoingTomorrowUpcoming.length
                    : shortlistItems.length
              const label =
                key === 'today' ? `Today (${count})` : key === 'tomorrow' ? `Tomorrow (${count})` : 'Saved'
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setGoingTabFilter(key)}
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

          <GearTeaserCard
            height={230}
            onPress={() => onOpenGearSheet?.()}
            gearSaved={gearSaved}
            gearSetupComplete={gearSetupComplete}
          />

          {goingLoading ? (
            <SquaddLoader />
          ) : (
            <>
              {currentUserGender === 'female' && (
                <View style={s.intentStrip}>
                  <View style={s.intentStripHeader}>
                    <View style={s.intentStripLeft}>
                      <Animated.View style={[s.intentDot, { opacity: pulseAnim }]} />
                      <Text style={s.intentStripTitle}>LOOKING TO PLAY</Text>
                    </View>
                    <View style={s.forWomenPill}>
                      <Text style={s.forWomenText}>For women only</Text>
                    </View>
                    {playIntents.length > 0 && (
                      <View style={s.intentCount}>
                        <Text style={s.intentCountText}>{playIntents.length + (myActiveIntent ? 1 : 0)} women</Text>
                      </View>
                    )}
                  </View>

                  {myActiveIntent && (
                    <View style={[s.intentRow, s.intentRowMe]}>
                      <Image
                        source={{ uri: imageUrl ?? undefined }}
                        style={s.intentAv}
                      />
                      <View style={s.intentInfo}>
                        <Text style={s.intentName}>{displayName ?? 'Me'} <Text style={s.intentMeTag}>· You</Text></Text>
                        <Text style={s.intentMeta}>
                          {capitalize(myActiveIntent.timeSlot)} · {myActiveIntent.date}
                        </Text>
                      </View>
                    </View>
                  )}

                  {(intentExpanded ? playIntents : playIntents.slice(0, 3)).map((intent) => (
                    <View key={intent.profileId} style={s.intentRow}>
                      <Image
                        source={{ uri: intent.imageUrl ?? undefined }}
                        style={s.intentAv}
                      />
                      <View style={s.intentInfo}>
                        <Text style={s.intentName}>{intent.displayName}</Text>
                        <Text style={s.intentMeta}>
                          {capitalize(intent.timeSlot)} · {intent.date}
                          {intent.distanceKm ? ` · ~${intent.distanceKm}km` : ''}
                        </Text>
                        {intent.zaloNumber && (
                          <TouchableOpacity
                            onPress={() =>
                              Linking.openURL(`zalo://chat?phone=${intent.zaloNumber}`)
                            }
                          >
                            <Text style={s.intentZalo}>Zalo: {intent.zaloNumber}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}

                  {playIntents.length > 3 && (
                    <TouchableOpacity
                      onPress={() => setIntentExpanded(!intentExpanded)}
                      style={s.intentExpandBtn}
                    >
                      <Text style={s.intentExpandText}>
                        {intentExpanded ? 'Show less' : `Show all ${playIntents.length} women`}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={s.intentAddBtn}
                    onPress={() => setIntentSheetOpen(true)}
                  >
                    <Text style={s.intentAddText}>
                      {myActiveIntent ? 'Update my availability' : "+ I'm looking to play"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {goingTabFilter !== 'saved' && friendsGoingForDay.length > 0 && (
                <>
                  <View style={s.goingSectionHeader}>
                    <Text style={s.goingSectionLabel}>
                      FRIENDS GOING{' '}
                      <Text style={s.goingSectionDay}>
                        {goingTabFilter === 'today' ? 'TODAY' : 'TOMORROW'}
                      </Text>
                    </Text>
                  </View>
                  {friendsGoingForDay.map((item) => (
                    <FriendGoingCard
                      key={item.sessionId}
                      item={item}
                      onFriendsPress={() => openGoingFriends(item)}
                      onTopDuprPress={
                        item.topDupr && item.topDupr.length > 0
                          ? () => openTopDuprFromItem(item)
                          : undefined
                      }
                    />
                  ))}
                </>
              )}

              {goingTabFilter !== 'saved' && friendsGoingForDay.length === 0 && (
                <View style={s.emptyFriends}>
                  <Text style={s.emptyFriendsIcon}>👥</Text>
                  <Text style={s.emptyFriendsTitle}>
                    {goingTabFilter === 'today'
                      ? 'No upcoming friends going today'
                      : 'No upcoming friends going tomorrow'}
                  </Text>
                  <Text style={s.emptyFriendsSub}>
                    Follow players in Circle to see where they play
                  </Text>
                </View>
              )}

              {goingTabFilter === 'saved' && shortlistItems.length > 0 && (
                <>
                  <View style={s.goingSectionHeader}>
                    <Text style={s.goingSectionLabel}>YOUR SAVED SESSIONS</Text>
                  </View>
                  {shortlistItems.map((session) => (
                    <Pressable
                      key={`saved-${session.id}`}
                      onPress={() => setExpandedSession(session)}
                      onLongPress={() => removeSavedSession(session.id)}
                      delayLongPress={450}
                    >
                      <FriendGoingCard
                        item={sessionToFriendGoingItem(session)}
                        onFriendsPress={
                          session.friendCount > 0
                            ? () => openSessionFriends(session)
                            : undefined
                        }
                        onTopDuprPress={() => openTopDupr(session)}
                      />
                    </Pressable>
                  ))}
                  <TouchableOpacity style={s.keepSwiping} onPress={() => setPlayTab('discover')}>
                    <Text style={s.keepSwipingText}>Keep swiping for more →</Text>
                  </TouchableOpacity>
                </>
              )}

            </>
          )}
        </ScrollView>
      )}

      <IntentSheet
        visible={intentSheetOpen}
        myActiveIntent={myActiveIntent}
        onClose={() => setIntentSheetOpen(false)}
        onSaved={(intent) => {
          setMyActiveIntent(intent)
          setIntentSheetOpen(false)
          loadGoing()
        }}
        onDeleted={() => {
          setMyActiveIntent(null)
          setIntentSheetOpen(false)
          setPlayIntents((prev) => prev)
          loadGoing()
        }}
      />

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
        onClose={() => {
          setFriendsModal((m) => ({ ...m, visible: false }))
          setRecommendations([])
        }}
        title={friendsModal.title}
        subtitle={friendsModal.subtitle}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
        onFollow={friendsModal.showFollow ? handleFollowFromTopDupr : undefined}
        onAvatarPress={(userId) => setProfilePlayerId(userId)}
        recommendations={friendsModal.showFollow ? recommendations : undefined}
        onFollowRecommended={async (userId) => {
          await handleFollowFromTopDupr(userId)
          setRecommendations((prev) => prev.filter((r) => r.player.userId !== userId))
        }}
        onRecommendedAvatarPress={(userId) => setProfilePlayerId(userId)}
      />

      <SwipeFilterSheet
        visible={top5FilterVisible}
        onClose={() => setTop5FilterVisible(false)}
        locationRef={locationRef}
        filterOpenKey={top5FilterKey}
        vibeFilter={top5VibeFilter}
        setVibeFilter={setTop5VibeFilter}
        spotsOnly={top5SpotsOnly}
        setSpotsOnly={setTop5SpotsOnly}
        hideSections={{ maxDistance: true, vibe: true, spotsOnly: true }}
        slotStats={slotStats}
        onApplyCustom={async (filters) => {
          await loadPlayData(filters)
        }}
      />

      <LocationPermissionPopup
        visible={showLocationPopup}
        onClose={() => setShowLocationPopup(false)}
      />

      <PlayerProfileSheet
        userId={profilePlayerId}
        onClose={() => setProfilePlayerId(null)}
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
    borderRadius: 10,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#1e1e1e',
  },
  tabText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '400',
  },
  tabTextActive: {
    fontSize: 13,
    color: '#f5a623',
    fontWeight: '600',
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
  goingDateFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: 'center',
  },
  top5DateRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    alignItems: 'center',
  },
  emptyTop5: {
    padding: 32,
    alignItems: 'center',
  },
  emptyTop5Text: {
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
  },
  periodHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: T.bg,
  },
  periodPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  periodPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22c55e',
    letterSpacing: 1,
  },
  signInBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.4)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  signInBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: T.amber,
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
  goingSectionDay: {
    color: T.amber,
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
  intentStrip: {
    backgroundColor: '#0d1a0d',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    marginHorizontal: 12,
  },
  intentStripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  intentStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  intentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1D9E75',
  },
  intentStripTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D9E75',
    letterSpacing: 0.8,
  },
  intentCount: {
    backgroundColor: '#0a2a0a',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  intentCountText: {
    fontSize: 11,
    color: '#1D9E75',
  },
  forWomenPill: {
    backgroundColor: '#2a0a2a',
    borderWidth: 1,
    borderColor: '#e040a0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  forWomenText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e040a0',
  },
  intentRowMe: {
    backgroundColor: '#0a2a0a',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 10,
  },
  intentMeTag: {
    fontSize: 11,
    color: '#1D9E75',
    fontWeight: '600',
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#122012',
  },
  intentAv: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#1D9E75',
    backgroundColor: '#1a2a1a',
  },
  intentInfo: { flex: 1 },
  intentName: { fontSize: 14, fontWeight: '600', color: '#fff' },
  intentMeta: { fontSize: 11, color: '#666', marginTop: 1 },
  intentZalo: {
    fontSize: 11,
    color: '#1D9E75',
    fontWeight: '500',
    marginTop: 3,
  },
  intentExpandBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  intentExpandText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D9E75',
  },
  intentAddBtn: {
    marginTop: 12,
    borderWidth: 0.5,
    borderStyle: 'dashed',
    borderColor: '#1D9E75',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  intentAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D9E75',
  },
})

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getRecommendations(
  rosterPlayers: FriendListItem[],
  currentUser: { profileId: string; duprDoubles: number | null },
  followingIds: Set<string>,
  sessionOverlapCounts: Map<string, number>,
  mutualFollowCounts: Map<string, number>,
): RecommendedPlayer[] {
  return rosterPlayers
    .filter((p) => !followingIds.has(p.userId))
    .filter((p) => p.userId !== currentUser.profileId)
    .map((p) => {
      let score = 0
      let reason = ''
      let reasonType: 'overlap' | 'level' | 'social' = 'social'

      const overlap = sessionOverlapCounts.get(p.userId) ?? 0
      const mutual = mutualFollowCounts.get(p.userId) ?? 0
      const duprDiff =
        currentUser.duprDoubles != null && p.duprDoubles != null
          ? Math.abs(currentUser.duprDoubles - p.duprDoubles)
          : null

      if (overlap >= 2) {
        score = 100 + overlap
        reason = `🏓 You've been at the same session ${overlap} times`
        reasonType = 'overlap'
      } else if (duprDiff !== null && duprDiff <= 0.4) {
        score = 80
        reason = `⚡ Similar level · ${p.duprDoubles!.toFixed(1)} DUPR`
        reasonType = 'level'
      } else if (mutual >= 2) {
        score = 60
        reason = `👥 Followed by ${mutual} people you follow`
        reasonType = 'social'
      }

      return { player: p, score, reason, reasonType }
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}
