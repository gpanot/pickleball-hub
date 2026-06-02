import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  ScrollView,
  Platform,
  TextInput,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  RotateCcw,
  Bell,
  LogOut,
  Trash2,
  Link2,
  Shirt,
} from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { useUiStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { getPushDiagnostics, registerForPushNotifications } from '../services/notifications'

export function ProfileSheet({
  onClose,
  onLinkReclub,
  onRedoOnboarding,
  onOpenGear,
  onOpenPushDebug,
}: {
  onClose: () => void
  onLinkReclub?: () => void
  onRedoOnboarding?: () => void
  onOpenGear?: () => void
  onOpenPushDebug?: () => void
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
  const streakLoadedRef = useRef(false)

  const [showStreakExplainer, setShowStreakExplainer] = useState(false)

  const [streakData, setStreakData] = useState<{
    currentStreak: number
    weeklyPlayed: boolean[]
    circleSessionsThisWeek: number
    mySessionsThisWeek: number
    streakStartDate: string | null
  }>({
    currentStreak: 0,
    weeklyPlayed: [false, false, false, false, false, false],
    circleSessionsThisWeek: 0,
    mySessionsThisWeek: 0,
    streakStartDate: null,
  })

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
    if (!jwt || streakLoadedRef.current) return
    streakLoadedRef.current = true
    authedFetch('/api/players/streak')
      .then((r) => r.json())
      .then((data) => {
        setStreakData({
          currentStreak: data.currentStreak ?? 0,
          weeklyPlayed:
            data.weeklyPlayed?.length > 0
              ? [...data.weeklyPlayed, ...Array(6).fill(false)].slice(0, 6)
              : [false, false, false, false, false, false],
          circleSessionsThisWeek: data.circleSessionsThisWeek ?? 0,
          mySessionsThisWeek: data.mySessionsThisWeek ?? 0,
          streakStartDate: data.streakStartDate ?? null,
        })
      })
      .catch(() => {})
  }, [jwt, authedFetch])

  const initial = (displayName ?? '?')[0]?.toUpperCase() ?? '?'
  const duprDisplay =
    duprRating != null && !Number.isNaN(duprRating)
      ? duprRating.toFixed(2)
      : '–'

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
      'Delete all my data?',
      'This will permanently remove your account, profile, follows, and all associated data. This action is irreversible and your data cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, delete everything',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'This is your last chance. All your data will be deleted forever.',
              [
                { text: 'Go back', style: 'cancel' },
                {
                  text: 'Delete forever',
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
          },
        },
      ],
    )
  }

  const linkedLabel = reclubUserId
    ? `Reclub ID: ${reclubUserId} · Linked`
    : 'Reclub ID: — · Not linked'

  // Fetch Reclub DUPR separately from the linked player
  const [reclubDupr, setReclubDupr] = useState<number | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [showDuprEditor, setShowDuprEditor] = useState(false)
  const [duprInput, setDuprInput] = useState(duprRating != null ? duprRating.toFixed(2) : '')
  const [showKudosModal, setShowKudosModal] = useState(false)
  const [kudosGivers, setKudosGivers] = useState<Array<{ userId: string; displayName: string; imageUrl: string | null; type: string; givenAt: string }>>([])
  const [showFollowersModal, setShowFollowersModal] = useState(false)
  const [followersList, setFollowersList] = useState<Array<{ userId: string; displayName: string; imageUrl: string | null; duprDoubles: number | null }>>([])

  useEffect(() => {
    if (!jwt || !reclubUserId) return
    authedFetch(`/api/players/${reclubUserId}/profile`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.duprDoubles) setReclubDupr(data.duprDoubles)
      })
      .catch(() => {})
  }, [jwt, reclubUserId, authedFetch])

  useEffect(() => {
    if (!jwt) return
    authedFetch('/api/follows/followers')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.count != null) setFollowersCount(data.count)
      })
      .catch(() => {})
  }, [jwt, authedFetch])

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
          {reclubDupr != null && reclubDupr > 0 && (
            <View style={styles.reclubDuprPill}>
              <Text style={styles.reclubDuprText}>Reclub DUPR: {reclubDupr.toFixed(2)}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statCol} onPress={() => {
          setDuprInput(duprRating != null ? duprRating.toFixed(2) : '')
          setShowDuprEditor(true)
        }} activeOpacity={0.7}>
          <Text style={styles.statValue}>{duprDisplay}</Text>
          <Text style={styles.statLabel}>DUPR ✎</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
        <View style={styles.statDivider} />
        <TouchableOpacity style={styles.statCol} onPress={async () => {
          console.log('[FOLLOWERS_DEBUG] tap')
          try {
            const res = await authedFetch('/api/follows/followers')
            console.log('[FOLLOWERS_DEBUG] HTTP', res.status)
            if (res.ok) {
              const data = await res.json()
              console.log('[FOLLOWERS_DEBUG] data:', JSON.stringify(data))
              setFollowersList(data.followers ?? [])
              setFollowersCount(data.count ?? 0)
              setShowFollowersModal(true)
              console.log('[FOLLOWERS_DEBUG] setShowFollowersModal(true) called')
            }
          } catch (e) {
            console.log('[FOLLOWERS_DEBUG] error:', e)
          }
        }} activeOpacity={0.7}>
          <Text style={styles.statValue}>{followersCount}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </TouchableOpacity>
        <View style={styles.statDivider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{sessionsCount}</Text>
          <Text style={styles.statLabel}>Sessions</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.kudosRow} activeOpacity={0.7} onPress={async () => {
        console.log('[KUDOS_DEBUG] tap — reclubUserId:', reclubUserId, 'kudos:', kudos)
        if (!reclubUserId) {
          console.log('[KUDOS_DEBUG] aborting: no reclubUserId')
          return
        }
        try {
          const res = await authedFetch(`/api/kudos/givers?toPlayerId=${reclubUserId}`)
          console.log('[KUDOS_DEBUG] givers HTTP', res.status)
          if (res.ok) {
            const data = await res.json()
            console.log('[KUDOS_DEBUG] givers data:', JSON.stringify(data))
            setKudosGivers(data.givers ?? [])
            setShowKudosModal(true)
            console.log('[KUDOS_DEBUG] setShowKudosModal(true) called')
          } else {
            console.log('[KUDOS_DEBUG] givers response not ok:', res.status)
          }
        } catch (e) {
          console.log('[KUDOS_DEBUG] error:', e)
        }
      }}>
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
      </TouchableOpacity>

      <TouchableOpacity style={styles.streakCard} activeOpacity={0.8} onPress={() => setShowStreakExplainer(true)}>
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
            {[...streakData.weeklyPlayed, ...Array(6).fill(false)].slice(0, 6).map((played, i) => (
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
        </TouchableOpacity>

      {showStreakExplainer && (
        <View style={styles.streakExplainer}>
          <Text style={styles.streakExplainerTitle}>How streaks work</Text>
          <Text style={styles.streakExplainerText}>
            Play at least one session per week to keep your streak alive. Your streak count shows how many consecutive weeks you've played.
          </Text>
          <Text style={styles.streakExplainerText}>
            W1–W6 shows your last 6 weeks. Green = you played that week.
          </Text>
          <Text style={styles.streakExplainerText}>
            The progress bar compares your sessions vs your circle's total this week.
          </Text>
          <TouchableOpacity onPress={() => setShowStreakExplainer(false)} style={styles.streakExplainerClose}>
            <Text style={styles.streakExplainerCloseText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.settingsBlock}>
        {onOpenGear && (
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              onClose()
              onOpenGear()
            }}
          >
            <Shirt size={20} color="#555" strokeWidth={2} />
            <Text style={styles.settingsLabel}>My Gear</Text>
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

        {__DEV__ && (
          <>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => AsyncStorage.removeItem('hasSeenGearPrompt')}
            >
              <Text style={styles.settingsLabel}>Reset gear prompt (dev)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => AsyncStorage.removeItem('hasSeenAvatarTip')}
            >
              <Text style={styles.settingsLabel}>Reset avatar tip (dev)</Text>
            </TouchableOpacity>
          </>
        )}

        {__DEV__ && (
          <>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={async () => {
                try {
                  console.log('[push-debug] Starting PNS diagnostics...')
                  const diag = await getPushDiagnostics()
                  console.log('[push-debug] Diagnostics:', JSON.stringify(diag))

                  const diagMsg = [
                    `Platform: ${diag.platform}`,
                    `isDevice: ${diag.isDevice}`,
                    `isExpoGo: ${diag.isExpoGo}`,
                    `Permission: ${diag.permissionStatus}`,
                    diag.tokenPrefix ? `Token: ${diag.tokenPrefix}...` : 'Token: none',
                    diag.error ? `Error: ${diag.error}` : null,
                  ].filter(Boolean).join('\n')

                  if (!diag.tokenPrefix && diag.permissionStatus === 'granted' && !diag.isExpoGo) {
                    const token = await registerForPushNotifications()
                    if (token) {
                      await authedFetch('/api/players/push-token', {
                        method: 'POST',
                        body: JSON.stringify({ token, platform: Platform.OS }),
                      })
                    }
                  }

                  const statusRes = await authedFetch('/api/notifications/test')
                  const statusData = await statusRes.json()

                  const serverMsg = statusData.registered
                    ? `DB token: ${statusData.tokenPrefix}...\nUpdated: ${statusData.updatedAt ?? 'unknown'}`
                    : 'No token in DB'

                  if (statusData.registered) {
                    const res = await authedFetch('/api/notifications/test', { method: 'POST' })
                    const data = await res.json()

                    if (data.ok) {
                      Alert.alert('PNS Debug ✓', `Notification sent!\n\n— Client —\n${diagMsg}\n\n— Server —\n${serverMsg}`)
                    } else {
                      Alert.alert('PNS Send Failed', `Code: ${data.code ?? 'unknown'}\nMsg: ${data.message ?? data.error}\n\n— Client —\n${diagMsg}\n\n— Server —\n${serverMsg}`)
                    }
                  } else {
                    Alert.alert('PNS Not Registered', `No push token in DB.\n\n— Client —\n${diagMsg}\n\nMake sure you have a physical device and notifications permission is granted.`)
                  }
                } catch (e: any) {
                  console.error('[push-debug] Unexpected error:', e)
                  Alert.alert('PNS Error', e.message ?? String(e))
                }
              }}
            >
              <Bell size={20} color="#555" strokeWidth={2} />
              <Text style={styles.settingsLabel}>Test Push Notification</Text>
            </TouchableOpacity>

            {onOpenPushDebug && (
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => {
                  onClose()
                  onOpenPushDebug()
                }}
              >
                <Bell size={20} color="#f5a623" strokeWidth={2} />
                <Text style={[styles.settingsLabel, { color: '#f5a623' }]}>FCM Debug Screen</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      </ScrollView>

      {/* DUPR Editor Popup */}
      {showDuprEditor && (
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>Edit DUPR Rating</Text>
            <Text style={styles.popupSub}>Enter your self-rated DUPR (2.00–8.00)</Text>
            <TextInput
              style={styles.popupInput}
              value={duprInput}
              onChangeText={setDuprInput}
              placeholder="e.g. 3.50"
              placeholderTextColor="#555"
              keyboardType="decimal-pad"
              maxLength={4}
              autoFocus
            />
            <View style={styles.popupBtnRow}>
              <TouchableOpacity style={styles.popupBtnCancel} onPress={() => setShowDuprEditor(false)}>
                <Text style={styles.popupBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.popupBtnSave} onPress={async () => {
                const num = parseFloat(duprInput)
                if (isNaN(num) || num < 2 || num > 8) {
                  Alert.alert('Invalid', 'DUPR must be between 2.00 and 8.00')
                  return
                }
                try {
                  await authedFetch('/api/players/profile', {
                    method: 'PATCH',
                    body: JSON.stringify({ duprRating: num }),
                  })
                  useAuthStore.getState().setDuprRating(num)
                  setShowDuprEditor(false)
                } catch {
                  Alert.alert('Error', 'Failed to save DUPR rating.')
                }
              }}>
                <Text style={styles.popupBtnSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Kudos Givers Modal */}
      {showKudosModal && (
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>Kudos received</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {kudosGivers.length === 0 ? (
                <Text style={styles.popupSub}>No kudos yet</Text>
              ) : (
                kudosGivers.map((g, i) => (
                  <View key={i} style={styles.listRow}>
                    {g.imageUrl ? (
                      <Image source={{ uri: g.imageUrl }} style={styles.listAvatar} />
                    ) : (
                      <View style={[styles.listAvatar, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#666', fontSize: 12 }}>{(g.displayName ?? '?')[0]}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{g.displayName ?? 'Player'}</Text>
                      <Text style={styles.listMeta}>{g.type === 'fistbump' ? '🤜' : g.type === 'flame' ? '🔥' : '⭐'}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.popupCloseBtn} onPress={() => setShowKudosModal(false)}>
              <Text style={styles.popupCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Followers Modal */}
      {showFollowersModal && (
        <View style={styles.popupBackdrop}>
          <View style={styles.popupCard}>
            <Text style={styles.popupTitle}>Followers ({followersCount})</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {followersList.length === 0 ? (
                <Text style={styles.popupSub}>No followers yet</Text>
              ) : (
                followersList.map((f, i) => (
                  <View key={i} style={styles.listRow}>
                    {f.imageUrl ? (
                      <Image source={{ uri: f.imageUrl }} style={styles.listAvatar} />
                    ) : (
                      <View style={[styles.listAvatar, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ color: '#666', fontSize: 12 }}>{(f.displayName ?? '?')[0]}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listName}>{f.displayName ?? 'Player'}</Text>
                      {f.duprDoubles != null && <Text style={styles.listMeta}>DUPR {f.duprDoubles.toFixed(1)}</Text>}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.popupCloseBtn} onPress={() => setShowFollowersModal(false)}>
              <Text style={styles.popupCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  streakExplainer: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#1a1200',
    borderWidth: 0.5,
    borderColor: '#7a5000',
    borderRadius: 12,
    padding: 14,
  },
  streakExplainerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: T.amber,
    marginBottom: 8,
  },
  streakExplainerText: {
    fontSize: 12,
    color: '#bbb',
    lineHeight: 17,
    marginBottom: 6,
  },
  streakExplainerClose: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: T.amber,
    borderRadius: 8,
    marginTop: 4,
  },
  streakExplainerCloseText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a0a00',
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
    color: '#666',
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
  reclubDuprPill: {
    backgroundColor: '#1a0a2e',
    borderWidth: 0.5,
    borderColor: '#7c3aed',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  reclubDuprText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a78bfa',
  },
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
    paddingHorizontal: 24,
  },
  popupCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
  },
  popupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  popupSub: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  popupInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 16,
  },
  popupBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  popupBtnCancel: {
    flex: 1,
    padding: 13,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  popupBtnCancelText: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: '600',
  },
  popupBtnSave: {
    flex: 1,
    padding: 13,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f5a623',
  },
  popupBtnSaveText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '700',
  },
  popupCloseBtn: {
    width: '100%',
    padding: 13,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f5a623',
    marginTop: 16,
  },
  popupCloseBtnText: {
    fontSize: 14,
    color: '#000',
    fontWeight: '700',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  listAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  listName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ddd',
  },
  listMeta: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
})
