import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  RotateCcw,
  Bell,
  LogOut,
  Trash2,
  Link2,
  BellRing,
} from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { useUiStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'

export function ProfileSheet({
  onClose,
  onLinkReclub,
  onRedoOnboarding,
}: {
  onClose: () => void
  onLinkReclub?: () => void
  onRedoOnboarding?: () => void
}) {
  const insets = useSafeAreaInsets()
  const {
    displayName,
    imageUrl,
    reclubUserId,
    duprRating,
    signOut,
    deleteAccount,
    authedFetch,
    jwt,
    ensureServerAuth,
  } = useAuthStore()

  const notificationsOn = useUiStore((s) => s.notificationsEnabled)
  const setNotificationsEnabled = useUiStore((s) => s.setNotificationsEnabled)
  const sessionsCount = useSessionStore((s) => s.currentIdx)

  const [followingCount, setFollowingCount] = useState(0)
  const [kudos, setKudos] = useState({ fistbump: 0, flame: 0, star: 0 })

  const [streakData, setStreakData] = useState<{
    currentStreak: number
    weeklyPlayed: boolean[]
    circleSessionsThisWeek: number
    mySessionsThisWeek: number
    streakStartDate: string | null
  }>({
    currentStreak: 0,
    weeklyPlayed: [],
    circleSessionsThisWeek: 0,
    mySessionsThisWeek: 0,
    streakStartDate: null,
  })
  const [streakDataLoaded, setStreakDataLoaded] = useState(false)

  const loadFollowing = useCallback(async () => {
    if (!jwt) return
    await ensureServerAuth()
    try {
      const res = await authedFetch('/api/follows')
      if (res.ok) {
        const list = await res.json()
        setFollowingCount(Array.isArray(list) ? list.length : 0)
      }
    } catch {
      // ignore
    }
  }, [authedFetch, jwt, ensureServerAuth])

  useEffect(() => {
    if (jwt) {
      loadFollowing()
      if (reclubUserId) {
        authedFetch(`/api/kudos?toPlayerId=${reclubUserId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data) setKudos({ fistbump: data.fistbump ?? 0, flame: data.flame ?? 0, star: data.star ?? 0 })
          })
          .catch(() => {})
      }
    }
  }, [jwt, loadFollowing, reclubUserId, authedFetch])

  useEffect(() => {
    if (!jwt) return
    authedFetch('/api/players/streak')
      .then((r) => r.json())
      .then((data) => {
        setStreakData(data)
        setStreakDataLoaded(true)
      })
      .catch(() => setStreakDataLoaded(true))
  }, [jwt, authedFetch])

  const initial = (displayName ?? '?')[0]?.toUpperCase() ?? '?'
  const duprDisplay =
    duprRating != null && !Number.isNaN(duprRating)
      ? duprRating.toFixed(1)
      : '–'

  const [pnsStatus, setPnsStatus] = useState<'idle' | 'sending' | 'ok' | 'no_token' | 'error'>('idle')

  const handleTestPns = async () => {
    setPnsStatus('sending')
    try {
      let res = await authedFetch('/api/notifications/test', { method: 'POST' })
      let data = await res.json()

      // If no token on backend, try re-registering now
      if (!res.ok && data.registered === false) {
        const { registerForPushNotifications } = await import('../services/notifications')
        const token = await registerForPushNotifications()
        if (token) {
          await authedFetch('/api/players/push-token', {
            method: 'POST',
            body: JSON.stringify({ token }),
          })
          res = await authedFetch('/api/notifications/test', { method: 'POST' })
          data = await res.json()
        }
      }

      if (!res.ok) {
        setPnsStatus(data.registered === false ? 'no_token' : 'error')
      } else {
        setPnsStatus('ok')
      }
    } catch {
      setPnsStatus('error')
    }
    setTimeout(() => setPnsStatus('idle'), 4000)
  }

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        onPress: () => {
          onClose()
          signOut()
        },
      },
    ])
  }

  const handleDeleteData = () => {
    Alert.alert(
      'Delete all my data',
      'This will permanently remove your account, profile, follows, and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount()
              onClose()
            } catch {
              Alert.alert(
                'Could not delete',
                'Something went wrong. Please try again.',
              )
            }
          },
        },
      ],
    )
  }

  const linkedLabel = reclubUserId
    ? `Reclub ID: ${reclubUserId} · Linked`
    : 'Reclub ID: — · Not linked'

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
      <TouchableOpacity
        onPress={onClose}
        style={styles.backBtn}
      >
        <ChevronLeft size={20} color="#999" strokeWidth={2} />
        <Text style={styles.backLabel}>Back</Text>
      </TouchableOpacity>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <View style={styles.headerRow}>
        <View style={styles.headerAvatarWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.avatarFallback]}>
              <Text style={styles.headerInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>
            {displayName ?? 'Player'}
          </Text>
          <Text style={styles.headerMeta}>{linkedLabel}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{duprDisplay}</Text>
          <Text style={styles.statLabel}>DUPR</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{sessionsCount}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
      </View>

      <View style={styles.kudosRow}>
        {([
          { type: 'fistbump', emoji: '🤜', label: 'Fist bump', count: kudos.fistbump },
          { type: 'flame', emoji: '🔥', label: 'On fire', count: kudos.flame },
          { type: 'star', emoji: '⭐', label: 'Star', count: kudos.star },
        ]).map(k => (
          <View key={k.type} style={styles.kudosBtn}>
            <Text style={styles.kudosEmoji}>{k.emoji}</Text>
            <Text style={styles.kudosCount}>{k.count > 0 ? k.count : ''}</Text>
            <Text style={styles.kudosLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {streakDataLoaded && (
        <View style={styles.streakCard}>
          <View style={styles.streakHero}>
            <Text style={styles.streakNum}>
              {streakData.currentStreak > 0 ? `🔥 ${streakData.currentStreak}` : '–'}
            </Text>
            <View style={styles.streakHeroRight}>
              <Text style={styles.streakLabel}>
                {streakData.currentStreak > 0 ? 'week streak' : 'No streak yet'}
              </Text>
              <Text style={styles.streakSub}>
                {streakData.currentStreak > 0 && streakData.streakStartDate
                  ? `Playing every week since ${new Date(streakData.streakStartDate).toLocaleDateString('en-US', { month: 'long' })}`
                  : 'Join a session to start your streak'}
              </Text>
            </View>
          </View>

          <View style={styles.weeksRow}>
            {(streakData.weeklyPlayed.length > 0
              ? [...streakData.weeklyPlayed, ...Array(6).fill(false)].slice(0, 6)
              : Array(6).fill(false)
            ).map((played, i) => (
              <View key={i} style={[styles.weekDot, played && styles.weekDotPlayed]}>
                <Text style={[styles.weekDotText, played && styles.weekDotTextPlayed]}>
                  W{i + 1}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.compareBlock}>
            <View style={styles.compareHeader}>
              <Text style={styles.compareTitle}>Your circle this week</Text>
              <Text style={styles.compareVals}>
                <Text style={styles.compareHighlight}>{streakData.mySessionsThisWeek}</Text>
                <Text style={styles.compareDivider}> / </Text>
                <Text style={styles.compareHighlight}>{streakData.circleSessionsThisWeek}</Text>
                <Text style={styles.compareSub}> sessions</Text>
              </Text>
            </View>
            <View style={styles.barBg}>
              <View style={[styles.barFill, {
                width: streakData.circleSessionsThisWeek > 0
                  ? `${Math.min((streakData.mySessionsThisWeek / streakData.circleSessionsThisWeek) * 100, 100)}%`
                  : '0%'
              }]} />
            </View>
            <Text style={styles.compareCaption}>
              {streakData.circleSessionsThisWeek === 0
                ? 'Follow players to see how your circle is doing'
                : streakData.mySessionsThisWeek === 0
                  ? 'Your circle is active · join a session this week'
                  : `You played ${streakData.mySessionsThisWeek} of ${streakData.circleSessionsThisWeek} sessions in your circle`}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.settingsBlock}>
        {onRedoOnboarding && (
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              onClose()
              onRedoOnboarding()
            }}
          >
            <RotateCcw size={20} color="#555" strokeWidth={2} />
            <Text style={styles.settingsLabel}>Redo setup</Text>
          </TouchableOpacity>
        )}
        {!reclubUserId && onLinkReclub && (
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              onClose()
              onLinkReclub()
            }}
          >
            <Link2 size={20} color={T.amber} strokeWidth={2} />
            <Text style={[styles.settingsLabel, { color: T.amber }]}>
              Link your Reclub name
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={() => setNotificationsEnabled(!notificationsOn)}
        >
          <Bell size={20} color="#555" strokeWidth={2} />
          <Text style={styles.settingsLabel}>Notifications</Text>
          <Text style={styles.settingsRight}>
            {notificationsOn ? 'On' : 'Off'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={handleTestPns}
          disabled={pnsStatus === 'sending'}
        >
          <BellRing size={20} color={
            pnsStatus === 'ok' ? '#22c55e'
            : pnsStatus === 'no_token' || pnsStatus === 'error' ? '#e24b4a'
            : '#555'
          } strokeWidth={2} />
          <Text style={styles.settingsLabel}>
            {pnsStatus === 'sending' ? 'Sending…'
              : pnsStatus === 'ok' ? 'Notification sent ✓'
              : pnsStatus === 'no_token' ? 'No token registered'
              : pnsStatus === 'error' ? 'Send failed'
              : 'Test push notification'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingsRow} onPress={handleSignOut}>
          <LogOut size={20} color="#555" strokeWidth={2} />
          <Text style={styles.settingsLabel}>Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsRow}
          onPress={handleDeleteData}
        >
          <Trash2 size={20} color="#e24b4a" strokeWidth={2} />
          <Text style={[styles.settingsLabel, { color: '#e24b4a' }]}>
            Delete my data
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginBottom: 16,
  },
  backLabel: {
    fontSize: 14,
    color: '#999',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  headerAvatarWrap: {
    borderRadius: 36,
    borderWidth: 2,
    borderColor: '#f5a623',
    overflow: 'hidden',
  },
  headerAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ccc',
  },
  headerName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerMeta: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#111',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: '#1e1e1e',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f5a623',
  },
  statLabel: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kudosRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 12,
  },
  kudosBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
  },
  kudosEmoji: {
    fontSize: 20,
  },
  kudosCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f5a623',
    minHeight: 16,
  },
  kudosLabel: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  settingsBlock: {
    borderTopWidth: 0.5,
    borderTopColor: '#1a1a1a',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  settingsLabel: {
    flex: 1,
    fontSize: 16,
    color: '#ccc',
  },
  settingsRight: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f5a623',
  },
  streakCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: '#f5a623',
    borderRadius: 16,
    padding: 16,
  },
  streakHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  streakNum: {
    fontSize: 42,
    fontWeight: '700',
    color: '#f5a623',
    lineHeight: 46,
    flexShrink: 0,
  },
  streakHeroRight: {
    flex: 1,
  },
  streakLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 3,
  },
  streakSub: {
    fontSize: 11,
    color: '#666',
    lineHeight: 15,
  },
  weeksRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  weekDot: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotPlayed: {
    backgroundColor: '#f5a623',
    borderColor: '#f5a623',
  },
  weekDotText: {
    fontSize: 9,
    color: '#333',
    fontWeight: '500',
  },
  weekDotTextPlayed: {
    color: '#1a0a00',
    fontWeight: '700',
  },
  compareBlock: {
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
  },
  compareHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  compareTitle: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
  compareVals: {
    fontSize: 12,
  },
  compareHighlight: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f5a623',
  },
  compareDivider: {
    color: '#333',
  },
  compareSub: {
    fontSize: 11,
    color: '#555',
  },
  barBg: {
    height: 5,
    backgroundColor: '#111',
    borderRadius: 3,
    marginBottom: 7,
  },
  barFill: {
    height: 5,
    backgroundColor: '#f5a623',
    borderRadius: 3,
  },
  compareCaption: {
    fontSize: 10,
    color: '#444',
    lineHeight: 14,
  },
})
