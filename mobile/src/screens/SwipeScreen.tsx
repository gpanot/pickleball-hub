import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Linking,
  Pressable,
} from 'react-native'
import { RefreshCw, Bookmark, ChevronRight } from 'lucide-react-native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { T } from '../theme'
import { type Session, averageDupr, isSessionStarted } from '../data'
import { TopBar, CardBody, CARD_HEIGHT } from '../components/CardBody'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { GearTeaserCard } from '../components/GearTeaserCard'
import { SignInPrompt } from '../components/SignInPrompt'
import { useAuthStore, resolveApiBase } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import { type SwipeDateFilter, type TimeSlotKey } from '../stores/uiStore'
import { FilterPill, SwipeFilterSheet } from '../components/SwipeFilterControls'
import { FriendsListModal } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'
import {
  FriendGoingCard,
  sessionToFriendGoingItem,
} from '../components/FriendGoingCard'
import type { FriendGoingItem } from '../components/FriendGoingCard'

type GoingTabFilter = SwipeDateFilter | 'saved'

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
  friendCount: number
  friends: FriendGoingItem['friends']
  topDupr: FriendGoingItem['topDupr']
  totalRoster: number
  duprCount?: number
}

function playCardToFriendGoingItem(c: PlayApiCard): FriendGoingItem {
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
    distanceKm: c.distanceKm,
    friendCount: c.friendCount,
    friends: c.friends,
    topDupr: c.topDupr,
    totalRoster: c.totalRoster,
    duprCount,
  }
}
import { debugLog } from '../lib/debug'

const { height: H } = Dimensions.get('window')

const HCMC_LAT = 10.78
const HCMC_LNG = 106.69

/* ── SwipeScreen (main export) ───────────────────────────────── */
export function SwipeScreen({
  onOpenGearSheet,
  gearSaved,
  gearSetupComplete,
  onOpenExplore,
}: {
  onOpenGearSheet?: () => void
  gearSaved?: boolean
  gearSetupComplete?: boolean
  onOpenExplore?: () => void
}) {
  const { openSignUp } = useSignUpModal()
  const signedIn = useAuthStore((s) => s.isSignedIn)()
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
  const [top5FilterVisible, setTop5FilterVisible] = useState(false)
  const [top5FilterKey, setTop5FilterKey] = useState(0)
  const [top5VibeFilter, setTop5VibeFilter] = useState<'social' | 'competitive' | null>(null)
  const [top5SpotsOnly, setTop5SpotsOnly] = useState(false)

  const auth = useAuthStore.getState()

  const playDataLoadedRef = useRef(false)

  const loadPlayData = useCallback(async (filterOverrides?: { duprMin: number; timeSlots: TimeSlotKey[] }) => {
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

      const res = signedIn
        ? await auth.authedFetch(`/api/play?${qs}`)
        : await fetch(`${resolveApiBase()}/api/play?${qs}`)
      if (!res.ok) {
        debugLog('Play', `loadPlayData /api/play returned ${res.status}`)
        return
      }
      const data = await res.json()

      const mapCards = (cards: PlayApiCard[]) =>
        (cards ?? []).map(playCardToFriendGoingItem)

      setTop5(mapCards(data.top5))
    } finally {
      setPlayLoading(false)
    }
  }, [auth, signedIn, top5DateFilter])

  const loadGoing = useCallback(async () => {
    setGoingLoading(true)
    try {
      const { lat, lng } = locationRef.current
      const locQs = `&lat=${lat}&lng=${lng}`
      const [todayRes, tomorrowRes] = await Promise.all([
        auth.authedFetch(`/api/feed/friends-going?filter=today${locQs}`),
        auth.authedFetch(`/api/feed/friends-going?filter=tomorrow${locQs}`),
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
    (
      topPlayers: Array<{
        userId: string
        displayName: string | null
        imageUrl: string | null
        duprDoubles: number | null
        isFollowing?: boolean
      }>,
      duprCount: number,
      totalRoster: number,
    ) => {
      if (!signedIn || topPlayers.length === 0) return
      const avg = averageDupr(topPlayers)
      const title =
        avg != null
          ? `Top 8 DUPR joining - Avge. ${avg.toFixed(2)}`
          : 'Top 8 DUPR joining'

      const duprPct =
        totalRoster > 0 ? Math.round((duprCount / totalRoster) * 100) : null
      const subtitle =
        duprPct != null
          ? `${duprPct}% of the players have a DUPR rating`
          : undefined

      setFriendsModal({
        visible: true,
        title,
        subtitle,
        showFollow: true,
        friends: topPlayers.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          imageUrl: p.imageUrl,
          duprDoubles: p.duprDoubles,
          isFollowing: p.isFollowing ?? false,
        })),
      })
    },
    [signedIn],
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
      openTopDuprModal(topPlayers, duprCount, session.roster.length)
    },
    [openTopDuprModal],
  )

  const openTopDuprFromItem = useCallback(
    (item: FriendGoingItem) => {
      if (!item.topDupr?.length) return
      const dc = item.duprCount ?? item.topDupr.filter(
        (p) => p.duprDoubles != null && p.duprDoubles > 0,
      ).length
      openTopDuprModal(item.topDupr, dc, item.totalRoster)
    },
    [openTopDuprModal],
  )

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

  // Boot: resolve location, load saved IDs, then do the initial data fetch.
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
      playDataLoadedRef.current = true
      await loadPlayData()
    })()
  }, [])

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
        title="Where to play?"
        counter={undefined}
      />

      {/* Sub-tab switcher */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, playTab === 'discover' && s.tabActive]}
          onPress={() => setPlayTab('discover')}
        >
          <Text style={[s.tabText, playTab === 'discover' && s.tabTextActive]}>
            TOP 5
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, playTab === 'shortlist' && s.tabActive]}
          onPress={() => setPlayTab('shortlist')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[s.tabText, playTab === 'shortlist' && s.tabTextActive]}>
              FRIENDS
            </Text>
            {shortlistCount > 0 && (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeText}>{shortlistCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
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

          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={playLoading || refreshing}
                onRefresh={handleRefresh}
                tintColor={T.amber}
              />
            }
          >
            {playLoading && top5.length === 0 && (
              <ActivityIndicator color={T.amber} style={{ marginTop: 40 }} />
            )}

            {top5.length === 0 && !playLoading && (
              <View style={s.emptyTop5}>
                <Text style={s.emptyTop5Text}>
                  No sessions found · try changing the date
                </Text>
              </View>
            )}

            {top5.map((item, index) =>
              signedIn ? (
                <FriendGoingCard
                  key={item.sessionId}
                  item={item}
                  isTop={index === 0}
                  dimLevel={index}
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
                  key={item.sessionId}
                  onPress={() => openSignUp()}
                  activeOpacity={1}
                >
                  <FriendGoingCard
                    item={item}
                    isTop={index === 0}
                    dimLevel={index}
                  />
                </TouchableOpacity>
              ),
            )}

            {!signedIn && top5.length > 0 && (
              <TouchableOpacity
                style={s.signInBanner}
                onPress={() => openSignUp()}
                activeOpacity={0.85}
              >
                <Text style={s.signInBannerText}>
                  Sign in for personalised matches
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={s.exploreBtn}
              onPress={() => onOpenExplore?.()}
              activeOpacity={0.85}
            >
              <Text style={s.exploreBtnText}>
                {signedIn ? 'Explore more sessions' : 'Browse all sessions'}
              </Text>
              <ChevronRight size={18} color={T.amber} strokeWidth={2.5} />
            </TouchableOpacity>
          </ScrollView>
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
            {(['today', 'tomorrow', 'saved'] as const).map((key) => {
              const on = goingTabFilter === key
              const count =
                key === 'today'
                  ? friendsGoingTodayUpcoming.length
                  : key === 'tomorrow'
                    ? friendsGoingTomorrowUpcoming.length
                    : shortlistItems.length
              const label =
                key === 'today' ? 'Today' : key === 'tomorrow' ? 'Tomorrow' : 'Saved'
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
                    {label} ({count})
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
            <ActivityIndicator color={T.amber} style={{ marginTop: 40 }} />
          ) : (
            <>
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

              {goingTabFilter === 'saved' && shortlistItems.length === 0 && (
                <View style={s.emptyShortlist}>
                  <Bookmark size={44} color="#1e1e1e" />
                  <Text style={s.emptyShortlistText}>
                    Swipe sessions in TOP 5 to save them here
                  </Text>
                  <Text style={s.emptyFriendsSub}>
                    Press and hold a saved card to remove it
                  </Text>
                  <TouchableOpacity
                    style={s.emptyShortlistBtn}
                    onPress={() => setPlayTab('discover')}
                  >
                    <Text style={s.emptyShortlistBtnText}>Start swiping</Text>
                  </TouchableOpacity>
                </View>
              )}

              {goingTabFilter !== 'saved' &&
                friendsGoingForDay.length === 0 &&
                shortlistItems.length === 0 && (
                <View style={s.emptyShortlist}>
                  <Bookmark size={44} color="#1e1e1e" />
                  <Text style={s.emptyShortlistText}>
                    Swipe sessions in TOP 5 to save them here
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
        subtitle={friendsModal.subtitle}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
        onFollow={friendsModal.showFollow ? handleFollowFromTopDupr : undefined}
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
        onApplyCustom={async (filters) => {
          await loadPlayData(filters)
        }}
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
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 28,
    backgroundColor: 'rgba(245,166,35,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.5)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: T.amber,
    letterSpacing: 0.2,
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
})
