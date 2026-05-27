import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native'
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
  return name.length > 24 ? name.slice(0, 24) + '…' : name
}

interface Props {
  item: FeedItem
  onJoinToo: (eventUrl: string) => void
  onAvatarPress?: (userId: string) => void
  isLive?: boolean
  showAvatarTip?: boolean
  onDismissTip?: () => void
}

export function FeedItemRow({
  item,
  onJoinToo,
  onAvatarPress,
  isLive,
  showAvatarTip,
  onDismissTip,
}: Props) {
  const name = item.player.displayName ?? 'Player'
  const dupr = item.player.duprDoubles?.toFixed(2) ?? '–'
  const sessionLabel = truncateSessionName(item.sessionName)
  const auth = useAuthStore()
  const dotOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isLive) return
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [isLive, dotOpacity])

  const pulseAnim = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (showAvatarTip) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start()
    } else {
      pulseAnim.setValue(1)
    }
  }, [showAvatarTip])

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
      <View style={{ position: 'relative', flexShrink: 0, zIndex: showAvatarTip ? 99 : 0 }}>
        <TouchableOpacity
          onPress={() => onAvatarPress?.(item.player.userId)}
          activeOpacity={0.8}
        >
          <View style={s.avatarCol}>
            {showAvatarTip && (
              <Animated.View
                style={[
                  s.pulseRing,
                  {
                    transform: [{ scale: pulseAnim }],
                    opacity: pulseAnim.interpolate({
                      inputRange: [1, 1.35],
                      outputRange: [0.6, 0],
                    }),
                  },
                ]}
                pointerEvents="none"
              />
            )}
            <PlayerAvatar
              userId={item.player.userId}
              imageUrl={item.player.imageUrl}
              size={44}
              style={showAvatarTip ? s.avatarHighlight : undefined}
            />
            <Text style={s.dupr}>{dupr}</Text>
          </View>
        </TouchableOpacity>

        {showAvatarTip && (
          <TouchableOpacity style={s.tipWrap} onPress={onDismissTip} activeOpacity={0.9}>
            <View style={s.tipArrow} />
            <View style={s.tipBubble}>
              <Text style={s.tipText}>Tap to see their profile</Text>
              <Text style={s.tipDismiss}>tap anywhere to dismiss</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.body}>
        <View style={s.nameRow}>
          <View style={s.nameRowLeft}>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            {item.isFollowing && (
              <Text style={s.followingLabel}>
                {item.type === 'joining' ? ' · joining' : ' · following'}
              </Text>
            )}
          </View>
          {isLive && (
            <View style={s.liveBadge}>
              <Animated.View style={[s.liveBadgeDot, { opacity: dotOpacity }]} />
              <Text style={s.liveBadgeText}>On court</Text>
            </View>
          )}
        </View>

        {item.type === 'joining' && (
          <>
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

        {item.type === 'just_followed' && (
          <Text style={s.action}>
            You are now following{' '}
            <Text style={s.highlight}>{name}</Text>
            {' '}· tap their avatar to see their profile
          </Text>
        )}

        {item.type === 'new_follower' && (
          <Text style={s.action}>
            <Text style={s.highlight}>{name}</Text>
            {' '}is now following you · tap their avatar to see their profile
          </Text>
        )}

        {item.type === 'streak_milestone' && (
          <>
            <Text style={s.action}>
              hit a{' '}
              <Text style={[s.highlight, { color: '#f5a623' }]}>
                🔥 {item.streakCount}-week streak
              </Text>
              {' '}· playing every week
            </Text>
            <View style={s.streakMiniCard}>
              <View style={s.streakMiniTop}>
                <Text style={s.streakMiniNum}>🔥{item.streakCount}</Text>
                <View>
                  <Text style={s.streakMiniLabel}>week streak</Text>
                  <Text style={s.streakMiniSub}>Playing consistently</Text>
                </View>
              </View>
              <View style={s.streakMiniDots}>
                {(item.weeklyPlayed ?? Array(6).fill(false))
                  .slice(0, 6)
                  .map((played, i) => (
                    <View
                      key={i}
                      style={[s.streakMiniDot, played && s.streakMiniDotOn]}
                    />
                  ))}
              </View>
            </View>
          </>
        )}

        <View style={s.footerRow}>
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
          <Text style={s.timestamp} numberOfLines={1} ellipsizeMode="tail">
            {item.type === 'played'
              ? `Last seen ${formatRelativeTime(item.timestamp)}`
              : formatRelativeTime(item.timestamp)}
            {item.type === 'played' && item.venueName
              ? ` · ${item.venueName}`
              : ''}
          </Text>
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
    overflow: 'visible',
  },
  avatarCol: { alignItems: 'center', gap: 2, width: 46 },
  dupr: { fontSize: 11, fontWeight: '500', color: T.amber },
  body: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flexWrap: 'wrap',
  },
  name: { fontSize: 14, fontWeight: '600', color: '#ddd', flexShrink: 1 },
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
  streakMiniCard: {
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: '#f5a623',
    borderRadius: 10,
    padding: 9,
    marginTop: 5,
  },
  streakMiniTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  streakMiniNum: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f5a623',
    lineHeight: 24,
  },
  streakMiniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  streakMiniSub: {
    fontSize: 9,
    color: '#555',
    marginTop: 1,
  },
  streakMiniDots: {
    flexDirection: 'row',
    gap: 4,
  },
  streakMiniDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
  },
  streakMiniDotOn: {
    backgroundColor: '#f5a623',
    borderColor: '#f5a623',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  timestamp: {
    fontSize: 11,
    color: '#333',
    textAlign: 'right',
    flexShrink: 0,
    maxWidth: '42%',
  },
  duprOld: { color: '#888' },
  duprArrow: { color: T.amber },
  duprNew: { color: T.amber, fontWeight: '500' },
  kudosRow: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
    minWidth: 0,
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#0a1f0a',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexShrink: 0,
  },
  liveBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1D9E75',
  },
  liveBadgeText: {
    fontSize: 8,
    color: '#5DCAA5',
    fontWeight: '500',
  },
  avatarHighlight: {
    borderWidth: 2,
    borderColor: '#f5a623',
    borderRadius: 22,
  },
  pulseRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#f5a623',
    zIndex: 1,
  },
  tipWrap: {
    position: 'absolute',
    top: 58,
    left: -6,
    zIndex: 99,
    alignItems: 'flex-start',
    width: 160,
  },
  tipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f5a623',
    marginLeft: 16,
  },
  tipBubble: {
    backgroundColor: '#f5a623',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: 160,
    shadowColor: '#f5a623',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  tipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a0a00',
    textAlign: 'center',
  },
  tipDismiss: {
    fontSize: 9,
    color: 'rgba(26,10,0,0.45)',
    textAlign: 'center',
    marginTop: 3,
  },
})
