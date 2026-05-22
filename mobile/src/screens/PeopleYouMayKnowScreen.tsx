import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { UserPlus, Check } from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'

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
}: {
  onComplete: () => void
}) {
  const insets = useSafeAreaInsets()
  const { authedFetch, reclubUserId } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [lastSessions, setLastSessions] = useState<LastSession[]>([])
  const [coPlayers, setCoPlayers] = useState<CoPlayer[]>([])
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!reclubUserId) {
      setLoading(false)
      return
    }
    loadData()
  }, [reclubUserId])

  const loadData = async () => {
    try {
      const res = await authedFetch(`/api/players/${reclubUserId}/co-players`)
      if (res.ok) {
        const data = await res.json()
        setLastSessions(data.lastSessions ?? [])
        setCoPlayers(data.coPlayers ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = useCallback(
    async (userId: string) => {
      setFollowedIds((prev) => new Set(prev).add(userId))
      try {
        await authedFetch('/api/follows', {
          method: 'POST',
          body: JSON.stringify({ followeeId: userId }),
        })
      } catch {
        setFollowedIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
      }
    },
    [authedFetch]
  )

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator size="large" color={T.amber} />
      </View>
    )
  }

  if (!reclubUserId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.heading}>No Reclub profile linked</Text>
        <TouchableOpacity style={styles.skipBtn} onPress={onComplete}>
          <Text style={styles.skipLabel}>Continue</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Last sessions section */}
        {lastSessions.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.heading}>Your recent sessions</Text>
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
                        {p.imageUrl ? (
                          <Image
                            source={{ uri: p.imageUrl }}
                            style={styles.avatar}
                          />
                        ) : (
                          <View style={[styles.avatar, styles.avatarFallback]}>
                            <Text style={styles.avatarInitial}>
                              {(p.displayName ?? '?')[0]}
                            </Text>
                          </View>
                        )}
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

        {/* People you may know */}
        {coPlayers.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.heading}>People you may know</Text>
            <Text style={styles.subheading}>
              Based on your past sessions together
            </Text>
            {coPlayers.map((p) => {
              const isFollowed = followedIds.has(p.userId)
              return (
                <View key={p.userId} style={styles.coPlayerRow}>
                  {p.imageUrl ? (
                    <Image
                      source={{ uri: p.imageUrl }}
                      style={styles.coAvatar}
                    />
                  ) : (
                    <View style={[styles.coAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>
                        {(p.displayName ?? '?')[0]}
                      </Text>
                    </View>
                  )}
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
      </ScrollView>

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
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
    paddingHorizontal: 20,
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
    width: 28,
    height: 28,
    borderRadius: 14,
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
