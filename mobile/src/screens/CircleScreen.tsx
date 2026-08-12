import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Linking,
  useWindowDimensions,
  Image,
  Pressable,
  Dimensions,
  Share,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { debugLog } from '../lib/debug'
import { Users, Search, ArrowLeft, Sparkles, X } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ScreenTopBar } from '../components/ScreenTopBar'
import { GradientTabRow } from '../components/GradientTabRow'
import { SquaddLoader } from '../components/SquaddLoader'
import { useGlassTheme } from '../glassTheme'
import type { GlassThemeColors } from '../glassTheme'
import { useAuthStore, resolveApiBase } from '../stores/authStore'
import { SignInPrompt } from '../components/SignInPrompt'
import { GearTeaserCard } from '../components/GearTeaserCard'
import { PlayerSearch } from '../components/PlayerSearch'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { FriendListRow } from '../components/FriendListRow'
import { FeedItemRow } from '../components/FeedItemRow'
import { PresenceCard } from '../components/PresenceCard'
import { PlayerProfileSheet } from '../components/PlayerProfileSheet'
import { useToast } from '../components/Toast'
import { useNavBarHeight } from '../components/NavBar'
import { PeopleYouMayKnowScreen } from './PeopleYouMayKnowScreen'
import type { FeedItem, FeedItemType, CoPlayerSuggestion } from '../data'
import { useUiStore } from '../stores/uiStore'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { NotificationPermissionSheet } from '../components/NotificationPermissionSheet'
import { ActivityScreen } from './ActivityScreen'
import { GearViewSheet } from '../components/gear/GearViewSheet'
import { SignInSaveCta } from '../components/SignInSaveCta'
import { QrShareScreen } from '../components/QrShareScreen'
import { ClubsTab } from '../modules/clubs/components/ClubsTab'
import { ClubProfileScreen } from '../modules/clubs/screens/ClubProfileScreen'

type CircleSubTab = 'feed' | 'players' | 'clubs'

type FollowedPlayer = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  followedAt: string
}

type WeeklyRecapData = {
  weekOf: string
  sessionsPlayed: number
  uniqueCoPlayers: number
  kudosReceived: number
  clubsVisited: number
  topClub: string | null
  mostImproved: { displayName: string | null; improvement: number } | null
}

/** Persist dismiss so the weekly recap card does not reappear after app restart. */
function weeklyRecapDismissKey(weekOf: string) {
  return `weeklyRecapDismissed:${weekOf}`
}

const SUGGESTION_SKELETON_COUNT = 4

function SuggestionCardSkeleton() {
  const T = useGlassTheme()
  const styles = useMemo(() => createStyles(T), [T])
  return (
    <View style={styles.suggestionSkeletonCard}>
      <View style={styles.suggestionSkeletonAvatar} />
      <View style={styles.suggestionSkeletonName} />
      <View style={styles.suggestionSkeletonSessions} />
      <View style={styles.suggestionSkeletonBtn} />
    </View>
  )
}

function formatTime(iso: string): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '–'
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${ampm}`
}

// formatClock parses "HH:mm" strings returned by the presence API
function formatClock(clock: string): string {
  if (!clock) return '–'
  const [hStr, mStr] = clock.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr ?? '0', 10)
  if (isNaN(h)) return '–'
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${ampm}`
}

export interface CircleScreenHandle {
  openPlayersTab: () => void;
  openClubsTab: () => void;
  reset: () => void;
  /** Open a PlayerProfileSheet for the given PlayerProfile UUID (from /u/{profileId} deep link). */
  openProfileByProfileId: (profileId: string) => void;
}


const CIRCLE_TABS = [
  { key: 'feed' as const, label: 'My Feed' },
  { key: 'players' as const, label: 'Players' },
  { key: 'clubs' as const, label: 'Clubs' },
] as const

interface CircleScreenProps {
  onOpenGear?: () => void
  gearSaved?: boolean
  gearSetupComplete?: boolean
  onStartGuestReclub?: () => void
  onGuestReclubComplete?: (reclubUserId: string) => void
  onLinkReclub?: () => void
  onSignIn?: () => void
  onActivityChange?: (open: boolean) => void
  onClubOverlayChange?: (open: boolean) => void
  onNavScroll?: (scrollingDown: boolean) => void
}

export const CircleScreen = React.forwardRef(
function CircleScreenInner({ onOpenGear, gearSaved, gearSetupComplete, onStartGuestReclub, onGuestReclubComplete, onLinkReclub, onSignIn, onActivityChange, onClubOverlayChange, onNavScroll }: CircleScreenProps, ref: React.Ref<CircleScreenHandle>) {
  const T = useGlassTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('circle')
  const navBarHeight = useNavBarHeight()
  const [subTab, setSubTab] = useState<CircleSubTab>('feed')
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null)

  // Scroll-driven nav bar tracking
  const lastScrollY = useRef(0)
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e.nativeEvent.contentOffset.y
    const dy = y - lastScrollY.current
    lastScrollY.current = y
    if (Math.abs(dy) > 4) {
      onNavScroll?.(dy > 0)
    }
  }, [onNavScroll])

  const loadFriendsRef = useRef<() => void>(() => {})

  React.useImperativeHandle(ref, () => ({
    openPlayersTab: () => setSubTab('players'),
    openClubsTab: () => setSubTab('clubs'),
    reset: () => {
      setSubTab('feed')
      setFeedItems([])
      setFeedLoading(false)
      setFeedRefreshing(false)
      setHasFollows(true)
      setHasMore(false)
      setLoadingMore(false)
      setSuggestions([])
      setFollowedSuggestionIds(new Set())
      setDismissedSuggestions(new Set())
      setPresence(null)
      setPresenceExpanded(false)
      setFriends([])
      setWeeklyRecap(null)
      feedLoadedRef.current = false
      recapLoadedRef.current = false
    },
    openProfileByProfileId: async (targetProfileId: string) => {
      // Scan QR = intent to follow. Resolve reclubUserId from public API,
      // auto-follow them, then open profile sheet to confirm.
      try {
        const res = await fetch(`${resolveApiBase()}/api/players/${targetProfileId}/public`)
        if (!res.ok) return
        const data = (await res.json()) as { reclubUserId: string | null; nickname: string }
        if (!data.reclubUserId) return
        const reclubId = data.reclubUserId

        // Auto-follow (fire-and-forget — sheet opens regardless)
        const { authedFetch: af } = useAuthStore.getState()
        af('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: reclubId }),
        }).then(r => {
          if (r.ok) {
            setFollowingSet(prev => new Set([...prev, reclubId]))
            friendsLoadedRef.current = false
            loadFriendsRef.current()
          }
        }).catch(() => {})

        // Open profile sheet
        setSelectedPlayerId(reclubId)
      } catch {}
    },
  }));
  const [friends, setFriends] = useState<FollowedPlayer[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedPlayerStub, setSelectedPlayerStub] = useState<import('../components/PlayerProfileSheet').PlayerProfileStub | null>(null)

  const [gearViewTarget, setGearViewTarget] = useState<{ userId: string; name: string } | null>(null)

  const feedLoadedRef = useRef(false)
  const localFeedItemIds = useRef<Set<string>>(new Set())
  const friendsLoadedRef = useRef(false)

  // Stable refs for async load functions — keep effects' dep arrays minimal so
  // navigating between tabs does not re-trigger fetches.
  const loadFeedRef = useRef<() => Promise<void>>(async () => {})
  const loadRecapRef = useRef<() => Promise<void>>(async () => {})
  const loadPresenceRef = useRef<() => Promise<void>>(async () => {})
  const loadSuggestionsRef = useRef<() => Promise<void>>(async () => {})
  // Whether the presence interval has been started at least once (prevents
  // restarting it on every tab-switch back to the feed).
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const suggestionsLoadedRef = useRef(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSuggested, setShowSuggested] = useState(false)

  // Roster modal (for "you are playing" feed item)
  type RosterPlayer = {
    userId: string
    displayName: string
    imageUrl: string | null
    duprDoubles: number | null
    isHost: boolean
    isFollowing: boolean
  }
  const [rosterModal, setRosterModal] = useState<{
    visible: boolean
    sessionName: string
    venueName: string
    players: RosterPlayer[]
    loadingId: number | null
  }>({ visible: false, sessionName: '', venueName: '', players: [], loadingId: null })
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())
  const [showQrShare, setShowQrShare] = useState(false)
  const [rosterRecommendations, setRosterRecommendations] = useState<{
    player: RosterPlayer
    score: number
    reason: string
    reasonType: 'overlap' | 'level' | 'social'
  }[]>([])

  const { authedFetch, jwt, ensureServerAuth, reclubUserId } = useAuthStore()
  const toast = useToast((s) => s.show)
  const { openSignUp } = useSignUpModal()
  const { width: screenWidth } = useWindowDimensions()
  const pendingNewFollower = useUiStore((s) => s.pendingNewFollower)
  const clearPendingNewFollower = useUiStore((s) => s.setPendingNewFollower)
  const backgroundRefreshTrigger = useUiStore((s) => s.backgroundRefreshTrigger)
  const unlinkReclubTrigger = useUiStore((s) => s.unlinkReclubTrigger)
  const linkReclubTrigger = useUiStore((s) => s.linkReclubTrigger)
  const guestReclubUserId = useUiStore((s) => s.guestReclubUserId)
  const guestPendingFollows = useUiStore((s) => s.guestPendingFollows)
  const addGuestPendingFollow = useUiStore((s) => s.addGuestPendingFollow)
  const removeGuestPendingFollow = useUiStore((s) => s.removeGuestPendingFollow)
  /** True while the user has gone through "Link to Reclub" but not yet signed up. */
  const isGuestMode = !jwt && !!guestReclubUserId
  /** Effective Reclub user ID — uses authed value when signed in, guest value otherwise. */
  const effectiveReclubUserId = reclubUserId ?? guestReclubUserId

  // ── Feed state ──────────────────────────────────────────────────────────────
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [hasFollows, setHasFollows] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [suggestions, setSuggestions] = useState<CoPlayerSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [followedSuggestionIds, setFollowedSuggestionIds] = useState<Set<string>>(new Set())
  const [presence, setPresence] = useState<{
    liveVenues: any[]
    totalLive: number
    upcomingVenues: any[]
  } | null>(null)
  const [presenceExpanded, setPresenceExpanded] = useState(false)
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecapData | null>(null)
  const recapLoadedRef = useRef(false)
  const [expandedUpcomingId, setExpandedUpcomingId] = useState<number | null>(null)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set()
  )
  const [showAvatarTip, setShowAvatarTip] = useState(false)
  const [showKudosTip, setShowKudosTip] = useState(false)
  const [showNotifSheet, setShowNotifSheet] = useState(false)
  const [showActivity, setShowActivity] = useState(false)
  const [playersRefreshing, setPlayersRefreshing] = useState(false)

  const handlePlayersRefresh = useCallback(async () => {
    setPlayersRefreshing(true)
    friendsLoadedRef.current = false
    suggestionsLoadedRef.current = false
    await Promise.all([loadFriends(), loadSuggestions()])
    setPlayersRefreshing(false)
  }, [loadFriends, loadSuggestions])

  useEffect(() => {
    if (feedItems.length > 0 && !showAvatarTip) {
      AsyncStorage.getItem('hasSeenAvatarTip').then((val) => {
        if (!val) setShowAvatarTip(true)
      })
    }
  }, [feedItems.length])

  useEffect(() => {
    if (feedItems.length > 0 && !showKudosTip) {
      AsyncStorage.getItem('hasSeenKudosTip').then((val) => {
        if (!val) setShowKudosTip(true)
      })
    }
  }, [feedItems.length])

  // Mark that the user has seen the feed (used by location permission logic)
  useEffect(() => {
    if (jwt) {
      AsyncStorage.setItem('squadd_has_seen_feed', '1')
    }
  }, [jwt])

  // Auto-refresh when returning from background after 30+ minutes
  useEffect(() => {
    if (backgroundRefreshTrigger === 0) return
    if (!jwt) return
    debugLog('CircleScreen', 'Background refresh triggered — reloading feed + presence')
    feedLoadedRef.current = false
    loadFeed()
    loadPresence()
  }, [backgroundRefreshTrigger])

  // Clear feed and followed players list when user unlinks their Reclub account,
  // then immediately reload from server to confirm the empty state persists across restarts.
  useEffect(() => {
    if (unlinkReclubTrigger === 0) return
    setFeedItems([])
    setFriends([])
    setHasFollows(false)
    setHasMore(false)
    feedLoadedRef.current = true   // mark loaded so auto-load effect doesn't double-fire
    friendsLoadedRef.current = true
    suggestionsLoadedRef.current = true
    // Reload from server — this confirms follows+feedItems are deleted and returns hasFollows:false
    if (jwt) {
      void loadFeed()
      void loadFriends()
    }
  }, [unlinkReclubTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch feed and players immediately after the user links their Reclub account.
  useEffect(() => {
    if (linkReclubTrigger === 0) return
    if (!jwt) return
    feedLoadedRef.current = false
    friendsLoadedRef.current = false
    suggestionsLoadedRef.current = false
    void loadFeed()
    void loadFriends()
    void loadSuggestions()
  }, [linkReclubTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show notification permission sheet once after onboarding
  useEffect(() => {
    if (!jwt) return
    console.log('[FREEZE_DEBUG] notif sheet check — jwt present')
    AsyncStorage.getItem('squadd_notif_permission_asked').then((val) => {
      console.log('[FREEZE_DEBUG] notif sheet check — key:', val)
      if (!val) {
        console.log('[FREEZE_DEBUG] notif sheet — scheduling show in 3000ms')
        setTimeout(() => {
          console.log('[FREEZE_DEBUG] notif sheet — setShowNotifSheet(true)')
          setShowNotifSheet(true)
        }, 3000)
      }
    })
  }, [jwt])

  // When a pn4 notification is tapped, prepend a new_follower feed item
  useEffect(() => {
    if (!pendingNewFollower) return
    const newItem: FeedItem = {
      id: `new_follower_${pendingNewFollower.userId}_${Date.now()}`,
      type: 'new_follower' as FeedItemType,
      player: {
        userId: pendingNewFollower.userId,
        displayName: pendingNewFollower.displayName,
        imageUrl: pendingNewFollower.imageUrl,
        duprDoubles: null,
      },
      isFollowing: false,
      timestamp: new Date().toISOString(),
    }
    setFeedItems((prev) => [newItem, ...prev])
    clearPendingNewFollower(null)
  }, [pendingNewFollower])

  const dismissAvatarTip = useCallback(async () => {
    setShowAvatarTip(false)
    await AsyncStorage.setItem('hasSeenAvatarTip', 'true')
  }, [])

  const dismissKudosTip = useCallback(async () => {
    setShowKudosTip(false)
    await AsyncStorage.setItem('hasSeenKudosTip', 'true')
  }, [])

  const handleShowRoster = useCallback(async (sessionId: number) => {
    setRosterModal(prev => ({ ...prev, visible: true, loadingId: sessionId, players: [], sessionName: '', venueName: '' }))
    setRosterRecommendations([])
    try {
      const res = await authedFetch(`/api/sessions/${sessionId}/roster`)
      if (res.ok) {
        const data = await res.json()
        debugLog('ROSTER', `session=${sessionId} "${data.sessionName}" club="${data.venueName}" players=${data.players?.length ?? 0}`)
        ;(data.players as { userId: string; displayName: string; duprDoubles: number | null; isHost: boolean }[] ?? [])
          .forEach((p, i) => debugLog('ROSTER', `  #${i + 1} uid=${p.userId} "${p.displayName}" dupr=${p.duprDoubles ?? '-'} host=${p.isHost}`))
        setRosterModal({ visible: true, sessionName: data.sessionName, venueName: data.venueName, players: data.players, loadingId: null })
        const followed = new Set<string>((data.players as { userId: string; isFollowing: boolean }[])
          .filter(p => p.isFollowing).map(p => p.userId))
        setFollowingSet(followed)

        // Compute recommendations
        try {
          const currentAuth = useAuthStore.getState()
          const profileId = currentAuth.profileId ?? ''
          const duprDoubles = currentAuth.duprRating

          const overlapRes = await authedFetch(
            `/api/sessions/overlap?sessionId=${sessionId}`
          )
          const overlapData = overlapRes.ok ? await overlapRes.json() : { overlaps: [] }
          const sessionOverlapCounts = new Map<string, number>(
            (overlapData.overlaps ?? []).map((o: { userId: string; count: number }) => [o.userId, o.count])
          )

          const recs = (data.players as RosterPlayer[])
            .filter(p => !followed.has(p.userId) && p.userId !== profileId)
            .map(p => {
              let score = 0
              let reason = ''
              let reasonType: 'overlap' | 'level' | 'social' = 'social'
              const overlap = sessionOverlapCounts.get(p.userId) ?? 0
              const duprDiff = duprDoubles != null && p.duprDoubles != null
                ? Math.abs(duprDoubles - p.duprDoubles) : null

              if (overlap >= 2) {
                score = 100 + overlap
                reason = `🏓 Same session ${overlap} times`
                reasonType = 'overlap'
              } else if (duprDiff !== null && duprDiff <= 0.4) {
                score = 80
                reason = `⚡ Similar level · ${p.duprDoubles!.toFixed(1)} DUPR`
                reasonType = 'level'
              }
              return { player: p, score, reason, reasonType }
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)

          setRosterRecommendations(recs)
        } catch (e) {
          debugLog('ROSTER', `recommendations error: ${e}`)
        }
      } else {
        debugLog('ROSTER', `session=${sessionId} → HTTP ${res.status}`)
      }
    } catch (e) {
      debugLog('ROSTER', `session=${sessionId} → error: ${e}`)
      setRosterModal(prev => ({ ...prev, loadingId: null }))
    }
  }, [authedFetch])

  const handleFollowFromRoster = useCallback(async (userId: string) => {
    try {
      const res = await authedFetch('/api/follows', {
        method: 'POST',
        body: JSON.stringify({ followeeId: userId }),
      })
      if (!res.ok) throw new Error('Follow failed')
      setFollowingSet(prev => new Set([...prev, userId]))
      const player = rosterModal.players.find(p => p.userId === userId)
      prependJustFollowedFeedItem(
        userId,
        player?.displayName ?? null,
        player?.imageUrl ?? null,
        player?.duprDoubles ?? null,
      )
      toast('Followed!', 'success')
      friendsLoadedRef.current = false
      loadFriends()
    } catch {
      toast('Failed to follow. Try again.', 'error')
    }
  }, [authedFetch, toast, loadFriends, prependJustFollowedFeedItem, rosterModal.players])

  const loadFeed = useCallback(async () => {
    if (!jwt) return
    console.log('[FREEZE_DEBUG] loadFeed — start')
    await ensureServerAuth()
    console.log('[FREEZE_DEBUG] loadFeed — ensureServerAuth done')
    setFeedLoading(true)
    console.log('[FREEZE_DEBUG] loadFeed — setFeedLoading(true) called')
    try {
      const res = await authedFetch('/api/feed')
      console.log('[FREEZE_DEBUG] loadFeed — fetch done, status:', res.status)
      if (res.ok) {
        const data = await res.json()
        console.log('[FREEZE_DEBUG] feed data received, items:', data.items?.length)
        setFeedItems((prev) => {
          const apiItems: FeedItem[] = data.items ?? []
          const apiPlayerIds = new Set(apiItems.map((i) => i.player.userId))

          const localOnlyItems = prev.filter(
            (item) =>
              (item.type === 'just_followed' || item.type === 'new_follower') &&
              !apiPlayerIds.has(item.player.userId)
          )

          apiItems.forEach((item) => {
            if (item.type === 'just_followed') {
              localFeedItemIds.current.delete(item.player.userId)
            }
          })

          const deduped = [...localOnlyItems, ...apiItems].filter(
            (item, index, arr) =>
              arr.findIndex(
                (other) =>
                  other.player.userId === item.player.userId &&
                  other.type === item.type
              ) === index
          )

          // Keep strictly newest-first so local follow items don't break API sort order
          deduped.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          )

          console.log('[FREEZE_DEBUG] merge complete, finalItems:', deduped.length)
          return deduped
        })
        console.log('[FREEZE_DEBUG] setFeedItems called')
        setHasFollows(data.hasFollows ?? true)
        console.log('[FREEZE_DEBUG] setHasFollows called')
        setHasMore(data.hasMore ?? false)
        console.log('[FREEZE_DEBUG] setHasMore called')
      }
    } catch (e) {
      if (__DEV__) console.warn('[Feed] loadFeed', e)
    } finally {
      setFeedLoading(false)
      console.log('[FREEZE_DEBUG] loadFeed — setFeedLoading(false) called — done')
    }
  }, [authedFetch, jwt, ensureServerAuth])

  // Keep ref in sync so effects can call latest version without being in deps
  useEffect(() => { loadFeedRef.current = loadFeed }, [loadFeed])
    if (loadingMore || !hasMore || feedItems.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = feedItems[feedItems.length - 1]
      const res = await authedFetch(
        `/api/feed?before=${encodeURIComponent(oldest.timestamp)}`
      )
      if (!res.ok) return
      const data = await res.json()
      const newItems = (data.items ?? []) as FeedItem[]
      setFeedItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id))
        const deduped = newItems.filter((i) => !existingIds.has(i.id))
        return [...prev, ...deduped]
      })
      setHasMore(data.hasMore ?? false)
    } catch (e) {
      if (__DEV__) console.warn('[Feed] loadMore', e)
    } finally {
      setLoadingMore(false)
    }
  }, [feedItems, hasMore, loadingMore, authedFetch])

  const loadSuggestions = useCallback(async () => {
    if (!effectiveReclubUserId) return
    const t0 = Date.now()
    console.log('[TheHub][PERF[PLAYERS]] ⏱ loadSuggestions started')
    setSuggestionsLoading(true)
    try {
      const tFetch = Date.now()
      const url = `/api/players/${effectiveReclubUserId}/co-players`
      const res = jwt
        ? await authedFetch(url)
        : await fetch(`${resolveApiBase()}${url}`)
      console.log(`[TheHub][PERF[PLAYERS]] ⏱ /api/players/co-players network: ${Date.now() - tFetch}ms → HTTP ${res.status}`)
      if (res.ok) {
        const tParse = Date.now()
        const data = await res.json()
        const count = (data.coPlayers ?? []).length
        console.log(`[TheHub][PERF[PLAYERS]] ⏱ JSON parse: ${Date.now() - tParse}ms — suggestions=${count}`)
        setSuggestions(
          (data.coPlayers ?? []).slice(0, 8).map((p: any) => ({
            ...p,
            venueName: 'a nearby club',
          }))
        )
        console.log(`[TheHub][PERF[PLAYERS]] ⏱ TOTAL loadSuggestions: ${Date.now() - t0}ms ✅`)
      }
    } catch (e) {
      console.warn('[TheHub][PERF[PLAYERS]] loadSuggestions error', e)
    } finally {
      setSuggestionsLoading(false)
    }
  }, [authedFetch, effectiveReclubUserId, jwt])

  useEffect(() => { loadSuggestionsRef.current = loadSuggestions }, [loadSuggestions])

  const loadPresence = useCallback(async () => {
    if (!jwt) return
    console.log('[FREEZE_DEBUG] loadPresence — start')
    try {
      const res = await authedFetch('/api/feed/presence')
      const data = await res.json()
      console.log('[FREEZE_DEBUG] loadPresence — data received, setting state')
      setPresence(data)
      console.log('[FREEZE_DEBUG] loadPresence — setPresence called')
    } catch {}
  }, [jwt, authedFetch])

  useEffect(() => { loadPresenceRef.current = loadPresence }, [loadPresence])

  const loadRecap = useCallback(async () => {
    if (!jwt || recapLoadedRef.current) return
    recapLoadedRef.current = true
    try {
      const res = await authedFetch('/api/recap/weekly')
      if (!res.ok) return
      const data = await res.json()
      if (!data.show || !data.weekOf) return
      const dismissed = await AsyncStorage.getItem(weeklyRecapDismissKey(data.weekOf))
      if (dismissed === '1') return
      setWeeklyRecap(data)
    } catch {}
  }, [jwt, authedFetch])

  useEffect(() => { loadRecapRef.current = loadRecap }, [loadRecap])

  const dismissWeeklyRecap = useCallback(async () => {
    const weekOf = weeklyRecap?.weekOf
    setWeeklyRecap(null)
    if (!weekOf) return
    try {
      await AsyncStorage.setItem(weeklyRecapDismissKey(weekOf), '1')
    } catch {}
  }, [weeklyRecap])

  // ── Guest mode: co-players list (unauthenticated, public API) ──────────────
  type GuestCoPlayer = { userId: string; displayName: string | null; imageUrl: string | null; duprDoubles: number | null; coSessionCount: number }
  const [guestCoPlayers, setGuestCoPlayers] = useState<GuestCoPlayer[]>([])
  const [guestCoPlayersLoading, setGuestCoPlayersLoading] = useState(false)
  const guestCoPlayersLoadedRef = useRef(false)

  const loadGuestCoPlayers = useCallback(async () => {
    if (!guestReclubUserId || guestCoPlayersLoadedRef.current) return
    guestCoPlayersLoadedRef.current = true
    setGuestCoPlayersLoading(true)
    try {
      const res = await fetch(`${resolveApiBase()}/api/players/${guestReclubUserId}/co-players`)
      if (res.ok) {
        const data = await res.json()
        setGuestCoPlayers(data.coPlayers ?? [])
      }
    } catch {}
    finally { setGuestCoPlayersLoading(false) }
  }, [guestReclubUserId])

  // Load co-players whenever guest mode is active (needed for both feed + players tabs)
  useEffect(() => {
    if (isGuestMode) {
      loadGuestCoPlayers()
    }
  }, [isGuestMode, loadGuestCoPlayers])

  /**
   * Synthetic feed items for guest mode — built from ghost-followed co-players.
   * Each ghost-followed player becomes a 'played' feed item so the feed
   * looks identical to the authenticated view.
   */
  const guestFeedItems = useMemo<import('../data').FeedItem[]>(() => {
    if (!isGuestMode) return []
    const followed = guestCoPlayers.filter((p) => guestPendingFollows.includes(p.userId))
    const all = followed.length > 0 ? followed : guestCoPlayers.slice(0, 5)
    return all.map((p, i) => ({
      id: `guest_${p.userId}`,
      type: 'played' as import('../data').FeedItemType,
      player: { userId: p.userId, displayName: p.displayName, imageUrl: p.imageUrl, duprDoubles: p.duprDoubles },
      isFollowing: true,
      // Stable descending timestamps (1 day apart) so list order doesn't change on re-render
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      sessionCount: p.coSessionCount,
    }))
  }, [isGuestMode, guestCoPlayers, guestPendingFollows])

  /**
   * For the Players tab in guest mode: use guestCoPlayers mapped to FollowedPlayer shape
   * so the full authenticated players view renders the same content.
   */
  const effectiveFriends = useMemo<FollowedPlayer[]>(() => {
    if (jwt) return friends
    if (!isGuestMode) return []
    return guestCoPlayers.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      imageUrl: p.imageUrl,
      duprDoubles: p.duprDoubles,
      followedAt: new Date().toISOString(),
    }))
  }, [jwt, isGuestMode, friends, guestCoPlayers])

  /** Ghost-follow a player during guest mode: record locally + open sign-in. */
  const handleGuestFollow = useCallback((userId: string) => {
    addGuestPendingFollow(userId)
    openSignUp()
  }, [addGuestPendingFollow, openSignUp])

  useEffect(() => {
    if (jwt && subTab === 'feed' && !feedLoadedRef.current) {
      console.log('[FREEZE_DEBUG] initial loadFeed trigger — jwt+feed tab ready')
      feedLoadedRef.current = true
      void loadFeedRef.current()
      void loadRecapRef.current()
    }
  }, [jwt, subTab]) // intentionally omit loadFeed/loadRecap — use stable refs

  useEffect(() => {
    // Start the presence polling once when the feed tab is first shown.
    // Do NOT include subTab as a dep change — navigating away and back must
    // not restart the interval or re-fetch.
    if (jwt && subTab === 'feed' && !presenceIntervalRef.current) {
      void loadPresenceRef.current()
      presenceIntervalRef.current = setInterval(() => void loadPresenceRef.current(), 60000)
    }
    // No cleanup here — interval lives for the component lifetime and is
    // cleared in the dedicated unmount effect below.
  }, [jwt, subTab]) // intentionally omit loadPresence — use stable ref

  // Clear presence interval on unmount
  useEffect(() => {
    return () => {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current)
        presenceIntervalRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if ((!jwt && !isGuestMode) || subTab !== 'players' || suggestionsLoadedRef.current) return
    if (!effectiveReclubUserId) {
      setSuggestionsLoading(false)
      return
    }
    suggestionsLoadedRef.current = true
    void loadSuggestionsRef.current()
  }, [jwt, isGuestMode, subTab, effectiveReclubUserId]) // intentionally omit loadSuggestions — use stable ref

  const handleFeedRefresh = useCallback(async () => {
    setFeedRefreshing(true)
    await loadFeed()
    setFeedRefreshing(false)
  }, [loadFeed])

  // ── Friends state ───────────────────────────────────────────────────────────

  const loadFriends = useCallback(async () => {
    if (!jwt) return
    const t0 = Date.now()
    console.log('[TheHub][PERF[PLAYERS]] ⏱ loadFriends started')
    await ensureServerAuth()
    setLoadingFriends(true)
    try {
      const tFetch = Date.now()
      const res = await authedFetch('/api/follows')
      console.log(`[TheHub][PERF[PLAYERS]] ⏱ /api/follows network: ${Date.now() - tFetch}ms → HTTP ${res.status}`)
      if (res.ok) {
        const tParse = Date.now()
        const list = await res.json()
        console.log(`[TheHub][PERF[PLAYERS]] ⏱ JSON parse: ${Date.now() - tParse}ms — friends=${list.length}`)
        setFriends(list)
        console.log(`[TheHub][PERF[PLAYERS]] ⏱ TOTAL loadFriends: ${Date.now() - t0}ms ✅`)
      } else {
        const body = await res.text()
        console.warn('[TheHub][PERF[PLAYERS]] GET /api/follows', res.status, body)
        console.log(`[TheHub][PERF[PLAYERS]] ⏱ TOTAL loadFriends (error): ${Date.now() - t0}ms`)
      }
    } catch (e) {
      console.warn('[TheHub][PERF[PLAYERS]] loadFriends error', e)
    } finally {
      setLoadingFriends(false)
    }
  }, [authedFetch, jwt, ensureServerAuth])

  // Keep the ref in sync so useImperativeHandle can call loadFriends
  // without capturing a stale closure (loadFriends is defined after the handle).
  useEffect(() => { loadFriendsRef.current = loadFriends }, [loadFriends])

  const prependJustFollowedFeedItem = useCallback(
    (
      userId: string,
      displayName: string | null,
      imageUrl: string | null,
      dupr: number | null
    ) => {
      const id = `follow_${userId}_${Date.now()}`
      const newItem: FeedItem = {
        id,
        type: 'just_followed' as FeedItemType,
        player: { userId, displayName, imageUrl, duprDoubles: dupr },
        isFollowing: true,
        timestamp: new Date().toISOString(),
      }
      localFeedItemIds.current.add(userId)
      setFeedItems((prev) => [newItem, ...prev])
    },
    []
  )

  const handleFollowFromSuggestion = useCallback(
    async (userId: string) => {
      if (!jwt) {
        handleGuestFollow(userId)
        return
      }
      setFollowedSuggestionIds((prev) => new Set(prev).add(userId))
      try {
        const res = await authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Follow failed')
        const followed = suggestions.find((s) => s.userId === userId)
        prependJustFollowedFeedItem(
          userId,
          followed?.displayName ?? null,
          followed?.imageUrl ?? null,
          followed?.duprDoubles ?? null
        )
        toast('Followed!', 'success')
        friendsLoadedRef.current = false
        loadFriends()
      } catch {
        setFollowedSuggestionIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
        toast('Failed to follow. Try again.', 'error')
      }
    },
    [jwt, authedFetch, toast, loadFriends, prependJustFollowedFeedItem, suggestions, handleGuestFollow]
  )

  useEffect(() => {
    if (jwt && subTab === 'players' && !friendsLoadedRef.current) {
      friendsLoadedRef.current = true
      void loadFriendsRef.current()
    }
  }, [jwt, subTab]) // intentionally omit loadFriends — use stable loadFriendsRef

  const performUnfollow = useCallback(
    async (userId: string) => {
      const player = friends.find((f) => f.userId === userId)
      setFriends((prev) => prev.filter((f) => f.userId !== userId))
      try {
        const res = await authedFetch('/api/follows', {
          method: 'DELETE',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Unfollow failed')
        toast(`Unfollowed ${player?.displayName ?? 'player'}`, 'info')
      } catch {
        loadFriends()
        toast('Failed to unfollow. Try again.', 'error')
      }
    },
    [friends, authedFetch, toast, loadFriends]
  )

  const handleUnfollow = (userId: string) => {
    const player = friends.find((f) => f.userId === userId)
    const name = player?.displayName ?? 'this player'
    Alert.alert(
      'Unfollow?',
      `Stop following ${name}? They will no longer appear in your friends filter.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              `${name} will be removed from your friends list.`,
              [
                { text: 'Keep following', style: 'cancel' },
                {
                  text: 'Yes, unfollow',
                  style: 'destructive',
                  onPress: () => performUnfollow(userId),
                },
              ]
            )
          },
        },
      ]
    )
  }

  const handleFollowFromSearch = useCallback(
    async (
      userId: string,
      player?: {
        displayName?: string | null
        imageUrl?: string | null
        duprDoubles?: number | null
      }
    ) => {
      if (!jwt) {
        handleGuestFollow(userId)
        return
      }
      try {
        const res = await authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Follow failed')
        prependJustFollowedFeedItem(
          userId,
          player?.displayName ?? null,
          player?.imageUrl ?? null,
          player?.duprDoubles ?? null
        )
        toast('Followed!', 'success')
        loadFriends()
      } catch {
        toast('Failed to follow. Try again.', 'error')
        throw new Error('Follow failed')
      }
    },
    [jwt, authedFetch, toast, loadFriends, prependJustFollowedFeedItem, handleGuestFollow]
  )

  const handleUnfollowFromSearch = useCallback(
    async (userId: string) => {
      try {
        const res = await authedFetch('/api/follows', {
          method: 'DELETE',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Unfollow failed')
        toast('Removed from friends', 'info')
        loadFriends()
      } catch {
        toast('Failed to unfollow. Try again.', 'error')
        throw new Error('Unfollow failed')
      }
    },
    [authedFetch, toast, loadFriends]
  )

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false)
    setShowSuggested(false)
    loadFriends()
  }, [loadFriends])

  console.log('[FREEZE_DEBUG] CircleScreen render — feedItems:', feedItems.length, 'feedLoading:', feedLoading, 'subTab:', subTab, 'showNotifSheet:', showNotifSheet)

  return (
    <LinearGradient
      colors={[T.gradientBg1, T.gradientBg2, T.gradientBg3]}
      locations={[0, 0.5, 1]}
      style={{ flex: 1 }}
    >
      <ScreenTopBar
        title={t('headerTitle')}
        onQrPress={jwt ? () => setShowQrShare(true) : undefined}
        onHeartPress={jwt ? () => { setShowActivity(true); onActivityChange?.(true) } : undefined}
      />

      <GradientTabRow
        tabs={CIRCLE_TABS}
        activeKey={subTab}
        onPress={(key) => {
          if (key === 'players') {
            console.log('[TheHub][PERF[PLAYERS]] ⏱ tab tapped by user')
          } else if (key === 'clubs') {
            console.log('[TheHub][PERF[CLUBS]] ⏱ tab tapped by user')
          } else {
            console.log('[TheHub][PERF[FEED]] ⏱ tab tapped by user')
          }
          setSubTab(key)
        }}
        mutedColor={T.muted}
        backgroundColor={T.glassCard}
        borderColor={T.glassBorder}
        activeGradient={[T.glassPrimary, T.glassPrimaryEnd]}
      />

      {subTab === 'feed' && !jwt && !isGuestMode && (
        onGuestReclubComplete ? (
          /* Inline reclub search — saves one tap vs the full-screen flow */
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: navBarHeight }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inlineReclubCard}>
              <Text style={[styles.inlineReclubHero, { color: T.glassPrimary }]}>
                LET'S FIND YOU{'\n'}ON RECLUB
              </Text>
              <Text style={styles.inlineReclubSub}>
                Search for your Reclub profile to see players you've played with.
              </Text>
              <PlayerSearch
                mode="select"
                onSelectPlayer={(player) => {
                  if (player) onGuestReclubComplete(player.userId)
                }}
              />
            </View>
          </ScrollView>
        ) : (
          <SignInPrompt onSignIn={onSignIn} onLinkReclub={onStartGuestReclub} />
        )
      )}

      {subTab === 'feed' && isGuestMode && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: navBarHeight }} onScroll={handleScroll} scrollEventThrottle={16}>
          {/* Sign-in nudge at top of guest feed */}
          <SignInSaveCta onPress={() => openSignUp()} />

          {guestCoPlayersLoading ? (
            <SquaddLoader />
          ) : guestFeedItems.length === 0 ? (
            <View style={styles.emptyStateInline}>
              <Text style={styles.emptyText}>
                Follow players to see their activity here.
              </Text>
            </View>
          ) : (
            guestFeedItems.map((item) => (
              <FeedItemRow
                key={item.id}
                item={item}
                onJoinToo={() => {}}
                onAvatarPress={(uid) => setSelectedPlayerId(uid)}
                  onKudos={() => openSignUp()}
              />
            ))
          )}
        </ScrollView>
      )}

      {subTab === 'feed' && jwt && (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: navBarHeight, flexGrow: 1 }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={feedRefreshing}
              onRefresh={handleFeedRefresh}
              tintColor={T.glassPrimary}
            />
          }
        >
          {/* Presence / nobody-on-court — top of feed */}
          {presence && (presence.totalLive > 0 || (presence.upcomingVenues?.length ?? 0) > 0) && (
            <View style={[styles.presenceBannerWrap, { marginTop: 8 }]}>
              {/* Header row — always visible, 70/30 split */}
              <View style={styles.presenceBannerRail}>
                {/* On Court pill */}
                {presence.totalLive > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.presenceBanner,
                      (presence.upcomingVenues?.length ?? 0) > 0 ? { flex: 7 } : { flex: 1 },
                      presenceExpanded && styles.presenceBannerActive,
                    ]}
                    onPress={() => {
                      setPresenceExpanded((prev) => !prev)
                      setExpandedUpcomingId(null)
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.presenceDot} />
                    <View style={styles.presenceBannerText}>
                      <Text style={styles.presenceBannerTitle} numberOfLines={1}>
                        {presence.totalLive} from your circle{' '}
                        {presence.totalLive === 1 ? 'is' : 'are'} on court
                      </Text>
                      <Text style={styles.presenceBannerSub} numberOfLines={1}>
                        Right now · {presence.liveVenues.length}{' '}
                        {presence.liveVenues.length === 1 ? 'venue' : 'venues'}
                      </Text>
                    </View>
                    <Text style={styles.presenceBannerCount}>{presence.totalLive}</Text>
                    <Text style={[styles.presenceChevron, presenceExpanded && styles.presenceChevronOpen]}>▾</Text>
                  </TouchableOpacity>
                )}

                {/* Playing Soon pill */}
                {(presence.upcomingVenues?.length ?? 0) > 0 && (() => {
                  const totalSoon = presence.upcomingVenues.reduce(
                    (acc: number, v: any) => acc + (v.circleCount ?? 1), 0
                  )
                  return (
                    <TouchableOpacity
                      style={[
                        styles.soonBanner,
                        presence.totalLive > 0 ? { flex: 3 } : { flex: 1 },
                        expandedUpcomingId === -1 && styles.soonBannerActive,
                      ]}
                      onPress={() => {
                        setExpandedUpcomingId(expandedUpcomingId === -1 ? null : -1)
                        setPresenceExpanded(false)
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.soonDot} />
                      <View style={styles.presenceBannerText}>
                        <Text style={styles.soonBannerTitle} numberOfLines={1}>
                          {totalSoon} next 8h
                        </Text>
                        <Text style={styles.soonBannerSub} numberOfLines={1}>
                          Next session
                        </Text>
                      </View>
                      <Text style={[styles.soonChevron, expandedUpcomingId === -1 && styles.presenceChevronOpen]}>▾</Text>
                    </TouchableOpacity>
                  )
                })()}
              </View>

              {/* Expanded: On Court — full width, PresenceCard per venue */}
              {presenceExpanded && presence.totalLive > 0 && (
                <View style={styles.presenceExpandedWrap}>
                  {presence.liveVenues.map((venue: any) => (
                    <PresenceCard
                      key={venue.sessionId}
                      venue={venue}
                      onPlayerPress={(userId) => setSelectedPlayerId(userId)}
                      onShowRoster={handleShowRoster}
                    />
                  ))}
                </View>
              )}

              {/* Expanded: Playing Soon — same card layout as PresenceCard but amber */}
              {expandedUpcomingId === -1 && (presence.upcomingVenues?.length ?? 0) > 0 && (
                <View style={styles.presenceExpandedWrap}>
                  {presence.upcomingVenues.map((venue: any) => {
                    const durationH = (() => {
                      const [sh, sm] = venue.startTime.split(':').map(Number)
                      const [eh, em] = venue.endTime.split(':').map(Number)
                      const diff = (eh * 60 + em) - (sh * 60 + sm)
                      return Math.max(1, Math.round((diff > 0 ? diff : diff + 1440) / 60))
                    })()
                    const circleNames = venue.players
                      ?.slice(0, 2)
                      .map((p: any) => p.displayName?.split(' ')[0] ?? 'Player')
                      .join(', ') ?? ''
                    const extraCircle = (venue.circleCount ?? 1) > 2
                      ? ` + ${venue.circleCount - 2} more from your circle`
                      : ' from your circle'
                    return (
                      <View key={venue.sessionId} style={styles.soonCard}>
                        <View style={styles.soonCardHeader}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.soonCardVenue} numberOfLines={1}>
                              {venue.venueName}
                            </Text>
                            <Text style={styles.soonCardTime}>
                              {formatClock(venue.startTime)} · {durationH}h session
                            </Text>
                          </View>
                          <View style={styles.soonCardBadge}>
                            <View style={styles.soonCardDot} />
                            <Text style={styles.soonCardBadgeText}>{formatClock(venue.startTime)}</Text>
                          </View>
                        </View>
                        <View style={styles.soonCardBody}>
                          <View style={styles.soonCardPlayersRow}>
                            <View style={styles.soonCardPlayersMain}>
                              {venue.players?.slice(0, 3).map((p: any, i: number) => (
                                <TouchableOpacity
                                  key={p.userId}
                                  style={[styles.soonCardAvWrap, { zIndex: 4 - i }]}
                                  onPress={() => setSelectedPlayerId(p.userId)}
                                >
                                  {p.imageUrl ? (
                                    <Image source={{ uri: p.imageUrl }} style={styles.soonCardAv} resizeMode="cover" />
                                  ) : (
                                    <View style={[styles.soonCardAv, styles.soonCardAvFallback]}>
                                      <Text style={styles.soonCardAvInitial}>
                                        {(p.displayName ?? '?')[0].toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                </TouchableOpacity>
                              ))}
                              {(venue.totalRoster ?? 0) > 3 && (
                                <View style={[styles.soonCardAvWrap, styles.soonCardAvMore]}>
                                  <Text style={styles.soonCardAvMoreText}>+{venue.totalRoster - 3}</Text>
                                </View>
                              )}
                              <Text style={styles.soonCardCircleInfo} numberOfLines={2}>
                                <Text style={styles.soonCardCircleNames}>{circleNames}</Text>
                                {extraCircle}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <TouchableOpacity
                                style={styles.soonCardShowMeBtn}
                                onPress={() => venue.sessionId && handleShowRoster(venue.sessionId)}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.soonCardShowMeText}>Show me</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.soonCardJoinBtnWrap}
                                onPress={() => venue.eventUrl && Linking.openURL(venue.eventUrl)}
                                activeOpacity={0.75}
                              >
                                <LinearGradient
                                  colors={[T.glassPrimary, T.glassPrimaryEnd]}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 0 }}
                                  style={styles.soonCardJoinBtn}
                                >
                                  <Text style={styles.soonCardJoinText}>Join too</Text>
                                </LinearGradient>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          )}

          {!feedLoading && presence && presence.totalLive === 0 && (presence.upcomingVenues?.length ?? 0) === 0 && (
            <View style={[styles.noOneLive, { marginTop: 8 }]}>
              <View style={styles.noOneLiveDot} />
              <View>
                <Text style={styles.noOneLiveTitle}>Nobody on court right now</Text>
                <Text style={styles.noOneLiveSub}>Check back this evening</Text>
              </View>
            </View>
          )}

          {jwt && !reclubUserId && (
            <View style={styles.linkReclubCtaWrap}>
              <TouchableOpacity style={styles.linkReclubCtaBtn} onPress={onLinkReclub ?? onStartGuestReclub} activeOpacity={0.85}>
                <LinearGradient
                  colors={[T.glassPrimary, T.glassPrimaryEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.linkReclubCtaGradient}
                >
                  <Text style={styles.linkReclubCtaText}>Link your Reclub account</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.linkReclubCtaSub}>
                See your friends' activities in real time, give them kudos and join them on court.
              </Text>
            </View>
          )}

          {!feedLoading && !hasFollows && reclubUserId && (
            <View style={styles.emptyStateInline}>
              <Text style={styles.emptyText}>
                Follow players to see their activity here.
              </Text>
            </View>
          )}

          {feedLoading && <SquaddLoader />}

          {/* Weekly recap card — shown once per week on first feed open */}
          {!feedLoading && weeklyRecap && (() => {
            const recap = weeklyRecap
            const stats: { label: string; value: string | number }[] = [
              { label: 'Sessions', value: recap.sessionsPlayed },
              { label: 'Co-players', value: recap.uniqueCoPlayers },
              { label: 'Kudos', value: recap.kudosReceived },
              { label: 'Clubs', value: recap.clubsVisited },
            ]
            return (
              <View style={styles.recapCard}>
                <View style={styles.recapHeader}>
                  <Text style={styles.recapEyebrow}>YOUR CIRCLE THIS WEEK</Text>
                  <TouchableOpacity
                    onPress={dismissWeeklyRecap}
                    hitSlop={10}
                    style={styles.recapDismiss}
                  >
                    <Text style={styles.recapDismissX}>×</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.recapWeekOf}>{recap.weekOf}</Text>
                <View style={styles.recapStatsRow}>
                  {stats.map((s) => (
                    <View key={s.label} style={styles.recapStatTile}>
                      <Text style={styles.recapStatValue}>{s.value}</Text>
                      <Text style={styles.recapStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
                {recap.topClub != null && (
                  <View style={styles.recapTopClubRow}>
                    <Text style={styles.recapTopClubLabel}>Top club</Text>
                    <Text style={styles.recapTopClubName} numberOfLines={1}>{recap.topClub}</Text>
                  </View>
                )}
                {recap.mostImproved != null && recap.mostImproved.improvement > 0 && (
                  <View style={styles.recapMostImprovedRow}>
                    <Text style={styles.recapMostImprovedLabel}>Most improved</Text>
                    <Text style={styles.recapMostImprovedName} numberOfLines={1}>
                      {recap.mostImproved.displayName ?? 'A friend'}{' '}
                      <Text style={styles.recapMostImprovedDelta}>
                        +{recap.mostImproved.improvement.toFixed(2)} DUPR
                      </Text>
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.recapShareBtn}
                  activeOpacity={0.85}
                  onPress={() =>
                    Share.share({
                      message: `I played ${recap.sessionsPlayed} session${recap.sessionsPlayed !== 1 ? 's' : ''} with ${recap.uniqueCoPlayers} friends this week on SQUADD 🏓 squadd.app`,
                    })
                  }
                >
                  <Text style={styles.recapShareBtnText}>Share my week</Text>
                </TouchableOpacity>
              </View>
            )
          })()}

          {/* Feed items */}
          {!feedLoading && (() => {
            const livePlayerIds = new Set(
              presence?.liveVenues?.flatMap((v: any) => v.players.map((p: any) => p.userId)) ?? []
            )
            let kudosTipShown = false
            return feedItems.map((item, index) => {
              const showThisKudosTip = showKudosTip && !kudosTipShown &&
                (item.type === 'played_today' || item.type === 'played' || item.type === 'joining')
              if (showThisKudosTip) kudosTipShown = true
              return (
                <FeedItemRow
                  key={item.id}
                  item={item}
                  onJoinToo={(eventUrl) => Linking.openURL(eventUrl)}
                  onAvatarPress={(uid) => {
                    if (index === 0 && showAvatarTip) dismissAvatarTip()
                    setSelectedPlayerStub(item.player)
                    setSelectedPlayerId(uid)
                  }}
                  isLive={livePlayerIds.has(item.player.userId)}
                  showAvatarTip={index === 0 && showAvatarTip}
                  onDismissTip={dismissAvatarTip}
                  onShowRoster={handleShowRoster}
                  onSeeGear={(uid) => {
                    const name = item.player.displayName?.split(' ')[0] ?? 'Player'
                    setGearViewTarget({ userId: uid, name })
                  }}
                  showKudosTip={showThisKudosTip}
                  onDismissKudosTip={dismissKudosTip}
                />
              )
            })
          })()}

          {!feedLoading && hasMore && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={loadMore}
              disabled={loadingMore}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color={T.glassPrimary} />
                : <Text style={styles.loadMoreText}>Load more</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {subTab === 'players' && !jwt && !isGuestMode && <SignInPrompt onSignIn={onSignIn} onLinkReclub={onStartGuestReclub} />}

      {/* Guest mode: show co-players fetched via public API — now handled by the full players view below */}

      {subTab === 'players' && (jwt || isGuestMode) && (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {/* Sign-in nudge banner — negative margin cancels parent paddingHorizontal so width matches My Feed tab */}
          {isGuestMode && (
            <View style={{ marginHorizontal: -20 }}>
              <SignInSaveCta onPress={() => openSignUp()} />
            </View>
          )}
          {/* Link Reclub CTA — shown centered when Reclub not linked (signed-in only) */}
          {jwt && !reclubUserId ? (
            <View style={styles.linkReclubCtaWrap}>
              <TouchableOpacity style={styles.linkReclubCtaBtn} onPress={onLinkReclub ?? onStartGuestReclub} activeOpacity={0.85}>
                <LinearGradient
                  colors={[T.glassPrimary, T.glassPrimaryEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.linkReclubCtaGradient}
                >
                  <Text style={styles.linkReclubCtaText}>Link your Reclub account</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={styles.linkReclubCtaSub}>
                See your friends' activities in real time, give them kudos and join them on court.
              </Text>
            </View>
          ) : showSuggested ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity
                  onPress={handleCloseSearch}
                  style={styles.searchBackBtn}
                >
                  <ArrowLeft size={18} color={T.text} strokeWidth={2} />
                  <Text style={{ fontSize: 14, color: T.text }}>Back to friends</Text>
                </TouchableOpacity>
              </View>
              <PeopleYouMayKnowScreen
                onComplete={handleCloseSearch}
                embedded
                onPlayerPress={(userId) => setSelectedPlayerId(userId)}
              />
            </View>
          ) : showSearch ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity
                  onPress={handleCloseSearch}
                  style={styles.searchBackBtn}
                >
                  <ArrowLeft size={18} color={T.text} strokeWidth={2} />
                  <Text style={{ fontSize: 14, color: T.text }}>Back to friends</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowSearch(false); setShowSuggested(true) }}
                  style={styles.suggestedBtn}
                >
                  <Sparkles size={14} color={T.glassPrimary} strokeWidth={2} />
                  <Text style={styles.suggestedLabel}>Suggested</Text>
                </TouchableOpacity>
              </View>
              <PlayerSearch
                mode="follow"
                onFollow={handleFollowFromSearch}
                onUnfollow={handleUnfollowFromSearch}
                onAvatarPress={(userId, player) => {
                  setSelectedPlayerStub({ userId: player.userId, displayName: player.displayName, imageUrl: player.imageUrl })
                  setSelectedPlayerId(userId)
                }}
                initialFollowedIds={friends.map((f) => f.userId)}
                autoFocus
              />
            </View>
          ) : (
            (() => {
              const visibleSuggestions = suggestions.filter((s) => !dismissedSuggestions.has(s.userId))
              const showSuggestionsSection = suggestionsLoading || visibleSuggestions.length > 0

              const ListHeader = (
                <>
                  {showSuggestionsSection && (
                    <View style={styles.suggestionsSection}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionLabel}>Crossed Paths</Text>
                        <View style={styles.sectionHeaderActions}>
                          {!suggestionsLoading && (
                            <TouchableOpacity
                              onPress={() => setShowSuggested(true)}
                              style={styles.suggestedBtn}
                            >
                              <Sparkles size={14} color={T.glassPrimary} strokeWidth={2} />
                              <Text style={styles.suggestedLabel}>For You</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => setShowSearch(true)}
                            style={styles.searchIconBtn}
                            activeOpacity={0.7}
                          >
                            <Search size={18} color={T.text} strokeWidth={2} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.carouselContent}
                      >
                        {suggestionsLoading
                          ? Array.from({ length: SUGGESTION_SKELETON_COUNT }).map((_, i) => (
                              <SuggestionCardSkeleton key={i} />
                            ))
                          : visibleSuggestions.map((s) => {
                              const isFollowed = followedSuggestionIds.has(s.userId)
                              return (
                                <View key={s.userId} style={styles.suggestionCard}>
                                  <TouchableOpacity
                                    style={styles.dismissBtn}
                                    onPress={() =>
                                      setDismissedSuggestions((prev) => new Set([...prev, s.userId]))
                                    }
                                  >
                                    <X size={10} color={T.iconMuted} />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setSelectedPlayerStub({ userId: s.userId, displayName: s.displayName, imageUrl: s.imageUrl })
                                      setSelectedPlayerId(s.userId)
                                    }}
                                  >
                                    <PlayerAvatar
                                      userId={s.userId}
                                      imageUrl={s.imageUrl}
                                      size={60}
                                      style={styles.suggestionAvatar}
                                    />
                                  </TouchableOpacity>
                                  <Text style={styles.suggestionName} numberOfLines={1}>
                                    {s.displayName ?? 'Player'}
                                  </Text>
                                  <Text style={styles.suggestionSessionsSub}>Played together</Text>
                                  <Text style={styles.suggestionSessions} numberOfLines={1}>
                                    <Text style={styles.suggestionSessionsCount}>
                                      {s.coSessionCount}×
                                    </Text>
                                    <Text style={styles.suggestionSessionsLabel}>
                                      {' '}sessions
                                    </Text>
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => !isFollowed && handleFollowFromSuggestion(s.userId)}
                                    disabled={isFollowed}
                                    activeOpacity={0.85}
                                    style={{ width: '100%' }}
                                  >
                                    {isFollowed ? (
                                      <View style={[styles.feedFollowBtn, styles.feedFollowedBtn]}>
                                        <Text style={[styles.feedFollowBtnText, styles.feedFollowedBtnText]}>
                                          Following
                                        </Text>
                                      </View>
                                    ) : (
                                      <LinearGradient
                                        colors={[T.glassPrimary, T.glassPrimaryEnd]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.feedFollowBtn}
                                      >
                                        <Text style={styles.feedFollowBtnText}>Follow</Text>
                                      </LinearGradient>
                                    )}
                                  </TouchableOpacity>
                                </View>
                              )
                            })}
                      </ScrollView>
                    </View>
                  )}

                  {!showSuggestionsSection && (
                    <View style={[styles.sectionHeaderRow, { marginBottom: 8 }]}>
                      <Text style={styles.sectionLabel}>Your Circle</Text>
                      <TouchableOpacity
                        onPress={() => setShowSearch(true)}
                        style={styles.searchIconBtn}
                        activeOpacity={0.7}
                      >
                        <Search size={18} color={T.text} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {(isGuestMode ? guestCoPlayersLoading : loadingFriends) && <SquaddLoader />}
                </>
              )

              const isLoadingList = isGuestMode ? guestCoPlayersLoading : loadingFriends
              if (!isLoadingList && effectiveFriends.length === 0) {
                return (
                  <FlatList
                    data={[]}
                    keyExtractor={() => ''}
                    renderItem={null}
                    ListHeaderComponent={ListHeader}
                    ListEmptyComponent={
                      <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 48, paddingHorizontal: 24 }}>
                        <Users size={40} color={T.textTertiary} strokeWidth={1.5} />
                        <Text style={{ fontSize: 16, fontWeight: '600', color: T.text, marginTop: 12 }}>
                          No friends yet
                        </Text>
                        <Text style={{ fontSize: 13, color: T.textSecondary, marginTop: 4, textAlign: 'center' }}>
                          Follow players from your sessions to see them here
                        </Text>
                      </View>
                    }
                    contentContainerStyle={{ paddingBottom: navBarHeight }}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    refreshControl={
                      <RefreshControl refreshing={playersRefreshing} onRefresh={handlePlayersRefresh} tintColor={T.glassPrimary} />
                    }
                  />
                )
              }

              return (
                <FlatList
                  data={effectiveFriends}
                  keyExtractor={(item) => item.userId}
                  ListHeaderComponent={ListHeader}
                  renderItem={({ item }) => (
                    <FriendListRow
                      item={item}
                      onUnfollow={isGuestMode ? () => {} : () => handleUnfollow(item.userId)}
                      onAvatarPress={() => setSelectedPlayerId(item.userId)}
                    />
                  )}
                  contentContainerStyle={{ paddingBottom: navBarHeight }}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  refreshControl={
                    <RefreshControl refreshing={playersRefreshing} onRefresh={handlePlayersRefresh} tintColor={T.glassPrimary} />
                  }
                />
              )
            })()
          )}
        </View>
      )}

      {subTab === 'clubs' && !jwt && !isGuestMode && <SignInPrompt onSignIn={onSignIn} onLinkReclub={onStartGuestReclub} />}

      {subTab === 'clubs' && jwt && (
        <ClubsTab onSelectClub={(clubId) => { setSelectedClubId(clubId); onClubOverlayChange?.(true) }} />
      )}

      <NotificationPermissionSheet
        visible={showNotifSheet}
        onClose={() => setShowNotifSheet(false)}
      />

      {/* Roster sheet — root-level overlay (no native Modal so PlayerProfileSheet can sit above it) */}
      {rosterModal.visible && (
        <View style={styles.rosterHost} pointerEvents="box-none">
          <Pressable
            style={styles.rosterBackdrop}
            onPress={() => setRosterModal(prev => ({ ...prev, visible: false }))}
          />
          <View style={[styles.rosterSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.rosterHandle} />
            <View style={styles.rosterHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rosterTitle} numberOfLines={1}>
                  {rosterModal.sessionName || 'Session roster'}
                </Text>
                {rosterModal.venueName ? (
                  <Text style={styles.rosterVenue}>{rosterModal.venueName}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.rosterCloseBtn}
                onPress={() => setRosterModal(prev => ({ ...prev, visible: false }))}
                hitSlop={12}
              >
                <X size={22} color={T.textSecondary} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            {rosterModal.loadingId !== null ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={T.green} />
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Recommended to follow section */}
                {rosterRecommendations.length > 0 && (
                  <View style={styles.rosterRecSection}>
                    <View style={styles.rosterRecHeader}>
                      <Text style={styles.rosterRecTitle}>✦ Recommended to follow</Text>
                      <Text style={styles.rosterRecCount}>{rosterRecommendations.length} good fits</Text>
                    </View>
                    {rosterRecommendations.map((rec) => (
                      <View key={rec.player.userId} style={styles.rosterRecRow}>
                        <TouchableOpacity onPress={() => {
                          setSelectedPlayerStub({ userId: rec.player.userId, displayName: rec.player.displayName, imageUrl: rec.player.imageUrl, duprDoubles: rec.player.duprDoubles })
                          setSelectedPlayerId(rec.player.userId)
                        }}>
                          <Image
                            source={{ uri: rec.player.imageUrl ?? `https://api.reclub.vn/avatars/${rec.player.userId}.jpg` }}
                            style={styles.rosterRecAvatar}
                          />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rosterRecName}>{rec.player.displayName}</Text>
                          {rec.player.duprDoubles != null && (
                            <Text style={styles.rosterRecDupr}>{rec.player.duprDoubles.toFixed(2)} DUPR</Text>
                          )}
                          <View style={[
                            styles.rosterRecChip,
                            styles[`rosterRecChip_${rec.reasonType}`],
                          ]}>
                            <Text style={[
                              styles.rosterRecChipText,
                              styles[`rosterRecChipText_${rec.reasonType}`],
                            ]}>{rec.reason}</Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[styles.rosterRecFollowBtn, followingSet.has(rec.player.userId) && styles.rosterFollowBtnDone]}
                          onPress={() => !followingSet.has(rec.player.userId) && handleFollowFromRoster(rec.player.userId)}
                          activeOpacity={followingSet.has(rec.player.userId) ? 1 : 0.8}
                        >
                          <Text style={[styles.rosterRecFollowBtnText, followingSet.has(rec.player.userId) && styles.rosterFollowBtnTextDone]}>
                            {followingSet.has(rec.player.userId) ? 'Following' : 'Follow'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {(() => {
                  const players = rosterModal.players
                  const rows: React.ReactNode[] = []
                  for (let i = 0; i < players.length; i += 3) {
                    const group = players.slice(i, i + 3)
                    rows.push(
                      <View key={i} style={styles.rosterRow}>
                        {group.map((p) => {
                          const isFollowed = followingSet.has(p.userId)
                          return (
                            <View key={p.userId} style={styles.rosterCell}>
                              <TouchableOpacity onPress={() => {
                                setSelectedPlayerStub({ userId: p.userId, displayName: p.displayName, imageUrl: p.imageUrl, duprDoubles: p.duprDoubles })
                                setSelectedPlayerId(p.userId)
                              }}>
                                <Image
                                  source={{ uri: p.imageUrl ?? `https://api.reclub.vn/avatars/${p.userId}.jpg` }}
                                  style={styles.rosterAvatar}
                                />
                              </TouchableOpacity>
                              <Text style={styles.rosterName} numberOfLines={1}>{p.displayName}</Text>
                              {p.duprDoubles != null && (
                                <View style={styles.rosterDuprPill}>
                                  <Text style={styles.rosterDuprText}>DUPR {p.duprDoubles.toFixed(2)}</Text>
                                </View>
                              )}
                              <TouchableOpacity
                                style={[styles.rosterFollowBtn, isFollowed && styles.rosterFollowBtnDone]}
                                onPress={() => !isFollowed && handleFollowFromRoster(p.userId)}
                                activeOpacity={isFollowed ? 1 : 0.8}
                              >
                                <Text style={[styles.rosterFollowBtnText, isFollowed && styles.rosterFollowBtnTextDone]}>
                                  {isFollowed ? 'Following' : 'Follow'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )
                        })}
                        {group.length < 3 && Array.from({ length: 3 - group.length }).map((_, gi) => (
                          <View key={`empty-${gi}`} style={styles.rosterCell} />
                        ))}
                      </View>
                    )
                  }
                  return rows
                })()}
              </ScrollView>
            )}
          </View>
        </View>
      )}

      {/* PlayerProfileSheet sits above the roster overlay via zIndex: 10000 */}
      <PlayerProfileSheet
        userId={selectedPlayerId}
        stub={selectedPlayerStub}
        onClose={() => { setSelectedPlayerId(null); setSelectedPlayerStub(null) }}
      />

      {showActivity && (
        <View style={StyleSheet.absoluteFillObject}>
          <ActivityScreen onClose={() => { setShowActivity(false); onActivityChange?.(false) }} />
        </View>
      )}

      {selectedClubId && (
        <View style={StyleSheet.absoluteFillObject}>
          <ClubProfileScreen clubId={selectedClubId} onClose={() => { setSelectedClubId(null); onClubOverlayChange?.(false) }} />
        </View>
      )}

      <QrShareScreen visible={showQrShare} onClose={() => setShowQrShare(false)} />

      <GearViewSheet
        visible={gearViewTarget !== null}
        onClose={() => setGearViewTarget(null)}
        playerUserId={gearViewTarget?.userId ?? ''}
        playerName={gearViewTarget?.name ?? ''}
      />
    </LinearGradient>
  )
}) as React.ForwardRefExoticComponent<CircleScreenProps & React.RefAttributes<CircleScreenHandle>>

function createStyles(T: GlassThemeColors) {
  const glassShadow = {
    shadowColor: T.glassShadow,
    shadowOffset: { width: 0, height: 4 } as const,
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  }
  const cardShadow = {
    shadowColor: T.glassShadow,
    shadowOffset: { width: 0, height: 8 } as const,
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 5,
  }
  return StyleSheet.create({
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  suggestionsSection: {
    marginHorizontal: -8,
    marginBottom: 16,
  },
  searchBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.glassBorder,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: T.glassPrimary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: T.text,
    letterSpacing: 0.2,
  },
  sectionLink: { fontSize: 11, color: T.muted },
  carouselContent: { paddingHorizontal: 12, gap: 10 },
  suggestionSkeletonCard: {
    minWidth: 108,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.glassBorder,
    borderRadius: 16,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    ...glassShadow,
  },
  suggestionSkeletonAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.borderSubtle,
  },
  suggestionSkeletonName: {
    width: 64,
    height: 13,
    borderRadius: 6,
    backgroundColor: T.borderSubtle,
    marginTop: 5,
    marginBottom: 4,
  },
  suggestionSkeletonSessions: {
    width: 80,
    height: 13,
    borderRadius: 6,
    backgroundColor: T.surface,
    marginBottom: 6,
  },
  suggestionSkeletonBtn: {
    width: '100%',
    height: 26,
    borderRadius: 6,
    backgroundColor: T.borderSubtle,
  },
  suggestionCard: {
    width: 120,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.glassBorder,
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    position: 'relative',
    ...glassShadow,
  },
  dismissBtn: { position: 'absolute', top: 7, right: 7, zIndex: 1 },
  suggestionAvatar: { marginBottom: 6 },
  suggestionName: {
    fontSize: 13,
    fontWeight: '700',
    color: T.text,
    marginTop: 4,
    marginBottom: 1,
    textAlign: 'center',
    maxWidth: 104,
  },
  suggestionSessionsSub: {
    fontSize: 11,
    color: T.textTertiary,
    textAlign: 'center',
    marginBottom: 1,
  },
  suggestionSessions: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: 104,
    color: T.textSecondary,
  },
  suggestionSessionsCount: {
    fontSize: 13,
    fontWeight: '700',
    color: T.glassPrimary,
  },
  suggestionSessionsLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: T.textSecondary,
  },
  feedFollowBtn: {
    borderRadius: 8,
    paddingVertical: 5,
    width: '100%',
    alignItems: 'center',
  },
  feedFollowedBtn: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  feedFollowBtnText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  feedFollowedBtnText: { fontSize: 11, fontWeight: '600', color: T.green },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyStateInline: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 12,
    color: T.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 4,
    overflow: 'hidden',
  },
  emptyBtnText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  inlineReclubCard: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  inlineReclubHero: {
    fontFamily: 'BarlowCondensed_800ExtraBold',
    fontSize: 34,
    lineHeight: 38,
    marginBottom: 10,
  },
  inlineReclubSub: {
    fontSize: 14,
    lineHeight: 20,
    color: T.textSecondary,
    marginBottom: 20,
  },
  linkReclubCtaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  linkReclubCtaBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    ...glassShadow,
  },
  linkReclubCtaGradient: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  linkReclubCtaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  linkReclubCtaSub: {
    fontSize: 13,
    color: T.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  presenceBannerWrap: {
    marginHorizontal: 12,
    marginBottom: 10,
  },
  presenceBannerRail: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'stretch',
  },
  presenceBannerActive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  presenceExpandedWrap: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  soonBanner: {
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.35)',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 6,
    ...glassShadow,
  },
  soonBannerActive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  soonBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  presenceVenueRowSoon: {
    backgroundColor: T.amberSurface,
    borderBottomColor: 'rgba(122,80,0,0.15)',
  },
  soonCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.glassBorder,
    borderRadius: 18,
    overflow: 'hidden',
    ...cardShadow,
  },
  soonCardHeader: {
    backgroundColor: 'rgba(245,166,35,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  soonCardVenue: {
    fontSize: 13,
    fontWeight: '600',
    color: T.amber,
  },
  soonCardTime: {
    fontSize: 9,
    color: T.amberTextMuted,
    marginTop: 1,
  },
  soonCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  soonCardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: T.amber,
  },
  soonCardBadgeText: {
    fontSize: 9,
    color: T.amber,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  soonCardBody: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  soonCardPlayersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soonCardPlayersMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  soonCardAvWrap: {
    marginRight: -6,
  },
  soonCardAv: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.bg,
    overflow: 'hidden',
  },
  soonCardAvFallback: {
    backgroundColor: T.amberSurfaceHeader,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonCardAvInitial: {
    fontSize: 10,
    fontWeight: '600',
    color: T.amber,
  },
  soonCardAvMore: {
    backgroundColor: T.input,
    borderColor: T.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonCardAvMoreText: {
    fontSize: 8,
    color: T.textTertiary,
  },
  soonCardCircleInfo: {
    fontSize: 10,
    color: T.textTertiary,
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
  },
  soonCardCircleNames: {
    color: T.amber,
    fontWeight: '500',
  },
  soonCardJoinBtnWrap: {
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
    alignSelf: 'center',
  },
  soonCardJoinBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonCardJoinText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  soonCardShowMeBtn: {
    backgroundColor: T.feedLive,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonCardShowMeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  soonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.amber,
    flexShrink: 0,
  },
  soonBannerTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: T.amber,
  },
  soonBannerSub: {
    fontSize: 10,
    color: T.amberTextMuted,
    marginTop: 1,
  },
  soonBannerCount: {
    fontSize: 20,
    fontWeight: '700',
    color: T.amber,
    flexShrink: 0,
  },
  soonChevron: {
    fontSize: 14,
    color: T.amber,
    flexShrink: 0,
  },
  soonVenueName: {
    fontSize: 11,
    fontWeight: '600',
    color: T.amber,
  },
  soonStartsAt: {
    fontSize: 9,
    color: T.amberTextMuted,
  },
  presenceBanner: {
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.greenBorder,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
    ...glassShadow,
  },
  presenceBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.feedLive,
    flexShrink: 0,
  },
  presenceBannerText: {
    flex: 1,
  },
  presenceBannerTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: T.greenText,
  },
  presenceBannerSub: {
    fontSize: 10,
    color: T.greenTextMuted,
    marginTop: 1,
  },
  presenceBannerCount: {
    fontSize: 20,
    fontWeight: '700',
    color: T.feedLive,
    flexShrink: 0,
  },
  presenceChevron: {
    fontSize: 14,
    color: T.feedLive,
    flexShrink: 0,
  },
  presenceChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  presenceVenueList: {
    borderTopWidth: 0.5,
    borderTopColor: T.greenBorder,
    paddingTop: 4,
    paddingBottom: 4,
  },
  presenceVenueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: T.greenBorder,
  },
  presenceVenueLeft: {
    flex: 1,
    marginRight: 8,
  },
  presenceVenueName: {
    fontSize: 11,
    fontWeight: '600',
    color: T.greenText,
  },
  presenceVenueWho: {
    fontSize: 9,
    color: T.greenTextMuted,
    marginTop: 1,
  },
  presenceVenueRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  endingSoonPill: {
    backgroundColor: T.amberSurfaceHeader,
    borderWidth: 0.5,
    borderColor: T.amber,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  endingSoonText: {
    fontSize: 9,
    color: T.amber,
    fontWeight: '500',
  },
  endsAtText: {
    fontSize: 9,
    color: '#2a5a3a',
  },
  noOneLive: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.glassBorder,
    borderRadius: 16,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...glassShadow,
  },
  noOneLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: T.border,
    flexShrink: 0,
  },
  noOneLiveTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: T.textTertiary,
  },
  noOneLiveSub: {
    fontSize: 10,
    color: T.border,
    marginTop: 1,
  },
  // ── Roster overlay (root-level, no native Modal) ──────────────
  rosterHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  rosterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
  },
  rosterSheet: {
    backgroundColor: T.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: Dimensions.get('window').height * 0.85,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: T.glassBorder,
  },
  rosterHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.borderSubtle,
    alignSelf: 'center',
    marginBottom: 12,
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  rosterCloseBtn: {
    padding: 4,
    marginLeft: 8,
  },
  rosterTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: T.text,
    marginBottom: 2,
  },
  rosterVenue: {
    fontSize: 12,
    color: T.muted,
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  rosterCell: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  rosterAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#222',
    marginBottom: 6,
  },
  rosterName: {
    fontSize: 12,
    fontWeight: '600',
    color: T.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  rosterDuprPill: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  rosterDuprText: {
    fontSize: 10,
    color: '#a78bfa',
    fontWeight: '700',
  },
  rosterFollowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: T.green,
    alignItems: 'center',
  },
  rosterFollowBtnDone: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
  },
  rosterFollowBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: T.text,
  },
  rosterFollowBtnTextDone: {
    color: T.textTertiary,
  },
  loadMoreBtn: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: T.glassPrimary,
  },
  rosterRecSection: {
    backgroundColor: T.blueSurface,
    borderWidth: 0.5,
    borderColor: T.blueBorder,
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  rosterRecHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: T.blueBorderSubtle,
  },
  rosterRecTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: T.blueText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rosterRecCount: { fontSize: 10, color: T.textTertiary },
  rosterRecRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: T.blueBorderSubtle,
  },
  rosterRecAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: T.blueBorder,
    marginRight: 10,
    flexShrink: 0,
    backgroundColor: T.blueSurface,
  },
  rosterRecName: { fontSize: 14, fontWeight: '600', color: T.text },
  rosterRecDupr: { fontSize: 11, color: T.amber, fontWeight: '600', marginTop: 1 },
  rosterRecChip: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  rosterRecChip_overlap: { backgroundColor: T.greenChipSurface },
  rosterRecChip_level: { backgroundColor: T.amberChipSurface },
  rosterRecChip_social: { backgroundColor: T.purpleChipSurface },
  rosterRecChipText: { fontSize: 10, fontWeight: '500' },
  rosterRecChipText_overlap: { color: T.greenChipText },
  rosterRecChipText_level: { color: T.amber },
  rosterRecChipText_social: { color: T.purpleText },
  rosterRecFollowBtn: {
    backgroundColor: T.blueBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 10,
    flexShrink: 0,
  },
  rosterRecFollowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ── Weekly recap card ─────────────────────────────────────────────────────
  recapCard: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: T.glassCard,
    borderWidth: 1,
    borderColor: T.feedRecapBorder,
    borderRadius: 20,
    padding: 14,
    ...cardShadow,
  },
  recapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  recapEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: T.feedRecap,
    textTransform: 'uppercase',
  },
  recapDismiss: {
    padding: 2,
  },
  recapDismissX: {
    fontSize: 18,
    color: T.textTertiary,
    lineHeight: 20,
  },
  recapWeekOf: {
    fontSize: 11,
    color: T.textSecondary,
    marginBottom: 12,
  },
  recapStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
  recapStatTile: {
    flex: 1,
    backgroundColor: T.feedRecapSurface,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  recapStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: T.feedRecap,
  },
  recapStatLabel: {
    fontSize: 9,
    color: T.textSecondary,
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recapTopClubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  recapTopClubLabel: {
    fontSize: 11,
    color: T.textTertiary,
    fontWeight: '500',
    flexShrink: 0,
  },
  recapTopClubName: {
    fontSize: 12,
    color: T.text,
    fontWeight: '600',
    flex: 1,
  },
  recapMostImprovedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  recapMostImprovedLabel: {
    fontSize: 11,
    color: T.textTertiary,
    fontWeight: '500',
    flexShrink: 0,
  },
  recapMostImprovedName: {
    fontSize: 12,
    color: T.text,
    fontWeight: '600',
    flex: 1,
  },
  recapMostImprovedDelta: {
    color: T.feedRecap,
    fontWeight: '700',
  },
  recapShareBtn: {
    marginTop: 6,
    backgroundColor: T.feedRecap,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  recapShareBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.feedRecapTextOn,
  },
  // ── Guest mode styles ──────────────────────────────────────────────────────
  guestPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  guestPlayerName: {
    fontSize: 15,
    fontWeight: '600',
    color: T.text,
  },
  guestPlayerMeta: {
    fontSize: 12,
    color: T.textSecondary,
  },
  guestFollowBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#facc15',
  },
  guestFollowedBtn: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  guestFollowBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  guestFollowedBtnText: {
    color: '#22c55e',
  },
})
}
