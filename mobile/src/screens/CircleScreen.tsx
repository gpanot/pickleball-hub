import React, { useEffect, useRef, useState, useCallback } from 'react'
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
  Modal,
  Pressable,
  Dimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { debugLog } from '../lib/debug'
import { Rss, Users, Search, ArrowLeft, Sparkles, X } from 'lucide-react-native'
import { TopBar } from '../components/CardBody'
import { SquaddLoader } from '../components/SquaddLoader'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { SignInPrompt } from '../components/SignInPrompt'
import { GearTeaserCard } from '../components/GearTeaserCard'
import { PlayerSearch } from '../components/PlayerSearch'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { FriendListRow } from '../components/FriendListRow'
import { FeedItemRow } from '../components/FeedItemRow'
import { PresenceCard } from '../components/PresenceCard'
import { PlayerProfileSheet } from '../components/PlayerProfileSheet'
import { useToast } from '../components/Toast'
import { PeopleYouMayKnowScreen } from './PeopleYouMayKnowScreen'
import type { FeedItem, FeedItemType, CoPlayerSuggestion } from '../data'
import { useProfileMenu } from '../contexts/ProfileMenuContext'
import { useUiStore } from '../stores/uiStore'
import { NotificationPermissionSheet } from '../components/NotificationPermissionSheet'

type CircleSubTab = 'feed' | 'players'

type FollowedPlayer = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  followedAt: string
}

const SUGGESTION_SKELETON_COUNT = 4

function SuggestionCardSkeleton() {
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

export function CircleScreen({ onOpenGear, gearSaved, gearSetupComplete }: { onOpenGear?: () => void; gearSaved?: boolean; gearSetupComplete?: boolean }) {
  const [subTab, setSubTab] = useState<CircleSubTab>('feed')
  const [friends, setFriends] = useState<FollowedPlayer[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedPlayerStub, setSelectedPlayerStub] = useState<import('../components/PlayerProfileSheet').PlayerProfileStub | null>(null)

  const feedLoadedRef = useRef(false)
  const localFeedItemIds = useRef<Set<string>>(new Set())
  const friendsLoadedRef = useRef(false)
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

  const { authedFetch, jwt, ensureServerAuth, reclubUserId } = useAuthStore()
  const toast = useToast((s) => s.show)
  const { openProfileSheet } = useProfileMenu()
  const { width: screenWidth } = useWindowDimensions()
  const pendingNewFollower = useUiStore((s) => s.pendingNewFollower)
  const clearPendingNewFollower = useUiStore((s) => s.setPendingNewFollower)

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
  const [expandedUpcomingId, setExpandedUpcomingId] = useState<number | null>(null)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set()
  )
  const [showAvatarTip, setShowAvatarTip] = useState(false)
  const [showNotifSheet, setShowNotifSheet] = useState(false)

  useEffect(() => {
    if (feedItems.length > 0 && !showAvatarTip) {
      AsyncStorage.getItem('hasSeenAvatarTip').then((val) => {
        if (!val) setShowAvatarTip(true)
      })
    }
  }, [feedItems.length])

  // Mark that the user has seen the feed (used by location permission logic)
  useEffect(() => {
    if (jwt) {
      AsyncStorage.setItem('squadd_has_seen_feed', '1')
    }
  }, [jwt])

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

  const handleShowRoster = useCallback(async (sessionId: number) => {
    setRosterModal(prev => ({ ...prev, visible: true, loadingId: sessionId, players: [], sessionName: '', venueName: '' }))
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

  const loadMore = useCallback(async () => {
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
    if (!reclubUserId) return
    const t0 = Date.now()
    console.log('[TheHub][PERF[PLAYERS]] ⏱ loadSuggestions started')
    setSuggestionsLoading(true)
    try {
      const tFetch = Date.now()
      const res = await authedFetch(
        `/api/players/${reclubUserId}/co-players`
      )
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
  }, [authedFetch, reclubUserId])

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

  useEffect(() => {
    if (jwt && subTab === 'feed' && !feedLoadedRef.current) {
      console.log('[FREEZE_DEBUG] initial loadFeed trigger — jwt+feed tab ready')
      feedLoadedRef.current = true
      loadFeed()
    }
  }, [jwt, subTab, loadFeed])

  useEffect(() => {
    if (jwt && subTab === 'feed') {
      loadPresence()
      const interval = setInterval(loadPresence, 60000)
      return () => clearInterval(interval)
    }
  }, [jwt, subTab, loadPresence])

  useEffect(() => {
    if (jwt && subTab === 'players' && !suggestionsLoadedRef.current) {
      setSuggestionsLoading(true)
      if (!reclubUserId) return
      suggestionsLoadedRef.current = true
      loadSuggestions()
    }
  }, [jwt, subTab, reclubUserId, loadSuggestions])

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
    [authedFetch, toast, loadFriends, prependJustFollowedFeedItem, suggestions]
  )

  useEffect(() => {
    if (jwt && subTab === 'players' && !friendsLoadedRef.current) {
      friendsLoadedRef.current = true
      loadFriends()
    }
  }, [jwt, subTab, loadFriends])

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
    [authedFetch, toast, loadFriends, prependJustFollowedFeedItem]
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
    <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <TopBar title="YOUR CIRCLE" showAvatar />

      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: '#141414',
            borderRadius: 10,
            padding: 3,
          }}
        >
          {(
            [
              { key: 'feed' as const, label: 'My Feed', Icon: Rss },
              { key: 'players' as const, label: 'Players', Icon: Users },
            ] as const
          ).map(({ key, label, Icon }) => {
            const active = subTab === key
            return (
              <TouchableOpacity
                key={key}
                onPress={() => {
                  if (key === 'players') {
                    console.log('[TheHub][PERF[PLAYERS]] ⏱ tab tapped by user')
                  } else {
                    console.log('[TheHub][PERF[FEED]] ⏱ tab tapped by user')
                  }
                  setSubTab(key)
                }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: active ? '#1e1e1e' : 'transparent',
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Icon
                  size={14}
                  color={active ? T.amber : '#555'}
                  strokeWidth={2}
                />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? '600' : '400',
                    color: active ? T.amber : '#555',
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {subTab === 'feed' && !jwt && <SignInPrompt />}

      {subTab === 'feed' && jwt && (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={feedRefreshing}
              onRefresh={handleFeedRefresh}
              tintColor={T.amber}
            />
          }
        >
          <GearTeaserCard
            height={216}
            onPress={() => onOpenGear?.()}
            gearSaved={gearSaved}
            gearSetupComplete={gearSetupComplete}
          />

          {/* Link Reclub banner */}
          {jwt && !reclubUserId && (
            <TouchableOpacity style={styles.linkReclubBanner} onPress={openProfileSheet}>
              <Text style={styles.linkReclubText}>
                Link your Reclub account to follow other players. Tap here.
              </Text>
            </TouchableOpacity>
          )}

          {/* Feed empty state */}
          {!feedLoading && !hasFollows && (
            <View style={styles.emptyState}>
              <Users size={44} color="#1e1e1e" />
              <Text style={styles.emptyText}>
                Follow players to see their activity here.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setSubTab('players')}
              >
                <Text style={styles.emptyBtnText}>Find players</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Feed loading */}
          {feedLoading && <SquaddLoader />}

          {/* Presence banners — 70/30 header row + full-width expanded content below */}
          {presence && (presence.totalLive > 0 || (presence.upcomingVenues?.length ?? 0) > 0) && (
            <View style={styles.presenceBannerWrap}>
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
                          {totalSoon} up next
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
                            <Text style={styles.soonCardBadgeText}>SOON</Text>
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
                                style={styles.soonCardJoinBtn}
                                onPress={() => venue.eventUrl && Linking.openURL(venue.eventUrl)}
                                activeOpacity={0.75}
                              >
                                <Text style={styles.soonCardJoinText}>Join too</Text>
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
            <View style={styles.noOneLive}>
              <View style={styles.noOneLiveDot} />
              <View>
                <Text style={styles.noOneLiveTitle}>Nobody on court right now</Text>
                <Text style={styles.noOneLiveSub}>Check back this evening</Text>
              </View>
            </View>
          )}

          {/* Feed items */}
          {!feedLoading && (() => {
            const livePlayerIds = new Set(
              presence?.liveVenues?.flatMap((v: any) => v.players.map((p: any) => p.userId)) ?? []
            )
            return feedItems.map((item, index) => (
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
              />
            ))
          })()}

          {!feedLoading && hasMore && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={loadMore}
              disabled={loadingMore}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color="#f5a623" />
                : <Text style={styles.loadMoreText}>Load more</Text>
              }
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {subTab === 'players' && !jwt && <SignInPrompt />}

      {subTab === 'players' && jwt && (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          {/* Link Reclub banner */}
          {!reclubUserId && (
            <TouchableOpacity style={styles.linkReclubBanner} onPress={openProfileSheet}>
              <Text style={styles.linkReclubText}>
                Link your Reclub account to follow other players. Tap here.
              </Text>
            </TouchableOpacity>
          )}

          {showSuggested ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity
                  onPress={handleCloseSearch}
                  style={styles.searchBackBtn}
                >
                  <ArrowLeft size={18} color="#999" strokeWidth={2} />
                  <Text style={{ fontSize: 14, color: '#999' }}>Back to friends</Text>
                </TouchableOpacity>
              </View>
              <PeopleYouMayKnowScreen
                onComplete={handleCloseSearch}
                embedded
              />
            </View>
          ) : showSearch ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchHeaderRow}>
                <TouchableOpacity
                  onPress={handleCloseSearch}
                  style={styles.searchBackBtn}
                >
                  <ArrowLeft size={18} color="#999" strokeWidth={2} />
                  <Text style={{ fontSize: 14, color: '#999' }}>Back to friends</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowSearch(false); setShowSuggested(true) }}
                  style={styles.suggestedBtn}
                >
                  <Sparkles size={14} color={T.amber} strokeWidth={2} />
                  <Text style={styles.suggestedLabel}>Suggested</Text>
                </TouchableOpacity>
              </View>
              <PlayerSearch
                mode="follow"
                onFollow={handleFollowFromSearch}
                onUnfollow={handleUnfollowFromSearch}
                initialFollowedIds={friends.map((f) => f.userId)}
                autoFocus
              />
            </View>
          ) : (
            <>
              {/* Find Friends bar */}
              <TouchableOpacity
                style={styles.findFriendsBar}
                onPress={() => setShowSearch(true)}
                activeOpacity={0.7}
              >
                <Search size={16} color="#666" strokeWidth={2} />
                <Text style={styles.findFriendsText}>Find friends</Text>
              </TouchableOpacity>

              {(suggestionsLoading ||
                suggestions.filter((s) => !dismissedSuggestions.has(s.userId))
                  .length > 0) && (
                <View style={styles.suggestionsSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionLabel}>CROSSED PATHS WITH</Text>
                    {!suggestionsLoading && (
                      <TouchableOpacity onPress={() => setShowSuggested(true)}>
                        <Text style={styles.sectionLink}>See all</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {suggestionsLoading ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.carouselContent}
                    >
                      {Array.from({ length: SUGGESTION_SKELETON_COUNT }).map(
                        (_, i) => (
                          <SuggestionCardSkeleton key={i} />
                        )
                      )}
                    </ScrollView>
                  ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}
                  >
                    {suggestions
                      .filter((s) => !dismissedSuggestions.has(s.userId))
                      .map((s) => {
                        const isFollowed = followedSuggestionIds.has(s.userId)
                        return (
                          <View key={s.userId} style={styles.suggestionCard}>
                            <TouchableOpacity
                              style={styles.dismissBtn}
                              onPress={() =>
                                setDismissedSuggestions(
                                  (prev) => new Set([...prev, s.userId])
                                )
                              }
                            >
                              <X size={10} color="#2a2a2a" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setSelectedPlayerId(s.userId)}
                            >
                              <PlayerAvatar
                                userId={s.userId}
                                imageUrl={s.imageUrl}
                                size={42}
                                style={styles.suggestionAvatar}
                              />
                            </TouchableOpacity>
                            <Text style={styles.suggestionName} numberOfLines={1}>
                              {s.displayName ?? 'Player'}
                            </Text>
                            <Text style={styles.suggestionSessions} numberOfLines={2}>
                              <Text style={styles.suggestionSessionsCount}>
                                {s.coSessionCount}×
                              </Text>
                              <Text style={styles.suggestionSessionsLabel}>
                                {' '}sessions together
                              </Text>
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.feedFollowBtn,
                                isFollowed && styles.feedFollowedBtn,
                              ]}
                              onPress={() =>
                                !isFollowed && handleFollowFromSuggestion(s.userId)
                              }
                              disabled={isFollowed}
                            >
                              <Text
                                style={[
                                  styles.feedFollowBtnText,
                                  isFollowed && styles.feedFollowedBtnText,
                                ]}
                              >
                                {isFollowed ? 'Following' : 'Follow'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )
                      })}
                  </ScrollView>
                  )}
                </View>
              )}

              {loadingFriends ? (
                <SquaddLoader />
              ) : friends.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 60 }}>
                  <Users size={40} color="#444" strokeWidth={1.5} />
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: '600',
                      color: '#fff',
                      marginTop: 12,
                    }}
                  >
                    No friends yet
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#888',
                      marginTop: 4,
                      textAlign: 'center',
                    }}
                  >
                    Follow players from your sessions to see them here
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={friends}
                  keyExtractor={(item) => item.userId}
                  renderItem={({ item }) => (
                    <FriendListRow
                      item={item}
                      onUnfollow={() => handleUnfollow(item.userId)}
                      onAvatarPress={() => setSelectedPlayerId(item.userId)}
                    />
                  )}
                  contentContainerStyle={{ paddingBottom: 20 }}
                />
              )}
            </>
          )}
        </View>
      )}

      <PlayerProfileSheet
        userId={selectedPlayerId}
        stub={selectedPlayerStub}
        onClose={() => { setSelectedPlayerId(null); setSelectedPlayerStub(null) }}
      />

      {/* Roster Modal — "You are playing" */}
      <Modal
        visible={rosterModal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setRosterModal(prev => ({ ...prev, visible: false }))}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }}
          onPress={() => setRosterModal(prev => ({ ...prev, visible: false }))}
        />
        <View style={styles.rosterSheet}>
          <View style={styles.rosterHandle} />
          <Text style={styles.rosterTitle} numberOfLines={1}>
            {rosterModal.sessionName || 'Session roster'}
          </Text>
          {rosterModal.venueName ? (
            <Text style={styles.rosterVenue}>{rosterModal.venueName}</Text>
          ) : null}

          {rosterModal.loadingId !== null ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#22c55e" />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
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
      </Modal>
      <NotificationPermissionSheet
        visible={showNotifSheet}
        onClose={() => setShowNotifSheet(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  findFriendsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: T.border,
    marginBottom: 16,
  },
  findFriendsText: {
    fontSize: 15,
    color: '#555',
  },
  searchHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
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
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.2)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: T.amber,
  },
  suggestionsSection: {
    marginHorizontal: -8,
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLink: { fontSize: 11, color: '#555' },
  carouselContent: { paddingHorizontal: 12, gap: 10 },
  suggestionSkeletonCard: {
    minWidth: 108,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#252525',
    borderRadius: 10,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  suggestionSkeletonAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1e1e1e',
  },
  suggestionSkeletonName: {
    width: 64,
    height: 13,
    borderRadius: 6,
    backgroundColor: '#1e1e1e',
    marginTop: 5,
    marginBottom: 4,
  },
  suggestionSkeletonSessions: {
    width: 80,
    height: 13,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    marginBottom: 6,
  },
  suggestionSkeletonBtn: {
    width: '100%',
    height: 26,
    borderRadius: 6,
    backgroundColor: '#1e1e1e',
  },
  suggestionCard: {
    minWidth: 108,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#252525',
    borderRadius: 10,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    position: 'relative',
  },
  dismissBtn: { position: 'absolute', top: 5, right: 5, zIndex: 1 },
  suggestionAvatar: { marginBottom: 0 },
  suggestionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f0f0f0',
    marginTop: 5,
    marginBottom: 2,
    textAlign: 'center',
    maxWidth: 96,
  },
  suggestionSessions: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 6,
    maxWidth: 96,
  },
  suggestionSessionsCount: {
    fontSize: 14,
    fontWeight: '700',
    color: T.amber,
  },
  suggestionSessionsLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  feedFollowBtn: {
    backgroundColor: T.amber,
    borderRadius: 6,
    paddingVertical: 5,
    width: '100%',
    alignItems: 'center',
  },
  feedFollowedBtn: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  feedFollowBtnText: { fontSize: 11, fontWeight: '500', color: '#1a0a00' },
  feedFollowedBtnText: { fontSize: 11, fontWeight: '600', color: '#22c55e' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyBtn: {
    backgroundColor: T.amber,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: 4,
  },
  emptyBtnText: { fontSize: 11, fontWeight: '600', color: '#1a0a00' },
  linkReclubBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#1a1200',
    borderWidth: 0.5,
    borderColor: T.amber,
    borderRadius: 10,
    padding: 12,
  },
  linkReclubText: {
    fontSize: 12,
    color: T.amber,
    lineHeight: 17,
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
    backgroundColor: '#1a1200',
    borderWidth: 0.5,
    borderColor: '#7a5000',
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 6,
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
    backgroundColor: '#1a1200',
    borderBottomColor: 'rgba(122,80,0,0.15)',
  },
  soonCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#1a1200',
    borderWidth: 0.5,
    borderColor: '#7a5000',
    borderRadius: 14,
    overflow: 'hidden',
  },
  soonCardHeader: {
    backgroundColor: '#1f1500',
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
    color: '#a06000',
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
    borderColor: '#0a0a0a',
    overflow: 'hidden',
  },
  soonCardAvFallback: {
    backgroundColor: '#2a1a00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonCardAvInitial: {
    fontSize: 10,
    fontWeight: '600',
    color: T.amber,
  },
  soonCardAvMore: {
    backgroundColor: '#141414',
    borderColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soonCardAvMoreText: {
    fontSize: 8,
    color: '#555',
  },
  soonCardCircleInfo: {
    fontSize: 10,
    color: '#555',
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
  },
  soonCardCircleNames: {
    color: T.amber,
    fontWeight: '500',
  },
  soonCardJoinBtn: {
    backgroundColor: T.amber,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
    alignSelf: 'center',
  },
  soonCardJoinText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1a0a00',
  },
  soonCardShowMeBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  soonCardShowMeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
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
    color: '#7a5000',
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
    color: '#7a5000',
  },
  presenceBanner: {
    backgroundColor: '#0a1f0a',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
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
    backgroundColor: '#1D9E75',
    flexShrink: 0,
  },
  presenceBannerText: {
    flex: 1,
  },
  presenceBannerTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5DCAA5',
  },
  presenceBannerSub: {
    fontSize: 10,
    color: '#0F6E56',
    marginTop: 1,
  },
  presenceBannerCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1D9E75',
    flexShrink: 0,
  },
  presenceChevron: {
    fontSize: 14,
    color: '#1D9E75',
    flexShrink: 0,
  },
  presenceChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  presenceVenueList: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(29,158,117,0.2)',
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
    borderBottomColor: 'rgba(29,158,117,0.1)',
  },
  presenceVenueLeft: {
    flex: 1,
    marginRight: 8,
  },
  presenceVenueName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5DCAA5',
  },
  presenceVenueWho: {
    fontSize: 9,
    color: '#0F6E56',
    marginTop: 1,
  },
  presenceVenueRight: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  endingSoonPill: {
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: '#f5a623',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  endingSoonText: {
    fontSize: 9,
    color: '#f5a623',
    fontWeight: '500',
  },
  endsAtText: {
    fontSize: 9,
    color: '#2a5a3a',
  },
  noOneLive: {
    marginHorizontal: 12,
    marginBottom: 10,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noOneLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
    flexShrink: 0,
  },
  noOneLiveTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#444',
  },
  noOneLiveSub: {
    fontSize: 10,
    color: '#2a2a2a',
    marginTop: 1,
  },
  // ── Roster modal ──────────────────────────────────────────────
  rosterSheet: {
    backgroundColor: '#0e0e0e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Dimensions.get('window').height * 0.88,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  rosterHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 16,
  },
  rosterTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  rosterVenue: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
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
    width: 91,
    height: 91,
    borderRadius: 46,
    backgroundColor: '#222',
    marginBottom: 6,
  },
  rosterName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  rosterFollowBtnDone: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  rosterFollowBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  rosterFollowBtnTextDone: {
    color: '#555',
  },
  loadMoreBtn: {
    padding: 16,
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 13,
    color: '#555',
  },
})
