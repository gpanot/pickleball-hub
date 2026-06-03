import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  X,
  RotateCcw,
  Heart,
  RefreshCw,
  AlertCircle,
  Inbox,
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { T } from '../theme'
import { type Session, averageDupr } from '../data'
import { LockedFriendsRow } from '../components/LockedFriendsRow'
import { AnimatedSwipeCard, SecondaryCard } from '../components/SwipeDeckCards'
import { FriendsListModal } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import { SwipeFilterBar, SwipeFilterSheet } from '../components/SwipeFilterControls'
import { SquaddLoader } from '../components/SquaddLoader'
import { PlayerProfileSheet } from '../components/PlayerProfileSheet'

function vnDateString(offsetDays: number): string {
  const now = new Date()
  now.setTime(now.getTime() + (7 * 60 + offsetDays * 24 * 60) * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

type Props = {
  onClose: () => void
}

export function ExploreSessionsScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets()
  const { openSignUp } = useSignUpModal()
  const signedIn = useAuthStore((s) => s.isSignedIn)()
  const auth = useAuthStore.getState()
  const dateFilter = useUiStore((s) => s.swipeDateFilter)

  const [filterModalVisible, setFilterModalVisible] = useState(false)
  const [filterOpenKey, setFilterOpenKey] = useState(0)
  const [vibeFilter, setVibeFilter] = useState<'social' | 'competitive' | null>(null)
  const [spotsOnly, setSpotsOnly] = useState(false)

  const allSessions = useSessionStore((s) => s.sessions)
  const savedIds = useSessionStore((s) => s.savedIds)
  const loading = useSessionStore((s) => s.loading)
  const error = useSessionStore((s) => s.error)
  const hasMore = useSessionStore((s) => s.hasMore)
  const totalCount = useSessionStore((s) => s.totalCount)
  const { fetchSessions, saveSession, unsaveSession, resetDeck, prefetchNextBatch } =
    useSessionStore.getState()

  const locationRef = useRef({ lat: 10.78, lng: 106.69 })
  const [refreshing, setRefreshing] = useState(false)
  const [viewIdx, setViewIdx] = useState(0)
  const [viewHistory, setViewHistory] = useState<{ id: number; saved: boolean }[]>([])
  const [friendsModal, setFriendsModal] = useState<{
    visible: boolean
    title: string
    subtitle?: string
    friends: FriendListItem[]
    overflowNote?: string
    showFollow?: boolean
  }>({ visible: false, title: '', friends: [] })
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null)

  const deck = useMemo(
    () => allSessions.filter((s) => !savedIds.has(s.id)),
    [allSessions, savedIds],
  )

  const displayDeck = useMemo(() => {
    let result = deck
    if (vibeFilter) result = result.filter((s) => s.vibeTag === vibeFilter)
    if (spotsOnly) result = result.filter((s) => s.spotsLeft >= 3)
    return result
  }, [deck, vibeFilter, spotsOnly])

  useEffect(() => {
    setViewIdx(0)
    setViewHistory([])
  }, [displayDeck.length])

  useEffect(() => {
    setViewIdx(0)
    setViewHistory([])
    const date = dateFilter === 'tomorrow' ? vnDateString(1) : undefined
    fetchSessions(locationRef.current.lat, locationRef.current.lng, date)
  }, [dateFilter, fetchSessions])

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

  const openTopDupr = useCallback((session: Session) => {
    if (!signedIn) return
    const topPlayers = session.roster
      .filter((p) => p.duprDoubles != null && p.duprDoubles > 0)
      .sort((a, b) => (b.duprDoubles ?? 0) - (a.duprDoubles ?? 0))
      .slice(0, 8)
    const avg = averageDupr(topPlayers)
    const title =
      avg != null
        ? `Top 8 DUPR joining - Avge. ${avg.toFixed(2)}`
        : 'Top 8 DUPR joining'
    const duprCount = session.roster.filter(
      (p) => p.duprDoubles != null && p.duprDoubles > 0,
    ).length
    const duprPct =
      session.roster.length > 0
        ? Math.round((duprCount / session.roster.length) * 100)
        : null

    const lines: string[] = []
    if (duprPct != null) lines.push(`${duprPct}% of the players have a DUPR rating`)
    if (session.duprRange) lines.push(`DUPR : ${session.duprRange.min.toFixed(1)} – ${session.duprRange.max.toFixed(1)}`)
    if (session.returningPlayerPct != null) lines.push(`${Math.round(session.returningPlayerPct)}% are regulars`)
    if (session.vibeTag) lines.push(`Vibe : ${session.vibeTag.charAt(0).toUpperCase() + session.vibeTag.slice(1)}`)
    const subtitle = lines.length > 0 ? lines.join('\n') : undefined

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
  }, [signedIn])

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

  const lockedFriends = !signedIn ? (
    <LockedFriendsRow onPress={openSignUp} />
  ) : undefined

  const doneMessage = (() => {
    if (displayDeck.length === 0) return "You've seen all sessions."
    const hours = displayDeck.map((s) => parseInt(s.startTime.split(':')[0], 10))
    const maxHour = Math.max(...hours)
    if (maxHour >= 17) return "You've seen all games tonight."
    if (maxHour < 12) return "You've seen all morning sessions."
    return "You've seen all sessions for today."
  })()

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back to top 5"
        >
          <ChevronLeft size={22} color="#aaa" strokeWidth={2} />
          <Text style={styles.backText}>Top 5</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Explore sessions</Text>
        {total > 0 ? (
          <Text style={styles.counter}>
            {viewIdx + (viewIdx < total ? 1 : 0)}/{totalCount ?? total}
          </Text>
        ) : (
          <View style={styles.counterPlaceholder} />
        )}
      </View>

      <SwipeFilterBar
        onFiltersPress={() => {
          setFilterOpenKey((k) => k + 1)
          setFilterModalVisible(true)
        }}
      />

      {loading && total === 0 && !error ? (
        <View style={styles.centered}>
          <SquaddLoader />
          <Text style={styles.loadingText}>Loading sessions...</Text>
        </View>
      ) : loading && total > 0 ? (
        <View style={styles.centered}>
          <SquaddLoader />
          <Text style={styles.loadingText}>Updating sessions...</Text>
        </View>
      ) : error && total === 0 ? (
        <View style={[styles.centered, styles.centeredPad]}>
          <AlertCircle size={40} color="#666" strokeWidth={1.5} />
          <Text style={styles.errorTitle}>Couldn't load sessions</Text>
          <Text style={styles.errorSub}>Check your connection and try again</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.retryBtn}>
            <RefreshCw size={16} color="#0B0B0C" strokeWidth={2} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !loading && displayDeck.length === 0 && !error ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.centeredPad}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.amber} />
          }
        >
          <Inbox size={48} color="#444" strokeWidth={1.5} style={{ marginBottom: 16 }} />
          <Text style={styles.errorTitle}>No sessions available</Text>
          <Text style={styles.errorSub}>Pull down to refresh, or check back later</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.amber} />
          }
        >
          {isDone ? (
            <View style={styles.doneWrap}>
              <CheckCircle2 size={48} color="#444" strokeWidth={1.5} style={{ marginBottom: 16 }} />
              <Text style={styles.doneText}>{doneMessage}</Text>
              <TouchableOpacity onPress={handleStartOver} style={styles.startOverBtn}>
                <Text style={styles.startOverText}>Start over</Text>
              </TouchableOpacity>
            </View>
          ) : (
            current && (
              <>
                <AnimatedSwipeCard
                  key={`explore-card-${viewIdx}-${current.id}`}
                  s={current}
                  onSkip={handleSkip}
                  onSave={handleSave}
                  isSignedIn={signedIn}
                  lockedFriendsSlot={lockedFriends}
                  onSignIn={openSignUp}
                  onFriendsPress={() => openSessionFriends(current)}
                  onTopDuprPress={() => openTopDupr(current)}
                />

                <View style={styles.actions}>
                  <TouchableOpacity onPress={handleSkip} style={styles.actionSkip}>
                    <X size={24} color="#777" strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleUndo}
                    style={[styles.actionUndo, { opacity: viewHistory.length ? 1 : 0.35 }]}
                  >
                    <RotateCcw size={18} color="#888" strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} style={styles.actionSave}>
                    <Heart size={28} color="#0B0B0C" fill="#0B0B0C" strokeWidth={2} />
                  </TouchableOpacity>
                </View>

                {upNext.length > 0 && (
                  <View>
                    <Text style={styles.upNextLabel}>Up next</Text>
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

      <FriendsListModal
        visible={friendsModal.visible}
        onClose={() => setFriendsModal((m) => ({ ...m, visible: false }))}
        title={friendsModal.title}
        subtitle={friendsModal.subtitle}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
        onFollow={friendsModal.showFollow ? handleFollowFromTopDupr : undefined}
        onAvatarPress={(userId) => setProfilePlayerId(userId)}
        onRecommendedAvatarPress={(userId) => setProfilePlayerId(userId)}
      />

      <PlayerProfileSheet
        userId={profilePlayerId}
        onClose={() => setProfilePlayerId(null)}
      />

      <SwipeFilterSheet
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        locationRef={locationRef}
        filterOpenKey={filterOpenKey}
        vibeFilter={vibeFilter}
        setVibeFilter={setVibeFilter}
        spotsOnly={spotsOnly}
        setSpotsOnly={setSpotsOnly}
        onApplied={() => {
          setViewIdx(0)
          setViewHistory([])
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 8,
  },
  backText: {
    fontSize: 13,
    color: '#aaa',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  counter: {
    fontSize: 12,
    color: '#666',
    minWidth: 48,
    textAlign: 'right',
  },
  counterPlaceholder: {
    width: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredPad: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 13,
    color: '#666',
    marginTop: 12,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.amber,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B0B0C',
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  doneWrap: {
    alignItems: 'center',
    paddingVertical: 56,
  },
  doneText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 24,
    textAlign: 'center',
  },
  startOverBtn: {
    backgroundColor: T.amber,
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  startOverText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B0B0C',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
    marginVertical: 16,
  },
  actionSkip: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionUndo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSave: {
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
  },
  upNextLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
})
