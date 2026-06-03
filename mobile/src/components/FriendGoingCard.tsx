import React, { useRef, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Animated,
  Modal,
} from 'react-native'
import { Users, Clock, X } from 'lucide-react-native'
import { T } from '../theme'
import { RING_COLORS, type Session } from '../data'
import { PlayerAvatar } from './PlayerAvatar'

export interface FriendGoingItem {
  sessionId: number
  name: string
  cleanName?: string
  clubName: string
  venueName: string
  distanceKm?: number | null
  startTime: string
  scrapedDate?: string
  spotsLeft: number
  totalSpots: number
  eventUrl: string
  matchScore: number
  fillRate?: number | null
  fillingFast?: boolean
  friendCount: number
  friends: Array<{
    userId: string
    displayName: string
    imageUrl: string | null
    duprDoubles: number | null
  }>
  topDupr?: Array<{
    userId: string
    displayName: string | null
    imageUrl: string | null
    duprDoubles: number | null
    isFollowing?: boolean
  }>
  totalRoster: number
  duprCount?: number
  duprRange?: { min: number; max: number } | null
  returningPlayerPct?: number | null
  vibeTag?: string
  /** User's own DUPR, used for score breakdown display only */
  userDupr?: number | null
}

interface Props {
  item: FriendGoingItem
  onFriendsPress?: () => void
  isTop?: boolean
  dimLevel?: number
  /** Opens top-DUPR player list modal (same as swipe card). */
  onTopDuprPress?: () => void
  /** Tap anywhere on the card (except friends row) opens DUPR modal. */
  onCardPress?: () => void
  isSignedIn?: boolean
}

/* ── Score breakdown computation (mirrors src/lib/match-score.ts) ── */
function computeBreakdown(item: FriendGoingItem) {
  const userDupr = item.userDupr ?? null
  const sessionAvgDupr = item.duprRange
    ? Math.round(((item.duprRange.min + item.duprRange.max) / 2) * 10) / 10
    : null

  let duprScore = 28
  if (userDupr !== null && sessionAvgDupr !== null) {
    const diff = Math.abs(userDupr - sessionAvgDupr)
    if (diff <= 0.2) duprScore = 55
    else if (diff <= 0.4) duprScore = 44
    else if (diff <= 0.6) duprScore = 33
    else if (diff <= 1.0) duprScore = 18
    else duprScore = 5
  }

  const fillRate = item.fillRate != null
    ? item.fillRate
    : item.totalSpots > 0 ? (item.totalSpots - item.spotsLeft) / item.totalSpots : 0
  let fillScore = 5
  if (fillRate >= 0.75) fillScore = 30
  else if (fillRate >= 0.50) fillScore = 22
  else if (fillRate >= 0.25) fillScore = 12

  const rPct = item.returningPlayerPct
  let communityScore = 7
  if (rPct !== null && rPct !== undefined) {
    const pct = rPct > 1 ? rPct / 100 : rPct
    if (pct >= 0.6) communityScore = 15
    else if (pct >= 0.4) communityScore = 10
    else if (pct >= 0.2) communityScore = 5
    else communityScore = 3
  }

  return { duprScore, fillScore, communityScore, total: Math.min(100, duprScore + fillScore + communityScore) }
}

/* ── Score breakdown popup ─────────────────────────────────────── */
const CRITERIA_BAR_COLOR = '#4ade80'

function ScoreBreakdownPopup({
  visible,
  onClose,
  item,
  scoreColor,
}: {
  visible: boolean
  onClose: () => void
  item: FriendGoingItem
  scoreColor: string
}) {
  const { duprScore, fillScore, communityScore, total } = computeBreakdown(item)
  const totalPoints = duprScore + fillScore + communityScore
  const rows = [
    { label: 'DUPR fit', pts: duprScore, max: 55, hint: item.userDupr == null ? 'No DUPR set' : undefined },
    { label: 'Fill rate', pts: fillScore, max: 30, hint: undefined },
    { label: 'Returning players', pts: communityScore, max: 15, hint: item.returningPlayerPct == null ? 'No data' : undefined },
  ]
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={bp.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}} style={bp.card}>
          <View style={bp.header}>
            <Text style={bp.title}>Match score</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={18} color="#777" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <Text style={[bp.total, { color: scoreColor }]}>{total}%</Text>
          <View style={bp.divider} />
          {rows.map((row) => (
            <View key={row.label} style={bp.row}>
              <View style={{ flex: 1 }}>
                <Text style={bp.rowLabel}>{row.label}</Text>
                {row.hint && <Text style={bp.rowHint}>{row.hint}</Text>}
              </View>
              <View style={bp.barWrap}>
                <View style={[bp.barFill, { width: `${Math.round((row.pts / row.max) * 100)}%`, backgroundColor: CRITERIA_BAR_COLOR }]} />
              </View>
              <Text style={bp.rowPts}>+{row.pts}<Text style={bp.rowPtsUnit}>pts</Text></Text>
            </View>
          ))}
          <View style={bp.divider} />
          <Text style={bp.totalPts}>Total = {totalPoints} points</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

/* ── Match score: green / yellow / light red ─────────────────── */
function matchScoreColor(score: number): string {
  if (score <= 0 || score < 50) return '#f87171'
  // Interpolate amber → green for 50–100
  const t = (score - 50) / 50
  const r = Math.round(0xf5 + t * (0x1D - 0xf5))
  const g = Math.round(0xa6 + t * (0x9E - 0xa6))
  const b = Math.round(0x23 + t * (0x75 - 0x23))
  return `rgb(${r},${g},${b})`
}

function averageTopDupr(players: FriendGoingItem['topDupr']): number | null {
  const vals = (players ?? [])
    .map((p) => p.duprDoubles)
    .filter((d): d is number => d != null && d > 0)
  if (vals.length === 0) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.round(avg * 100) / 100
}

/* ── small fill-rate bar ──────────────────────────────────────── */
function FillBar({ filled, total }: { filled: number; total: number }) {
  const pct = total > 0 ? Math.min(filled / total, 1) : 0
  return (
    <View style={fb.track}>
      <View
        style={[
          fb.fill,
          { width: `${Math.round(pct * 100)}%`, backgroundColor: T.amber },
        ]}
      />
    </View>
  )
}

export function getStartHour(item: FriendGoingItem): number {
  const d = item.scrapedDate
    ? new Date(`${item.scrapedDate}T${item.startTime}:00`)
    : new Date(item.startTime)
  if (!isNaN(d.getTime())) return d.getHours()
  return parseInt(item.startTime.split(':')[0] ?? '12', 10)
}

function getStartMinutes(item: FriendGoingItem): number {
  const d = item.scrapedDate
    ? new Date(`${item.scrapedDate}T${item.startTime}:00`)
    : new Date(item.startTime)
  if (!isNaN(d.getTime())) return d.getMinutes()
  return parseInt(item.startTime.split(':')[1] ?? '0', 10)
}

function periodSocialTitle(h: number): string {
  if (h < 12) return 'MORNING SOCIAL'
  if (h < 17) return 'AFTERNOON SOCIAL'
  return 'EVENING SOCIAL'
}

function formatStartTimePill(h: number, mins: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${mins > 0 ? `:${String(mins).padStart(2, '0')}` : ''} ${ampm}`
}

function periodLabel(h: number): string {
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

export function sessionToFriendGoingItem(session: Session): FriendGoingItem {
  const topDupr = session.roster
    .filter((p) => p.duprDoubles != null && p.duprDoubles > 0)
    .sort((a, b) => (b.duprDoubles ?? 0) - (a.duprDoubles ?? 0))
    .slice(0, 8)
    .map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      imageUrl: p.imageUrl,
      duprDoubles: p.duprDoubles,
      isFollowing: p.isFollowing ?? false,
    }))

  const duprCount = session.roster.filter(
    (p) => p.duprDoubles != null && p.duprDoubles > 0,
  ).length

  return {
    sessionId: session.id,
    name: session.name,
    clubName: session.club?.name ?? '',
    venueName: session.venue?.name ?? session.club?.name ?? '',
    distanceKm: session.distanceKm,
    startTime: session.startTime,
    spotsLeft: session.spotsLeft,
    totalSpots: session.maxPlayers,
    eventUrl: session.eventUrl,
    matchScore: session.matchScore,
    fillingFast: session.fillingFast,
    friendCount: session.friendCount,
    friends: session.friends.map((f) => ({
      userId: f.userId,
      displayName: f.displayName,
      imageUrl: f.imageUrl,
      duprDoubles: f.duprDoubles ?? null,
    })),
    topDupr,
    totalRoster: session.roster.length,
    duprCount,
  }
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
export function FriendGoingCard({
  item,
  onFriendsPress,
  isTop = false,
  dimLevel = 0,
  onTopDuprPress,
  onCardPress,
  isSignedIn,
}: Props) {
  const joined = item.totalSpots - item.spotsLeft
  const pulseAnim = useRef(new Animated.Value(1)).current
  const [scorePopupVisible, setScorePopupVisible] = useState(false)

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.2,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulseAnim])

  const showFillingFast =
    item.fillingFast ||
    (item.spotsLeft != null &&
      item.totalSpots != null &&
      (item.totalSpots - item.spotsLeft) / item.totalSpots >= 0.75)

  const friendLabel =
    item.friendCount === 1
      ? `${item.friends[0]?.displayName ?? 'A friend'} is going`
      : `${item.friends[0]?.displayName ?? 'A friend'} +${item.friendCount - 1} going`

  const startHour = getStartHour(item)
  const startMins = getStartMinutes(item)
  const scoreColor = matchScoreColor(item.matchScore)
  const avgDupr = averageTopDupr(item.topDupr)
  const showSpotsLeftPill = !showFillingFast && item.spotsLeft > 0 && item.spotsLeft <= 5

  const cardTappable = !!(onCardPress || onTopDuprPress)
  const handleCardPress = onCardPress ?? onTopDuprPress

  return (
    <TouchableOpacity
      activeOpacity={cardTappable ? 0.85 : 1}
      onPress={handleCardPress}
      disabled={!cardTappable}
      style={s.card}
    >
      {/* ① Header */}
      <View style={s.fcHeader}>
        <View style={s.fcHeaderLeft}>
          <Text style={s.fcVenue} numberOfLines={1}>
            {item.clubName}
          </Text>
        </View>
        <TouchableOpacity
          style={s.fcScoreBadge}
          onPress={(e) => { e.stopPropagation?.(); setScorePopupVisible(true) }}
          activeOpacity={0.7}
          hitSlop={8}
        >
          <Text style={[s.fcScoreNum, { color: scoreColor }]}>
            {item.matchScore}%
          </Text>
          <Text style={s.fcScoreLbl}>match ⓘ</Text>
        </TouchableOpacity>
      </View>

      {/* ② Pills row */}
      <View style={s.pillsRow}>
        {/* Time pill with clock icon replaces spots-left pill */}
        <View style={s.fcTimePill}>
          <Clock size={10} color={T.amber} strokeWidth={2} />
          <Text style={s.fcTimePillText}>
            {formatStartTimePill(startHour, startMins)}
            {item.distanceKm != null ? ` · ${item.distanceKm.toFixed(1)} km` : ''}
          </Text>
        </View>
        {showFillingFast && (
          <View style={s.fcFillingBadge}>
            <Animated.View style={[s.fcFillingDot, { opacity: pulseAnim }]} />
            <Text style={s.fcFillingText}>Filling fast</Text>
          </View>
        )}
      </View>

      {/* ③ Friends row */}
      {item.friendCount > 0 && (
        <TouchableOpacity
          style={s.friendsRow}
          onPress={() => onFriendsPress?.()}
          activeOpacity={onFriendsPress ? 0.75 : 1}
          disabled={!onFriendsPress}
        >
          <View style={s.avatarStack}>
            {item.friends.slice(0, 3).map((f, i) => (
              <View
                key={`fg-friend-${f.userId}-${i}`}
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
              </View>
            ))}
          </View>
          <Text style={s.friendLabel} numberOfLines={1}>{friendLabel}</Text>
        </TouchableOpacity>
      )}

      {/* ④ Top 8 DUPR */}
      {item.topDupr && item.topDupr.length > 0 && (
        <View style={s.duprSection}>
          <View style={s.duprRow}>
            <TouchableOpacity
              style={s.avatarStack}
              onPress={() => onTopDuprPress?.()}
              disabled={!onTopDuprPress}
              activeOpacity={onTopDuprPress ? 0.75 : 1}
            >
              {item.topDupr.map((p, i) => (
                <View
                  key={p.userId}
                  style={[
                    s.avatarWrap,
                    s.duprAvatarWrap,
                    i > 0 && { marginLeft: -8 },
                    { zIndex: item.topDupr!.length - i },
                  ]}
                >
                  <PlayerAvatar
                    userId={p.userId}
                    displayName={p.displayName ?? '?'}
                    imageUrl={p.imageUrl}
                    size={28}
                  />
                </View>
              ))}
            </TouchableOpacity>
            {avgDupr != null && (
              <TouchableOpacity
                style={s.avgDuprTag}
                onPress={() => onTopDuprPress?.()}
                disabled={!onTopDuprPress}
                activeOpacity={onTopDuprPress ? 0.75 : 1}
              >
                <Text style={s.avgDuprLbl}>Top 8 AVG</Text>
                <Text style={s.avgDuprVal}>{avgDupr.toFixed(2)}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* ⑤ Fill bar */}
      <View style={s.capacityRow}>
        <Users size={11} color="rgba(255,255,255,0.35)" strokeWidth={1.5} />
        <Text style={s.capacityText}>{joined}/{item.totalSpots} joined</Text>
        <FillBar filled={joined} total={item.totalSpots} />
        <Text style={[s.spotsText, item.spotsLeft <= 5 && { color: T.amber }]}>
          {item.spotsLeft} left
        </Text>
      </View>

      {/* ⑥ Join */}
      <TouchableOpacity
        style={s.joinBtn}
        onPress={() => item.eventUrl && Linking.openURL(item.eventUrl)}
        activeOpacity={0.85}
      >
        <Text style={s.joinBtnText}>Join on Reclub</Text>
      </TouchableOpacity>

      <ScoreBreakdownPopup
        visible={scorePopupVisible}
        onClose={() => setScorePopupVisible(false)}
        item={item}
        scoreColor={scoreColor}
      />
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#140f00',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(245,166,35,0.55)',
    paddingBottom: 14,
    gap: 6,
  },
  fcHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 12,
    paddingBottom: 2,
    gap: 8,
  },
  fcHeaderLeft: {
    flex: 1,
    minWidth: 0,
  },
  fcSocialName: {
    fontSize: 9,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  fcVenue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 18,
  },
  fcScoreBadge: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  fcScoreNum: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 22,
  },
  fcScoreLbl: {
    fontSize: 7,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.04,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  fcFillingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0a1f0a',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fcFillingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1D9E75',
  },
  fcFillingText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#1D9E75',
  },
  fcTimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: 'rgba(245,166,35,0.45)',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  fcTimePillText: {
    fontSize: 10,
    fontWeight: '500',
    color: T.amber,
  },
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
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
  duprSection: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    gap: 6,
  },
  duprRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  duprAvatarWrap: {
    borderColor: 'rgba(245,166,35,0.45)',
  },
  avgDuprTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1a1408',
    borderWidth: 0.5,
    borderColor: 'rgba(245,166,35,0.35)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  avgDuprLbl: {
    fontSize: 8,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.4,
  },
  avgDuprVal: {
    fontSize: 11,
    fontWeight: '700',
    color: T.amber,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    paddingHorizontal: 12,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.amber,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    alignSelf: 'flex-end',
  },
  joinBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a0a00',
  },
})

const bp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 20,
    width: '100%',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  total: {
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 40,
  },
  divider: {
    height: 0.5,
    backgroundColor: '#2a2a2a',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    color: '#ccc',
    fontWeight: '500',
  },
  rowHint: {
    fontSize: 10,
    color: '#666',
    marginTop: 1,
  },
  barWrap: {
    height: 4,
    width: 60,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  rowPts: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    minWidth: 52,
    textAlign: 'right',
  },
  rowPtsUnit: {
    fontSize: 11,
    fontWeight: '400',
    color: '#aaa',
  },
  totalPts: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
    textAlign: 'right',
  },
})
