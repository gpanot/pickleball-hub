import React, { useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Pressable,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { FriendListRow, type FriendListItem } from './FriendListRow'

export type RecommendedPlayer = {
  player: FriendListItem
  score: number
  reason: string
  reasonType: 'overlap' | 'level' | 'social'
}

/**
 * Root-level overlay bottom sheet — no RN Modal.
 * Rendered at the top of the tree so it always covers gesture handlers
 * and scroll views without z-index conflicts.
 */
export function FriendsListModal({
  visible,
  onClose,
  title,
  subtitle,
  friends,
  overflowNote,
  onUnfollow,
  onFollow,
  onAvatarPress,
  recommendations,
  onFollowRecommended,
  onRecommendedAvatarPress,
}: {
  visible: boolean
  onClose: () => void
  title: string
  subtitle?: string
  friends: FriendListItem[]
  overflowNote?: string
  onUnfollow?: (userId: string) => void
  onFollow?: (userId: string) => void
  onAvatarPress?: (userId: string) => void
  recommendations?: RecommendedPlayer[]
  onFollowRecommended?: (userId: string) => void
  onRecommendedAvatarPress?: (userId: string) => void
}) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const r = useMemo(() => createRecStyles(T), [T])
  const insets = useSafeAreaInsets()

  if (!visible) return null

  const recs = recommendations ?? []

  return (
    <View style={styles.host} pointerEvents="box-none">
      {/* Dimmed backdrop — tap to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet slides up from bottom */}
      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
        pointerEvents="auto"
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} color={T.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {subtitle ? (
          <Text style={styles.subtitle}>{subtitle}</Text>
        ) : null}

        {overflowNote ? (
          <Text style={styles.overflow}>{overflowNote}</Text>
        ) : null}

        <ScrollView
          style={{ flexShrink: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Recommendation section ─────────────────────────────── */}
          {recs.length > 0 && (
            <View style={r.recSection}>
              <View style={r.recHeader}>
                <Text style={r.recTitle}>✦ Recommended to follow</Text>
                <Text style={r.recCount}>{recs.length} good fits</Text>
              </View>

              {recs.map((rec) => (
                <View key={rec.player.userId} style={r.recRow}>
                  <TouchableOpacity
                    onPress={() => onRecommendedAvatarPress?.(rec.player.userId)}
                    activeOpacity={onRecommendedAvatarPress ? 0.7 : 1}
                    disabled={!onRecommendedAvatarPress}
                  >
                    <Image
                      source={{ uri: rec.player.imageUrl ?? undefined }}
                      style={r.recAv}
                    />
                  </TouchableOpacity>
                  <View style={r.recInfo}>
                    <Text style={r.recName}>{rec.player.displayName ?? 'Player'}</Text>
                    {rec.player.duprDoubles != null && (
                      <Text style={r.recDupr}>
                        {rec.player.duprDoubles.toFixed(2)} DUPR
                      </Text>
                    )}
                    <View style={[r.recChip, r[`recChip_${rec.reasonType}`]]}>
                      <Text style={[r.recChipText, r[`recChipText_${rec.reasonType}`]]}>
                        {rec.reason}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={r.recFollowBtn}
                    onPress={() => onFollowRecommended?.(rec.player.userId)}
                  >
                    <Text style={r.recFollowBtnText}>Follow</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* ── Existing player list ───────────────────────────────── */}
          {friends.length === 0 ? (
            <Text style={styles.empty}>No friends on this session yet.</Text>
          ) : (
            friends.map((item) => (
              <FriendListRow
                key={item.userId}
                item={item}
                onFollow={onFollow ? () => onFollow(item.userId) : undefined}
                onUnfollow={onUnfollow ? () => onUnfollow(item.userId) : undefined}
                onAvatarPress={onAvatarPress ? () => onAvatarPress(item.userId) : undefined}
              />
            ))
          )}
        </ScrollView>
      </View>
    </View>
  )
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: T.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: T.border,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: T.text,
    flex: 1,
    paddingRight: 12,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: T.amber,
    marginBottom: 10,
  },
  overflow: {
    fontSize: 13,
    color: T.muted,
    marginBottom: 8,
  },
  empty: {
    fontSize: 14,
    color: T.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  })
}

function createRecStyles(T: ThemeColors) {
  return StyleSheet.create({
  recSection: {
    backgroundColor: '#0a0a1a',
    borderWidth: 0.5,
    borderColor: '#4a90e2',
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#0f0f2a',
  },
  recTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4a90e2',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  recCount: { fontSize: 10, color: T.textTertiary },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#0f0f2a',
  },
  recAv: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#4a90e2',
    marginRight: 10,
    flexShrink: 0,
    backgroundColor: '#1a1a2a',
  },
  recInfo: { flex: 1 },
  recName: { fontSize: 14, fontWeight: '600', color: T.text },
  recDupr: { fontSize: 11, color: T.amber, fontWeight: '600', marginTop: 1 },
  recChip: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  recChip_overlap: { backgroundColor: '#0a1a0a' },
  recChip_level: { backgroundColor: '#1a1000' },
  recChip_social: { backgroundColor: '#1a0a1a' },
  recChipText: { fontSize: 10, fontWeight: '500' },
  recChipText_overlap: { color: '#1D9E75' },
  recChipText_level: { color: T.amber },
  recChipText_social: { color: '#9b59b6' },
  recFollowBtn: {
    backgroundColor: '#4a90e2',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 10,
    flexShrink: 0,
  },
  recFollowBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: T.text,
  },
  })
}
