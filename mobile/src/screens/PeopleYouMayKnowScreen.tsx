import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { UserPlus, Check, AlertCircle, RefreshCw } from 'lucide-react-native'
import { T } from '../theme'
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

export function PeopleYouMayKnowScreen({
  onComplete,
  embedded = false,
}: {
  onComplete: () => void
  embedded?: boolean
}) {
  const insets = useSafeAreaInsets()
  const { authedFetch, reclubUserId, ensureServerAuth } = useAuthStore()
  const [loading, setLoading] = useState(true)
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
        if (__DEV__) {
          console.log('[PeopleYouMayKnow] existing follows', list.length)
        }
      } else if (__DEV__) {
        const body = await res.text()
        console.warn('[PeopleYouMayKnow] GET /api/follows', res.status, body)
      }
    } catch (e) {
      if (__DEV__) console.warn('[PeopleYouMayKnow] loadExistingFollows', e)
    }
  }, [authedFetch])

  const loadData = useCallback(async () => {
    if (!reclubUserId) {
      setLoading(false)
      return
    }
    setError(false)
    setLoading(true)
    try {
      const res = await authedFetch(`/api/players/${reclubUserId}/co-players`)
      if (res.ok) {
        const data = await res.json()
        setLastSessions(data.lastSessions ?? [])
        setCoPlayers(data.coPlayers ?? [])
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [authedFetch, reclubUserId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await ensureServerAuth()
      if (cancelled) return
      setAuthReady(ok)
      if (__DEV__) {
        console.log(
          '[PeopleYouMayKnow] authReady',
          ok,
          'jwt',
          useAuthStore.getState().jwt?.slice(0, 20)
        )
      }
      if (!reclubUserId) {
        setLoading(false)
        return
      }
      if (ok) await loadExistingFollows()
      await loadData()
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

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: embedded ? 20 : insets.top + 40 }]}>
        <ActivityIndicator size="large" color={T.amber} />
      </View>
    )
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: embedded ? 20 : insets.top + 40, alignItems: 'center', justifyContent: 'center' }]}>
        <AlertCircle size={40} color="#666" strokeWidth={1.5} />
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', marginTop: 16 }}>
          Couldn't load suggestions
        </Text>
        <Text style={{ fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center' }}>
          Check your connection and try again
        </Text>
        <TouchableOpacity
          onPress={loadData}
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
        >
          <RefreshCw size={16} color="#0B0B0C" strokeWidth={2} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B0B0C' }}>Retry</Text>
        </TouchableOpacity>
        {!embedded && (
          <TouchableOpacity style={[styles.skipBtn, { marginTop: 16 }]} onPress={onComplete}>
            <Text style={styles.skipLabel}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  if (!reclubUserId) {
    return (
      <View style={[styles.container, { paddingTop: embedded ? 20 : insets.top + 40, alignItems: 'center' }]}>
        <Text style={styles.heading}>No Reclub profile linked</Text>
        <Text style={{ fontSize: 13, color: '#888', marginTop: 6, textAlign: 'center', paddingHorizontal: 20 }}>
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
        {(coPlayers.length > 0 || lastSessions.length > 0) && (
          <Text style={styles.purposeText}>
            Follow players you've played with. You'll see their games in your
            feed, join the same sessions, and get alerts when they book a court.
          </Text>
        )}

        {coPlayers.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.heading}>People you may know</Text>
            <Text style={styles.subheading}>
              Tap Follow on anyone you want to keep track of
            </Text>
            {coPlayers.map((p) => {
              const isFollowed = followedIds.has(p.userId)
              return (
                <View key={p.userId} style={styles.coPlayerRow}>
                  <PlayerAvatar
                    userId={p.userId}
                    displayName={p.displayName}
                    imageUrl={p.imageUrl}
                    size={48}
                  />
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
            })}
          </View>
        )}

        {lastSessions.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.heading}>Your recent sessions</Text>
            <Text style={styles.subheading}>
              Players from games you've already joined
            </Text>
            {lastSessions.map((session) => (
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
                        <PlayerAvatar
                          userId={p.userId}
                          displayName={p.displayName}
                          imageUrl={p.imageUrl}
                          size={42}
                        />
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
            ))}
          </View>
        )}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
    paddingHorizontal: 20,
  },
  purposeText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#ccc',
    marginBottom: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: '#888',
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
    color: '#fff',
  },
  sessionMeta: {
    fontSize: 12,
    color: '#888',
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
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  rosterName: {
    fontSize: 10,
    color: '#ccc',
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
    borderBottomColor: '#1e1e1e',
  },
  coAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  coName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  coMeta: {
    fontSize: 12,
    color: '#888',
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
