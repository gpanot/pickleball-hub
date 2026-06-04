import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { UserPlus, Check, AlertCircle, RefreshCw } from 'lucide-react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { PlayerAvatar } from '../components/PlayerAvatar'

type CoPlayer = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  coSessionCount: number
}

type LastSession = {
  sessionId: number
  name: string
  startTime: string
  clubName: string
  roster: {
    userId: string
    displayName: string | null
    imageUrl: string | null
    duprDoubles: number | null
  }[]
}

function createSkeletonStyles(T: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: T.borderSubtle,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: T.borderSubtle,
    },
    lineWide: {
      height: 13,
      borderRadius: 6,
      backgroundColor: T.borderSubtle,
      width: '60%',
    },
    lineNarrow: {
      height: 11,
      borderRadius: 6,
      backgroundColor: T.input,
      width: '40%',
    },
    btn: {
      width: 72,
      height: 34,
      borderRadius: 8,
      backgroundColor: T.borderSubtle,
    },
  })
}

function SkeletonRow() {
  const T = useTheme()
  const skeletonStyles = useMemo(() => createSkeletonStyles(T), [T])
  return (
    <View style={skeletonStyles.row}>
      <View style={skeletonStyles.avatar} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={skeletonStyles.lineWide} />
        <View style={skeletonStyles.lineNarrow} />
      </View>
      <View style={skeletonStyles.btn} />
    </View>
  )
}

export function PeopleYouMayKnowScreen({
  onComplete,
  embedded = false,
  onPlayerPress,
}: {
  onComplete: () => void
  embedded?: boolean
  onPlayerPress?: (userId: string) => void
}) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const skeletonStyles = useMemo(() => createSkeletonStyles(T), [T])
  const insets = useSafeAreaInsets()
  const { authedFetch, reclubUserId, ensureServerAuth } = useAuthStore()
  // Split loading: coPlayers and sessions load independently
  const [coPlayersLoading, setCoPlayersLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [lastSessions, setLastSessions] = useState<LastSession[]>([])
  const [coPlayers, setCoPlayers] = useState<CoPlayer[]>([])
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set())

  const loadExistingFollows = useCallback(async () => {
    try {
      const res = await authedFetch('/api/follows')
      if (res.ok) {
        const list = (await res.json()) as { userId: string }[]
        setFollowedIds(new Set(list.map((f) => f.userId)))
      }
    } catch {
      // non-fatal
    }
  }, [authedFetch])

  const loadData = useCallback(async () => {
    if (!reclubUserId) {
      setCoPlayersLoading(false)
      setSessionsLoading(false)
      return
    }
    setError(false)
    try {
      const res = await authedFetch(`/api/players/${reclubUserId}/co-players`)
      if (res.ok) {
        const data = await res.json()
        // Show coPlayers first as soon as they arrive
        setCoPlayers(data.coPlayers ?? [])
        setCoPlayersLoading(false)
        setLastSessions(data.lastSessions ?? [])
        setSessionsLoading(false)
      } else {
        setError(true)
        setCoPlayersLoading(false)
        setSessionsLoading(false)
      }
    } catch {
      setError(true)
      setCoPlayersLoading(false)
      setSessionsLoading(false)
    }
  }, [authedFetch, reclubUserId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await ensureServerAuth()
      if (cancelled) return
      setAuthReady(ok)
      if (!reclubUserId) {
        setCoPlayersLoading(false)
        setSessionsLoading(false)
        return
      }
      // Run follows fetch and data fetch in parallel
      await Promise.all([
        ok ? loadExistingFollows() : Promise.resolve(),
        loadData(),
      ])
    })()
    return () => {
      cancelled = true
    }
  }, [reclubUserId, ensureServerAuth, loadExistingFollows, loadData])

  const handleFollow = useCallback(
    async (userId: string) => {
      if (!authReady) {
        const ok = await ensureServerAuth()
        setAuthReady(ok)
        if (!ok) {
          if (__DEV__) console.warn('[PeopleYouMayKnow] follow blocked: no server auth')
          return
        }
      }

      setFollowedIds((prev) => new Set(prev).add(userId))
      try {
        const res = await authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
        const body = await res.text()
        if (__DEV__) {
          console.log('[PeopleYouMayKnow] POST /api/follows', userId, res.status, body)
        }
        if (!res.ok) throw new Error(`Follow failed: ${res.status} ${body}`)
      } catch (e) {
        if (__DEV__) console.warn('[PeopleYouMayKnow] follow error', userId, e)
        setFollowedIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
      }
    },
    [authedFetch, authReady, ensureServerAuth]
  )

  const topPad = embedded ? 0 : insets.top + 12

  if (!reclubUserId && !coPlayersLoading) {
    return (
      <View style={[styles.container, { paddingTop: embedded ? 20 : insets.top + 40, alignItems: 'center' }]}>
        <Text style={styles.heading}>No Reclub profile linked</Text>
        <Text style={{ fontSize: 13, color: T.muted, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 }}>
          Link your Reclub account in settings to see people you've played with
        </Text>
        <TouchableOpacity style={[styles.skipBtn, { marginTop: 16 }]} onPress={onComplete}>
          <Text style={styles.skipLabel}>Continue</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, paddingHorizontal: embedded ? 0 : 20 }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Purpose text — always shown immediately */}
        <Text style={styles.purposeText}>
          Follow players you've played with. You'll see their games in your
          feed, join the same sessions, and get alerts when they book a court.
        </Text>

        {/* People you may know — shown first, with skeleton while loading */}
        <View style={{ marginBottom: 24 }}>
          <Text style={styles.heading}>People you may know</Text>
          <Text style={styles.subheading}>
            Tap Follow on anyone you want to keep track of
          </Text>
          {coPlayersLoading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : error ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
              <AlertCircle size={32} color={T.muted} strokeWidth={1.5} />
              <Text style={{ fontSize: 13, color: T.muted, textAlign: 'center' }}>
                Couldn't load suggestions
              </Text>
              <TouchableOpacity
                onPress={loadData}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: T.amber,
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                }}
              >
                <RefreshCw size={14} color="#0B0B0C" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0B0B0C' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : coPlayers.length === 0 ? (
            <Text style={{ fontSize: 13, color: T.textTertiary, marginTop: 8 }}>
              No suggestions yet — play more sessions on Reclub to discover people.
            </Text>
          ) : (
            coPlayers.map((p) => {
              const isFollowed = followedIds.has(p.userId)
              return (
                <View key={p.userId} style={styles.coPlayerRow}>
                  <TouchableOpacity onPress={() => onPlayerPress?.(p.userId)} activeOpacity={0.7}>
                    <PlayerAvatar
                      userId={p.userId}
                      displayName={p.displayName}
                      imageUrl={p.imageUrl}
                      size={48}
                    />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coName}>
                      {p.displayName ?? 'Unknown'}
                    </Text>
                    <Text style={styles.coMeta}>
                      {p.coSessionCount} session
                      {p.coSessionCount !== 1 ? 's' : ''} together
                      {p.duprDoubles != null
                        ? ` · DUPR ${p.duprDoubles.toFixed(1)}`
                        : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.followBtn,
                      isFollowed && styles.followedBtn,
                    ]}
                    onPress={() => handleFollow(p.userId)}
                    disabled={isFollowed}
                  >
                    {isFollowed ? (
                      <Text style={styles.followedLabel}>Following</Text>
                    ) : (
                      <Text style={styles.followLabel}>Follow</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )
            })
          )}
        </View>

        {/* Your recent sessions — shown below, with its own skeleton */}
        <View style={{ marginBottom: 24 }}>
          <Text style={styles.heading}>Your recent sessions</Text>
          <Text style={styles.subheading}>
            Players from games you've already joined
          </Text>
          {sessionsLoading ? (
            <View style={{ paddingTop: 8 }}>
              <View style={[skeletonStyles.lineWide, { marginBottom: 10, height: 56, borderRadius: 12, width: '100%', backgroundColor: T.surface }]} />
              <View style={[skeletonStyles.lineWide, { height: 56, borderRadius: 12, width: '100%', backgroundColor: T.surface }]} />
            </View>
          ) : lastSessions.length === 0 ? (
            <Text style={{ fontSize: 13, color: T.textTertiary, marginTop: 8 }}>
              No recent sessions found on Reclub.
            </Text>
          ) : (
            lastSessions.map((session) => (
              <View key={session.sessionId} style={styles.sessionCard}>
                <Text style={styles.sessionName}>{session.name}</Text>
                <Text style={styles.sessionMeta}>
                  {session.clubName} · {session.startTime}
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10 }}
                >
                  {session.roster.map((p) => {
                    const isFollowed = followedIds.has(p.userId)
                    return (
                      <View key={p.userId} style={styles.rosterItem}>
                        <TouchableOpacity onPress={() => onPlayerPress?.(p.userId)} activeOpacity={0.7}>
                          <PlayerAvatar
                            userId={p.userId}
                            displayName={p.displayName}
                            imageUrl={p.imageUrl}
                            size={42}
                          />
                        </TouchableOpacity>
                        <Text style={styles.rosterName} numberOfLines={1}>
                          {p.displayName ?? 'Unknown'}
                        </Text>
                        {p.userId !== reclubUserId && (
                          <TouchableOpacity
                            style={[
                              styles.followBtnSmall,
                              isFollowed && styles.followedBtn,
                            ]}
                            onPress={() => handleFollow(p.userId)}
                            disabled={isFollowed}
                          >
                            {isFollowed ? (
                              <Check size={12} color={T.green} />
                            ) : (
                              <UserPlus size={12} color={T.amber} />
                            )}
                          </TouchableOpacity>
                        )}
                      </View>
                    )
                  })}
                </ScrollView>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {!embedded && (
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onComplete}
          activeOpacity={0.8}
        >
          <Text style={styles.doneLabel}>
            {followedIds.size > 0
              ? `Done (${followedIds.size} followed)`
              : 'Skip'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
    paddingHorizontal: 20,
  },
  purposeText: {
    fontSize: 15,
    lineHeight: 22,
    color: T.textSecondary,
    marginBottom: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: T.text,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: T.muted,
    marginBottom: 12,
  },
  sessionCard: {
    backgroundColor: T.surface,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: T.border,
  },
  sessionName: {
    fontSize: 15,
    fontWeight: '600',
    color: T.text,
  },
  sessionMeta: {
    fontSize: 12,
    color: T.muted,
    marginTop: 2,
  },
  rosterItem: {
    alignItems: 'center',
    marginRight: 14,
    width: 60,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarFallback: {
    backgroundColor: T.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: T.text,
    fontWeight: '600',
    fontSize: 16,
  },
  rosterName: {
    fontSize: 10,
    color: T.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  followBtnSmall: {
    marginTop: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245,166,35,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: T.borderSubtle,
  },
  coAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  coName: {
    fontSize: 15,
    fontWeight: '600',
    color: T.text,
  },
  coMeta: {
    fontSize: 12,
    color: T.muted,
    marginTop: 2,
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: T.amber,
  },
  followedBtn: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  followLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  followedLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: T.green,
  },
  skipBtn: {
    marginTop: 24,
    alignSelf: 'center',
  },
  skipLabel: {
    fontSize: 15,
    color: T.amber,
    fontWeight: '600',
  },
  doneBtn: {
    backgroundColor: T.amber,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  doneLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  })
}
