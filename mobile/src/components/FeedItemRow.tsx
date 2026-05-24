import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { FeedItem } from '../data'
import { PlayerAvatar } from './PlayerAvatar'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'

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
  const isTomorrow =
    new Date(Date.now() + 86400000).toDateString() === d.toDateString()
  const isToday = new Date().toDateString() === d.toDateString()
  const timeStr =
    mins === 0
      ? `${h12} ${ampm}`
      : `${h12}:${String(mins).padStart(2, '0')} ${ampm}`
  if (isToday) return `starting at ${timeStr}`
  if (isTomorrow) return `tomorrow at ${timeStr}`
  return `${d.toLocaleDateString()} at ${timeStr}`
}

function truncateSessionName(raw: string | undefined): string {
  const name = raw ?? ''
  return name.length > 40 ? name.slice(0, 40) + '…' : name
}

export function FeedItemRow({
  item,
  onJoinToo,
  onAvatarPress,
}: {
  item: FeedItem
  onJoinToo: (eventUrl: string) => void
  onAvatarPress?: (userId: string) => void
}) {
  const name = item.player.displayName ?? 'Player'
  const dupr = item.player.duprDoubles?.toFixed(2) ?? '–'
  const sessionLabel = truncateSessionName(item.sessionName)
  const auth = useAuthStore()

  const [kudos, setKudos] = useState({
    fistbump: item.kudos?.fistbump ?? 0,
    flame: item.kudos?.flame ?? 0,
    star: item.kudos?.star ?? 0,
    myReactions: item.kudos?.myReactions ?? [] as string[]
  })

  useEffect(() => {
    setKudos({
      fistbump: item.kudos?.fistbump ?? 0,
      flame: item.kudos?.flame ?? 0,
      star: item.kudos?.star ?? 0,
      myReactions: item.kudos?.myReactions ?? [],
    })
  }, [item.kudos?.fistbump, item.kudos?.flame, item.kudos?.star])

  const handleKudos = async (type: 'fistbump' | 'flame' | 'star') => {
    const isActive = kudos.myReactions.includes(type)
    setKudos(prev => ({
      ...prev,
      [type]: isActive ? prev[type] - 1 : prev[type] + 1,
      myReactions: isActive
        ? prev.myReactions.filter(r => r !== type)
        : [...prev.myReactions, type]
    }))
    try {
      await auth.authedFetch('/api/kudos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toPlayerId: item.player.userId,
          type,
          feedItemId: item.id
        })
      })
    } catch {}
  }

  return (
    <View style={s.row}>
      <TouchableOpacity onPress={() => onAvatarPress?.(item.player.userId)}>
        <View style={s.avatarCol}>
          <PlayerAvatar
            userId={item.player.userId}
            imageUrl={item.player.imageUrl}
            size={44}
          />
          <Text style={s.dupr}>{dupr}</Text>
        </View>
      </TouchableOpacity>

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

        <View style={s.kudosRow}>
          {(['fistbump', 'flame', 'star'] as const).map(type => {
            const isActive = kudos.myReactions.includes(type)
            const count = kudos[type]
            const emoji = type === 'fistbump' ? '🤜' : type === 'flame' ? '🔥' : '⭐'
            return (
              <TouchableOpacity
                key={type}
                style={[s.kudosBtn, isActive && s.kudosBtnActive]}
                onPress={() => handleKudos(type)}>
                <Text style={s.kudosEmoji}>{emoji}</Text>
                {count > 0 && (
                  <Text style={[s.kudosCount, isActive && s.kudosCountActive]}>
                    {count}
                  </Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
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
  kudosRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  kudosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  kudosBtnActive: {
    borderColor: '#f5a623',
    backgroundColor: '#1f1400',
  },
  kudosEmoji: {
    fontSize: 13,
  },
  kudosCount: {
    fontSize: 11,
    color: '#666',
  },
  kudosCountActive: {
    color: '#f5a623',
  },
})
