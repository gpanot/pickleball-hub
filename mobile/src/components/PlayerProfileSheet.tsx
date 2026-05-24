import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Pressable, Dimensions, Image
} from 'react-native'
import { X, Users } from 'lucide-react-native'
import { useAuthStore } from '../stores/authStore'
import { T } from '../theme'

const { height: H } = Dimensions.get('window')

interface ReclubKudo {
  type: string
  count: number
  label: string
}

interface PlayerProfile {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  reclubId: number | null
  followingCount: number
  sessionCount: number
  isFollowing: boolean
  recentVenues: Array<{ name: string; count: number; lastSeen: string }>
  reclubKudos: ReclubKudo[]
  myKudos: { fistbump: number; flame: number; star: number; myReactions: string[] }
}

interface Props {
  userId: string | null
  onClose: () => void
}

export function PlayerProfileSheet({ userId, onClose }: Props) {
  const { authedFetch } = useAuthStore()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const [error, setError] = useState(false)

  useEffect(() => {
    if (userId) {
      setError(false)
      loadProfile(userId)
    } else {
      setProfile(null)
      setError(false)
    }
  }, [userId])

  const loadProfile = useCallback(async (uid: string) => {
    setLoading(true)
    setError(false)
    try {
      const res = await authedFetch(`/api/players/${uid}/profile`)
      if (!res.ok) {
        setError(true)
        return
      }
      const data = await res.json()
      if (!data.userId) {
        setError(true)
        return
      }
      setProfile(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [authedFetch])

  const handleClose = () => {
    onClose()
  }

  if (!userId) return null

  return (
    <Modal
      visible={!!userId}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>

          <View style={s.handle} />

          <TouchableOpacity style={s.closeBtn} onPress={handleClose}>
            <X size={18} color="#555" />
          </TouchableOpacity>

          {loading ? (
            <View style={s.loadingState}>
              <Text style={s.loadingText}>Loading...</Text>
            </View>
          ) : error ? (
            <View style={s.loadingState}>
              <Text style={s.loadingText}>Could not load profile</Text>
              <TouchableOpacity
                style={s.retryBtn}
                onPress={() => userId && loadProfile(userId)}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !profile ? (
            <View style={s.loadingState}>
              <Text style={s.loadingText}>Loading...</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>

              <View style={s.header}>
                <View style={s.avatarWrap}>
                  {profile.imageUrl ? (
                    <Image
                      source={{ uri: profile.imageUrl }}
                      style={s.avatar}
                      resizeMode="cover" />
                  ) : (
                    <View style={[s.avatar, s.avatarFallback]}>
                      <Text style={s.avatarInitial}>
                        {(profile.displayName ?? '?')[0].toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={s.headerInfo}>
                  <Text style={s.displayName}>
                    {profile.displayName ?? 'Player'}
                  </Text>
                  {profile.reclubId && (
                    <Text style={s.reclubId}>Reclub ID: {profile.reclubId}</Text>
                  )}
                </View>
              </View>

              <View style={s.statsRow}>
                <View style={[s.stat, { borderRightWidth: 0.5, borderRightColor: '#1e1e1e' }]}>
                  <Text style={s.statVal}>
                    {profile.duprDoubles?.toFixed(2) ?? '–'}
                  </Text>
                  <Text style={s.statLbl}>DUPR</Text>
                </View>
                <View style={[s.stat, { borderRightWidth: 0.5, borderRightColor: '#1e1e1e' }]}>
                  <Text style={s.statVal}>{profile.followingCount}</Text>
                  <Text style={s.statLbl}>Following</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statVal}>{profile.sessionCount}</Text>
                  <Text style={s.statLbl}>Sessions</Text>
                </View>
              </View>

              <View style={s.kudosStatsRow}>
                <View style={[s.kudosStat, { borderRightWidth: 0.5, borderRightColor: '#2a2a2a' }]}>
                  <Text style={s.kudosStatEmoji}>🤜</Text>
                  <Text style={s.kudosStatVal}>{profile.myKudos.fistbump}</Text>
                  <Text style={s.kudosStatLbl}>Fist bumps</Text>
                </View>
                <View style={[s.kudosStat, { borderRightWidth: 0.5, borderRightColor: '#2a2a2a' }]}>
                  <Text style={s.kudosStatEmoji}>🔥</Text>
                  <Text style={s.kudosStatVal}>{profile.myKudos.flame}</Text>
                  <Text style={s.kudosStatLbl}>On fire</Text>
                </View>
                <View style={s.kudosStat}>
                  <Text style={s.kudosStatEmoji}>⭐</Text>
                  <Text style={s.kudosStatVal}>{profile.myKudos.star}</Text>
                  <Text style={s.kudosStatLbl}>Stars</Text>
                </View>
              </View>

              {profile.reclubKudos.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionLabel}>Endorsed on Reclub</Text>
                  <View style={s.reclubKudosRow}>
                    {profile.reclubKudos.map(k => (
                      <View key={k.type} style={s.reclubKudosPill}>
                        <Text style={s.reclubKudosCount}>{k.count}</Text>
                        <Text style={s.reclubKudosLabel}>{k.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {profile.recentVenues.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionLabel}>Recent activity</Text>
                  {profile.recentVenues.map((v, i) => (
                    <View key={i} style={[s.venueRow, i === profile.recentVenues.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={s.venueIcon}>
                        <Users size={14} color={T.amber} />
                      </View>
                      <View style={s.venueInfo}>
                        <Text style={s.venueName}>{v.name}</Text>
                        <Text style={s.venueMeta}>{v.count} sessions · last seen {v.lastSeen}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ height: 32 }} />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: H * 0.92,
    minHeight: H * 0.75,
    paddingTop: 8,
  },
  handle: {
    width: 32, height: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16, right: 16,
    width: 30, height: 30,
    borderRadius: 15,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingState: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#444',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 12,
    color: T.amber,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingTop: 4,
  },
  avatarWrap: {
    flexShrink: 0,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: T.amber,
  },
  avatarFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 20,
    fontWeight: '600',
    color: T.amber,
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  reclubId: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  stat: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '600',
    color: T.amber,
  },
  statLbl: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  kudosStatsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  kudosStat: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  kudosStatEmoji: {
    fontSize: 16,
  },
  kudosStatVal: {
    fontSize: 16,
    fontWeight: '600',
    color: T.amber,
    marginTop: 2,
  },
  kudosStatLbl: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  reclubKudosRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  reclubKudosPill: {
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 60,
  },
  reclubKudosCount: {
    fontSize: 14,
    fontWeight: '600',
    color: T.amber,
  },
  reclubKudosLabel: {
    fontSize: 9,
    color: '#555',
    marginTop: 1,
  },
  venueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#111',
  },
  venueIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ddd',
  },
  venueMeta: {
    fontSize: 10,
    color: '#555',
    marginTop: 1,
  },
})
