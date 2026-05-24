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
} from 'react-native'
import { Rss, Users, Search, ArrowLeft, Sparkles, X } from 'lucide-react-native'
import { TopBar } from '../components/CardBody'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { SignInPrompt } from '../components/SignInPrompt'
import { PlayerSearch } from '../components/PlayerSearch'
import { PlayerAvatar } from '../components/PlayerAvatar'
import { FriendListRow } from '../components/FriendListRow'
import { FeedItemRow } from '../components/FeedItemRow'
import { PlayerProfileSheet } from '../components/PlayerProfileSheet'
import { useToast } from '../components/Toast'
import { PeopleYouMayKnowScreen } from './PeopleYouMayKnowScreen'
import type { FeedItem, CoPlayerSuggestion } from '../data'

type CircleSubTab = 'feed' | 'players'

type FollowedPlayer = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  followedAt: string
}

export function CircleScreen() {
  const [subTab, setSubTab] = useState<CircleSubTab>('feed')
  const [friends, setFriends] = useState<FollowedPlayer[]>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const feedLoadedRef = useRef(false)
  const friendsLoadedRef = useRef(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showSuggested, setShowSuggested] = useState(false)

  const { authedFetch, jwt, ensureServerAuth, reclubUserId } = useAuthStore()
  const toast = useToast((s) => s.show)

  // ── Feed state ──────────────────────────────────────────────────────────────
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedRefreshing, setFeedRefreshing] = useState(false)
  const [hasFollows, setHasFollows] = useState(true)
  const [suggestions, setSuggestions] = useState<CoPlayerSuggestion[]>([])
  const [followedSuggestionIds, setFollowedSuggestionIds] = useState<Set<string>>(new Set())
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set()
  )

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
    }
  }, [authedFetch, reclubUserId])

  useEffect(() => {
    if (jwt && subTab === 'feed' && !feedLoadedRef.current) {
      feedLoadedRef.current = true
      loadFeed()
      loadSuggestions()
    }
  }, [jwt, subTab, loadFeed, loadSuggestions])

  const handleFeedRefresh = useCallback(async () => {
    setFeedRefreshing(true)
    await loadFeed()
    setFeedRefreshing(false)
  }, [loadFeed])

  const handleFollowFromFeed = useCallback(
    async (userId: string) => {
      // Optimistic update — show "Following" immediately, no feed reload
      setFollowedSuggestionIds((prev) => new Set(prev).add(userId))
      try {
        const res = await authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Follow failed')
        toast('Followed!', 'success')
        // Silently refresh friends list in the background
        friendsLoadedRef.current = false
        loadFriends()
      } catch {
        // Roll back
        setFollowedSuggestionIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
        toast('Failed to follow. Try again.', 'error')
      }
    },
    [authedFetch, toast, loadFriends]
  )

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
    async (userId: string) => {
      try {
        const res = await authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
        if (!res.ok) throw new Error('Follow failed')
        toast('Followed!', 'success')
        loadFriends()
      } catch {
        toast('Failed to follow. Try again.', 'error')
        throw new Error('Follow failed')
      }
    },
    [authedFetch, toast, loadFriends]
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
      <TopBar
        supertitle="Your community"
        title="Circle"
        showAvatar
      />

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
          {/* Suggestions carousel */}
          {suggestions.filter((s) => !dismissedSuggestions.has(s.userId))
            .length > 0 && (
            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>CROSSED PATHS WITH</Text>
                <TouchableOpacity
                  onPress={() => setShowSuggested(true)}
                >
                  <Text style={styles.sectionLink}>See all</Text>
                </TouchableOpacity>
              </View>
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
                        <TouchableOpacity onPress={() => setSelectedPlayerId(s.userId)}>
                          <PlayerAvatar
                            userId={s.userId}
                            imageUrl={s.imageUrl}
                            size={42}
                            style={styles.suggestionAvatar}
                          />
                        </TouchableOpacity>
                        <Text style={styles.suggestionDupr}>
                          {s.duprDoubles?.toFixed(2) ?? '–'}
                        </Text>
                        <Text style={styles.suggestionName} numberOfLines={1}>
                          {s.displayName ?? 'Player'}
                        </Text>
                        <Text style={styles.suggestionCtx} numberOfLines={2}>
                          {s.coSessionCount}× sessions together
                        </Text>
                        <TouchableOpacity
                          style={[styles.feedFollowBtn, isFollowed && styles.feedFollowedBtn]}
                          onPress={() => !isFollowed && handleFollowFromFeed(s.userId)}
                          disabled={isFollowed}
                        >
                          <Text style={[styles.feedFollowBtnText, isFollowed && styles.feedFollowedBtnText]}>
                            {isFollowed ? 'Following' : 'Follow'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
              </ScrollView>
            </View>
          )}

          <View style={styles.feedDivider} />

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

          {/* Feed items */}
          {!feedLoading &&
            feedItems.map((item) => (
              <FeedItemRow
                key={item.id}
                item={item}
                onJoinToo={(eventUrl) => Linking.openURL(eventUrl)}
                onAvatarPress={(uid) => setSelectedPlayerId(uid)}
              />
            ))}
        </ScrollView>
      )}

      {subTab === 'players' && !jwt && <SignInPrompt />}

      {subTab === 'players' && jwt && (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
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
        onClose={() => setSelectedPlayerId(null)}
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
  // ── Feed styles ─────────────────────────────────────────────────────────────
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
  suggestionCard: {
    minWidth: 100,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    position: 'relative',
  },
  dismissBtn: { position: 'absolute', top: 5, right: 5 },
  suggestionAvatar: { marginBottom: 2 },
  suggestionDupr: { fontSize: 11, fontWeight: '500', color: T.amber },
  suggestionName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ddd',
    marginVertical: 1,
    textAlign: 'center',
  },
  suggestionCtx: {
    fontSize: 10,
    color: '#444',
    marginBottom: 5,
    lineHeight: 14,
    textAlign: 'center',
  },
  feedFollowBtn: {
    backgroundColor: T.amber,
    borderRadius: 6,
    paddingVertical: 4,
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
  feedDivider: { height: 0.5, backgroundColor: '#111', marginBottom: 6 },
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
})
