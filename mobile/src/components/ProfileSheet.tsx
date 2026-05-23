import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  PanResponder,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  RotateCcw,
  Bell,
  LogOut,
  Trash2,
  Link2,
} from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { useUiStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'

export function ProfileSheet({
  visible,
  onClose,
  onLinkReclub,
  onRedoOnboarding,
}: {
  visible: boolean
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
    if (visible && jwt) {
      loadFollowing()
    }
  }, [visible, jwt, loadFollowing])

  const initial = (displayName ?? '?')[0]?.toUpperCase() ?? '?'
  const duprDisplay =
    duprRating != null && !Number.isNaN(duprRating)
      ? duprRating.toFixed(1)
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
      'Delete all my data',
      'This will permanently remove your account, profile, follows, and all associated data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            onClose()
            await deleteAccount()
          },
        },
      ],
    )
  }

  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
    onPanResponderRelease: (_, g) => {
      if (g.dy > 40 || g.vy > 0.5) onClose()
    },
  })

  const linkedLabel = reclubUserId
    ? `Reclub ID: ${reclubUserId} · Linked`
    : 'Reclub ID: — · Not linked'

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

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

          <View style={styles.settingsBlock}>
            {onRedoOnboarding && (
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => {
                  onClose()
                  onRedoOnboarding()
                }}
              >
                <RotateCcw size={16} color="#555" strokeWidth={2} />
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
                <Link2 size={16} color={T.amber} strokeWidth={2} />
                <Text style={[styles.settingsLabel, { color: T.amber }]}>
                  Link your Reclub name
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => setNotificationsEnabled(!notificationsOn)}
            >
              <Bell size={16} color="#555" strokeWidth={2} />
              <Text style={styles.settingsLabel}>Notifications</Text>
              <Text style={styles.settingsRight}>
                {notificationsOn ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsRow} onPress={handleSignOut}>
              <LogOut size={16} color="#555" strokeWidth={2} />
              <Text style={styles.settingsLabel}>Sign out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={handleDeleteData}
            >
              <Trash2 size={16} color="#e24b4a" strokeWidth={2} />
              <Text style={[styles.settingsLabel, { color: '#e24b4a' }]}>
                Delete my data
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    borderTopWidth: 0.5,
    borderColor: '#1e1e1e',
  },
  handle: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#2a2a2a',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  headerAvatarWrap: {
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#f5a623',
    overflow: 'hidden',
  },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInitial: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ccc',
  },
  headerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  headerMeta: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  statDivider: {
    width: 0.5,
    backgroundColor: '#1e1e1e',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f5a623',
  },
  statLabel: {
    fontSize: 8,
    color: '#555',
    marginTop: 2,
  },
  settingsBlock: {
    borderTopWidth: 0.5,
    borderTopColor: '#1a1a1a',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
  },
  settingsLabel: {
    flex: 1,
    fontSize: 12,
    color: '#ccc',
  },
  settingsRight: {
    fontSize: 11,
    color: '#f5a623',
  },
})
