import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { PlayerAvatar } from './PlayerAvatar'

export type FriendListItem = {
  userId: string
  displayName: string | null
  imageUrl?: string | null
  duprDoubles?: number | null
  isFollowing?: boolean
}

function DuprPill({ value, styles }: { value: number; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.duprPill}>
      <Text style={styles.duprLabel}>DUPR</Text>
      <Text style={styles.duprValue}>{value.toFixed(2)}</Text>
    </View>
  )
}

export function FriendListRow({
  item,
  onUnfollow,
  onFollow,
  onAvatarPress,
}: {
  item: FriendListItem
  onUnfollow?: () => void
  onFollow?: () => void
  onAvatarPress?: () => void
}) {
  const T = useTheme()
  const styles = useMemo(() => createStyles(T), [T])
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={onAvatarPress} disabled={!onAvatarPress}>
        <PlayerAvatar
          userId={item.userId}
          displayName={item.displayName}
          imageUrl={item.imageUrl}
          size={46}
        />
      </TouchableOpacity>
      <View style={styles.info}>
        <Text style={styles.name}>{item.displayName ?? 'Unknown'}</Text>
        {item.duprDoubles != null && (
          <DuprPill value={item.duprDoubles} styles={styles} />
        )}
      </View>
      {onFollow ? (
        <TouchableOpacity
          style={[styles.followBtn, item.isFollowing && styles.followBtnDone]}
          onPress={() => !item.isFollowing && onFollow()}
          activeOpacity={item.isFollowing ? 1 : 0.8}
          disabled={item.isFollowing}
        >
          <Text style={[styles.followLabel, item.isFollowing && styles.followLabelDone]}>
            {item.isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      ) : onUnfollow ? (
        <TouchableOpacity style={styles.unfollowBtn} onPress={onUnfollow}>
          <Text style={styles.unfollowLabel}>Unfollow</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function createStyles(T: ThemeColors) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: T.borderSubtle,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: T.text,
  },
  duprPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(127,119,221,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,119,221,0.3)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  duprLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7F77DD',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  duprValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7F77DD',
  },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(29,158,117,0.15)',
    borderWidth: 1,
    borderColor: '#1D9E75',
  },
  followBtnDone: {
    backgroundColor: T.input,
    borderColor: T.border,
  },
  followLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D9E75',
  },
  followLabelDone: {
    fontWeight: '500',
    color: T.muted,
  },
  unfollowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: T.input,
    borderWidth: 1,
    borderColor: T.border,
  },
  unfollowLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: T.textSecondary,
  },
  })
}
