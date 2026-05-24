import React from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
} from 'react-native'
import { Clock, Users, MapPin, ExternalLink } from 'lucide-react-native'
import { T } from '../theme'
import { RING_COLORS } from '../data'
import { PlayerAvatar } from './PlayerAvatar'

export interface FriendGoingItem {
  sessionId: number
  name: string
  venueName: string
  startTime: string
  scrapedDate?: string
  spotsLeft: number
  totalSpots: number
  eventUrl: string
  matchScore: number
  friendCount: number
  friends: Array<{
    userId: string
    displayName: string
    imageUrl: string | null
    duprDoubles: number | null
  }>
  totalRoster: number
}

interface Props {
  item: FriendGoingItem
  isTop?: boolean
  onPlayerPress?: (userId: string) => void
}

/* ── small fill-rate bar ──────────────────────────────────────── */
function FillBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.min(filled / total, 1) : 0
  const color = pct >= 0.85 ? '#ef4444' : pct >= 0.6 ? T.amber : T.green
  return (
    <View style={fb.track}>
      <View style={[fb.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
    </View>
  )
}

const fb = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    flex: 1,
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
})

/* ── FriendGoingCard ──────────────────────────────────────────── */
export function FriendGoingCard({ item, isTop = false, onPlayerPress }: Props) {
  const joined = item.totalSpots - item.spotsLeft
  const fillPct = item.totalSpots > 0 ? Math.round((joined / item.totalSpots) * 100) : 0
  const mc =
    item.matchScore === 0
      ? '#666'
      : item.matchScore >= 85
        ? T.amber
        : item.matchScore >= 70
          ? 'rgba(255,255,255,0.6)'
          : 'rgba(255,255,255,0.35)'

  const friendLabel =
    item.friendCount === 1
      ? `${item.friends[0]?.displayName ?? 'A friend'} is going`
      : `${item.friends[0]?.displayName ?? 'A friend'} +${item.friendCount - 1} going`

  return (
    <View style={[s.card, isTop && s.cardTop]}>
      {/* ── Top row: name + match score ── */}
      <View style={s.topRow}>
        <View style={s.nameCol}>
          {isTop && (
            <View style={s.hotPill}>
              <Text style={s.hotPillText}>🔥 Friends going</Text>
            </View>
          )}
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
        </View>
        {item.matchScore > 0 && (
          <View style={s.scoreBox}>
            <Text style={[s.scorePct, { color: mc }]}>{item.matchScore}%</Text>
            <Text style={s.scoreLabel}>match</Text>
          </View>
        )}
      </View>

      {/* ── Meta row: time + venue ── */}
      <View style={s.metaRow}>
        <Clock size={11} color={T.amber} strokeWidth={2} />
        <Text style={s.metaText}>{item.startTime}</Text>
        <Text style={s.metaDot}>·</Text>
        <MapPin size={11} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
        <Text style={s.metaText} numberOfLines={1}>{item.venueName}</Text>
      </View>

      {/* ── Friends strip ── */}
      <View style={s.friendsRow}>
        <View style={s.avatarStack}>
          {item.friends.slice(0, 3).map((f, i) => (
            <TouchableOpacity
              key={`fg-friend-${f.userId}-${i}`}
              onPress={() => onPlayerPress?.(f.userId)}
              activeOpacity={onPlayerPress ? 0.75 : 1}
              style={[
                s.avatarWrap,
                i > 0 && { marginLeft: -8 },
                {
                  borderColor: RING_COLORS[i % RING_COLORS.length],
                  zIndex: 3 - i,
                },
              ]}
            >
              <PlayerAvatar
                userId={f.userId}
                displayName={f.displayName}
                imageUrl={f.imageUrl}
                size={28}
              />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.friendLabel} numberOfLines={1}>{friendLabel}</Text>
      </View>

      {/* ── Capacity strip ── */}
      <View style={s.capacityRow}>
        <Users size={11} color="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <Text style={s.capacityText}>{joined}/{item.totalSpots} joined</Text>
        <FillBar filled={joined} total={item.totalSpots} />
        <Text style={[s.spotsText, item.spotsLeft <= 3 && { color: '#ef4444' }]}>
          {item.spotsLeft} left
        </Text>
      </View>

      {/* ── CTA ── */}
      <TouchableOpacity
        style={s.joinBtn}
        onPress={() => item.eventUrl && Linking.openURL(item.eventUrl)}
        activeOpacity={0.85}
      >
        <ExternalLink size={13} color="#1a0a00" strokeWidth={2.5} />
        <Text style={s.joinBtnText}>Join on Reclub</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#121212',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 14,
    gap: 10,
  },
  cardTop: {
    borderColor: 'rgba(245,166,35,0.3)',
    backgroundColor: '#140f00',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  hotPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(245,166,35,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.2)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hotPillText: {
    fontSize: 10,
    color: T.amber,
    fontWeight: '600',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f0f0f0',
    lineHeight: 20,
  },
  scoreBox: {
    alignItems: 'center',
    flexShrink: 0,
  },
  scorePct: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
  scoreLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  metaDot: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
  },
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  friendLabel: {
    flex: 1,
    fontSize: 12,
    color: '#ccc',
    fontWeight: '500',
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  capacityText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    minWidth: 60,
  },
  spotsText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    minWidth: 36,
    textAlign: 'right',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: T.amber,
    borderRadius: 10,
    paddingVertical: 10,
  },
  joinBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a0a00',
  },
})
