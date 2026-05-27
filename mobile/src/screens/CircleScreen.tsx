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
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Rss, Users, Search, ArrowLeft, Sparkles, X } from 'lucide-react-native'
import { TopBar } from '../components/CardBody'
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

export function CircleScreen({ onOpenGear, gearSaved }: { onOpenGear?: () => void; gearSaved?: boolean }) {
  const [subTab, setSubTab] = useState<CircleSubTab>('feed')
  const [friends, setFriends] = useState<FollowedPlayer[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedPlayerStub, setSelectedPlayerStub] = useState<import('../components/PlayerProfileSheet').PlayerProfileStub | null>(null)

  const feedLoadedRef = useRef(false)
  const friendsLoadedRef = useRef(false)
  const suggestionsLoadedRef = useRef(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSuggested, setShowSuggested] = useState(false)

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

  useEffect(() => {
    if (feedItems.length > 0 && !showAvatarTip) {
      AsyncStorage.getItem('hasSeenAvatarTip').then((val) => {
        if (!val) setShowAvatarTip(true)
      })
    }
  }, [feedItems.length])

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

  const loadFeed = useCallback(async () => {
    if (!jwt) return
    await ensureServerAuth()
    setFeedLoading(true)
    try {
      const res = await authedFetch('/api/feed')
      if (res.ok) {
        const data = await res.json()
        setFeedItems(data.items ?? [])
        setHasFollows(data.hasFollows ?? true)
      }
    } catch (e) {
      if (__DEV__) console.warn('[Feed] loadFeed', e)
    } finally {
      setFeedLoading(false)
    }
  }, [authedFetch, jwt, ensureServerAuth])

  const loadSuggestions = useCallback(async () => {
    if (!reclubUserId) return
    setSuggestionsLoading(true)
    try {
      const res = await authedFetch(
        `/api/players/${reclubUserId}/co-players`
      )
      if (res.ok) {
        const data = await res.json()
        setSuggestions(
          (data.coPlayers ?? []).slice(0, 8).map((p: any) => ({
            ...p,
            venueName: 'a nearby club',
          }))
        )
      }
    } catch (e) {
      if (__DEV__) console.warn('[Feed] loadSuggestions', e)
    } finally {
      setSuggestionsLoading(false)
    }
  }, [authedFetch, reclubUserId])

  const loadPresence = useCallback(async () => {
    if (!jwt) return
    try {
      const res = await authedFetch('/api/feed/presence')
      const data = await res.json()
      setPresence(data)
    } catch {}
  }, [jwt, authedFetch])

  useEffect(() => {
    if (jwt && subTab === 'feed' && !feedLoadedRef.current) {
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
    await ensureServerAuth()
    setLoadingFriends(true)
    try {
      const res = await authedFetch('/api/follows')
      if (res.ok) {
        const list = await res.json()
        setFriends(list)
        if (__DEV__) {
          console.log('[Profile] friends loaded', list.length)
        }
      } else if (__DEV__) {
        const body = await res.text()
        console.warn('[Profile] GET /api/follows', res.status, body)
      }
    } catch (e) {
      if (__DEV__) console.warn('[Profile] loadFriends', e)
    } finally {
      setLoadingFriends(false)
    }
  }, [authedFetch, jwt, ensureServerAuth])

  const prependJustFollowedFeedItem = useCallback(
    (
      userId: string,
      displayName: string | null,
      imageUrl: string | null,
      duprDoubles: number | null
    ) => {
      const newItem: FeedItem = {
        id: `follow_${userId}_${Date.now()}`,
        type: 'just_followed' as FeedItemType,
        player: {
          userId,
          displayName,
          imageUrl,
          duprDoubles,
        },
        isFollowing: true,
        timestamp: new Date().toISOString(),
      }
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
        feedLoadedRef.current = false
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
                onPress={() => setSubTab(key)}
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
          {feedLoading && (
            <ActivityIndicator color={T.amber} style={{ marginTop: 40 }} />
          )}

          {/* Presence banners — horizontal scroll, each card ~80% width */}
          {presence && (presence.totalLive > 0 || (presence.upcomingVenues?.length ?? 0) > 0) && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={screenWidth * 0.82 + 8}
              snapToAlignment="start"
              contentContainerStyle={styles.presenceBannerRail}
            >
              {/* On Court card */}
              {presence.totalLive > 0 && (
                <View style={[styles.presenceBanner, { width: screenWidth * 0.82 }]}>
                  <TouchableOpacity
                    style={styles.presenceBannerHeader}
                    onPress={() => setPresenceExpanded((prev) => !prev)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.presenceDot} />
                    <View style={styles.presenceBannerText}>
                      <Text style={styles.presenceBannerTitle}>
                        {presence.totalLive} from your circle{' '}
                        {presence.totalLive === 1 ? 'is' : 'are'} on court
                      </Text>
                      <Text style={styles.presenceBannerSub}>
                        Right now · across {presence.liveVenues.length}{' '}
                        {presence.liveVenues.length === 1 ? 'venue' : 'venues'}
                      </Text>
                    </View>
                    <Text style={styles.presenceBannerCount}>{presence.totalLive}</Text>
                    <Text style={[styles.presenceChevron, presenceExpanded && styles.presenceChevronOpen]}>▾</Text>
                  </TouchableOpacity>

                  {presenceExpanded && (
                    <View style={styles.presenceVenueList}>
                      {presence.liveVenues.map((venue: any, index: number) => {
                        const minsLeft = Math.floor(
                          (new Date(venue.endTime).getTime() - Date.now()) / 60000
                        )
                        const endingSoon = minsLeft > 0 && minsLeft <= 60
                        const friendName =
                          venue.players?.[0]?.displayName?.split(' ')[0] ?? 'Someone'
                        const extraFriends =
                          venue.circleCount > 1 ? ` +${venue.circleCount - 1} more` : ''
                        return (
                          <View
                            key={venue.sessionId}
                            style={[
                              styles.presenceVenueRow,
                              index === presence.liveVenues.length - 1 && { borderBottomWidth: 0 },
                            ]}
                          >
                            <View style={styles.presenceVenueLeft}>
                              <Text style={styles.presenceVenueName} numberOfLines={1}>
                                {venue.venueName}
                              </Text>
                              <Text style={styles.presenceVenueWho}>
                                {friendName}{extraFriends} from your circle
                              </Text>
                            </View>
                            <View style={styles.presenceVenueRight}>
                              {endingSoon ? (
                                <View style={styles.endingSoonPill}>
                                  <Text style={styles.endingSoonText}>⚡ {minsLeft}m left</Text>
                                </View>
                              ) : (
                                <Text style={styles.endsAtText}>
                                  Ends {formatClock(venue.endTime)}
                                </Text>
                              )}
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Playing Soon card */}
              {(presence.upcomingVenues?.length ?? 0) > 0 && (() => {
                const totalSoon = presence.upcomingVenues.reduce(
                  (acc: number, v: any) => acc + (v.circleCount ?? 1), 0
                )
                return (
                  <View style={[styles.soonBanner, { width: screenWidth * 0.82 }]}>
                    <TouchableOpacity
                      style={styles.soonBannerHeader}
                      onPress={() => setExpandedUpcomingId(expandedUpcomingId === -1 ? null : -1)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.soonDot} />
                      <View style={styles.presenceBannerText}>
                        <Text style={styles.soonBannerTitle}>
                          {totalSoon} from your circle{' '}
                          {totalSoon === 1 ? 'is' : 'are'} playing soon
                        </Text>
                        <Text style={styles.soonBannerSub}>
                          Next 4 hours · across {presence.upcomingVenues.length}{' '}
                          {presence.upcomingVenues.length === 1 ? 'venue' : 'venues'}
                        </Text>
                      </View>
                      <Text style={styles.soonBannerCount}>{totalSoon}</Text>
                      <Text style={[styles.soonChevron, expandedUpcomingId === -1 && styles.presenceChevronOpen]}>▾</Text>
                    </TouchableOpacity>

                    {expandedUpcomingId === -1 && (
                      <View style={styles.presenceVenueList}>
                        {presence.upcomingVenues.map((venue: any, index: number) => {
                          const friendName =
                            venue.players?.[0]?.displayName?.split(' ')[0] ?? 'Someone'
                          const extraFriends =
                            venue.circleCount > 1 ? ` +${venue.circleCount - 1} more` : ''
                          return (
                            <View
                              key={venue.sessionId}
                              style={[
                                styles.presenceVenueRow,
                                index === presence.upcomingVenues.length - 1 && { borderBottomWidth: 0 },
                              ]}
                            >
                              <View style={styles.presenceVenueLeft}>
                                <Text style={styles.soonVenueName} numberOfLines={1}>
                                  {venue.venueName}
                                </Text>
                                <Text style={styles.presenceVenueWho}>
                                  {friendName}{extraFriends} from your circle
                                </Text>
                              </View>
                              <View style={styles.presenceVenueRight}>
                                <Text style={styles.soonStartsAt}>
                                  Starts {formatClock(venue.startTime)}
                                </Text>
                              </View>
                            </View>
                          )
                        })}
                      </View>
                    )}
                  </View>
                )
              })()}
            </ScrollView>
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
              presence?.liveVenues.flatMap((v: any) => v.players.map((p: any) => p.userId)) ?? []
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
              />
            ))
          })()}
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
                <ActivityIndicator
                  size="large"
                  color={T.amber}
                  style={{ marginTop: 40 }}
                />
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
  presenceBannerRail: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  soonBanner: {
    backgroundColor: '#1a1200',
    borderWidth: 0.5,
    borderColor: '#7a5000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  soonBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 8,
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
    paddingTop: 8,
    paddingBottom: 4,
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
})
