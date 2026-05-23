import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { FeedItem } from '../data'
import { PlayerAvatar } from './PlayerAvatar'
import { T } from '../theme'

function formatRelativeTime(iso: string): string {
  const diff = Math.abs(Date.now() - new Date(iso).getTime())
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 60) return `${mins} min ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  const hours = d.getHours()
  const mins = d.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  const isToday = new Date().toDateString() === d.toDateString()
  const isTomorrow =
    new Date(Date.now() + 86400000).toDateString() === d.toDateString()
  const dayLabel = isToday
    ? 'tonight'
    : isTomorrow
      ? 'tomorrow'
      : d.toLocaleDateString()
  const timeStr =
    mins === 0
      ? `${h12} ${ampm}`
      : `${h12}:${String(mins).padStart(2, '0')} ${ampm}`
  return `${dayLabel} at ${timeStr}`
}

function truncateSessionName(raw: string | undefined): string {
  const name = raw ?? ''
  return name.length > 40 ? name.slice(0, 40) + '…' : name
}

export function FeedItemRow({
  item,
  onJoinToo,
}: {
  item: FeedItem
  onJoinToo: (eventUrl: string) => void
}) {
  const name = item.player.displayName ?? 'Player'
  const dupr = item.player.duprDoubles?.toFixed(2) ?? '–'
  const sessionLabel = truncateSessionName(item.sessionName)

  return (
    <View style={s.row}>
      <View style={s.avatarCol}>
        <PlayerAvatar
          userId={item.player.userId}
          imageUrl={item.player.imageUrl}
          size={44}
        />
        <Text style={s.dupr}>{dupr}</Text>
      </View>

      <View style={s.body}>
        <View style={s.nameRow}>
          <Text style={s.name}>{name}</Text>
          {item.isFollowing && (
            <Text style={s.followingLabel}> · following</Text>
          )}
        </View>

        {item.type === 'joining' && (
          <>
            <Text style={s.action}>
              joining <Text style={s.highlight}>{sessionLabel}</Text>{' '}
              {formatSessionTime(item.sessionTime!)}
            </Text>
            {item.eventUrl && (
              <TouchableOpacity
                style={s.miniCard}
                onPress={() => onJoinToo(item.eventUrl!)}
              >
                <View style={s.miniCardLeft}>
                  <Text style={s.miniCardName}>{item.venueName}</Text>
                  <Text style={s.miniCardMeta} numberOfLines={1} ellipsizeMode="tail">
                    {formatSessionTime(item.sessionTime!)} · {item.spotsLeft}{' '}
                    left
                  </Text>
                </View>
                <View style={s.joinBtn}>
                  <Text style={s.joinBtnText}>Join too</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}

        {item.type === 'played' && (
          <Text style={s.action}>
            played at <Text style={s.highlight}>{item.venueName}</Text>
            {' · '}
            {item.sessionCount} times this month
          </Text>
        )}

        {item.type === 'dupr_update' && (
          <Text style={s.action}>
            DUPR updated{' '}
            <Text style={s.duprOld}>{item.duprOld?.toFixed(2)}</Text>
            <Text style={s.duprArrow}> → </Text>
            <Text style={s.duprNew}>{item.duprNew?.toFixed(2)}</Text> after
            last night
          </Text>
        )}

        <Text style={s.timestamp}>
          {item.type === 'played'
            ? `Last seen ${formatRelativeTime(item.timestamp)}`
            : formatRelativeTime(item.timestamp)}
          {item.type === 'played' && item.venueName
            ? ` · ${item.venueName}`
            : ''}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#0f0f0f',
    alignItems: 'flex-start',
  },
  avatarCol: { alignItems: 'center', gap: 2, width: 46 },
  dupr: { fontSize: 11, fontWeight: '500', color: T.amber },
  body: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  name: { fontSize: 14, fontWeight: '600', color: '#ddd' },
  followingLabel: { fontSize: 11, color: '#333' },
  action: { fontSize: 13, color: '#555', marginTop: 2, lineHeight: 18 },
  highlight: { color: '#aaa', fontWeight: '500', fontSize: 13 },
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    gap: 10,
    width: '100%',
    alignSelf: 'stretch',
  },
  miniCardLeft: { flex: 1 },
  miniCardName: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  miniCardMeta: { fontSize: 12, color: '#555', marginTop: 1 },
  joinBtn: {
    backgroundColor: T.amber,
    borderRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  joinBtnText: { fontSize: 12, fontWeight: '600', color: '#1a0a00' },
  timestamp: { fontSize: 11, color: '#333', marginTop: 6 },
  duprOld: { color: '#888' },
  duprArrow: { color: T.amber },
  duprNew: { color: T.amber, fontWeight: '500' },
})
