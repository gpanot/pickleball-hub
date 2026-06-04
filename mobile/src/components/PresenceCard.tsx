import React, { useEffect, useRef, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Linking } from 'react-native'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { formatTime } from '../data'

interface LiveVenue {
  venueName: string
  sessionId: number
  startTime: string
  endTime: string
  eventUrl: string
  players: Array<{
    userId: string
    displayName: string | null
    imageUrl: string | null
    duprDoubles: number | null
  }>
  totalRoster: number
  circleCount: number
  nextSessionTime: string | null
}

function parseClockTime(clock: string): { hours: number; minutes: number } {
  const [hStr, mStr] = clock.split(':')
  return { hours: parseInt(hStr, 10), minutes: parseInt(mStr ?? '0', 10) }
}

function minutesUntil(endClock: string): number {
  const { hours, minutes } = parseClockTime(endClock)
  const end = new Date()
  end.setHours(hours, minutes, 0, 0)
  return Math.floor((end.getTime() - Date.now()) / 60000)
}

function sessionDurationHours(start: string, end: string): number {
  const s = parseClockTime(start)
  const e = parseClockTime(end)
  const startMins = s.hours * 60 + s.minutes
  const endMins = e.hours * 60 + e.minutes
  const diff = endMins >= startMins ? endMins - startMins : endMins + 24 * 60 - startMins
  return Math.max(1, Math.round(diff / 60))
}

function truncateVenueName(name: string, maxLen = 28): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name
}

interface Props {
  venue: LiveVenue
  onPlayerPress: (userId: string) => void
  onShowRoster?: (sessionId: number) => void
}

export function PresenceCard({ venue, onPlayerPress, onShowRoster }: Props) {
  const T = useTheme()
  const s = useMemo(() => createS(T), [T])
  const minsLeft = minutesUntil(venue.endTime)
  const durationH = sessionDurationHours(venue.startTime, venue.endTime)
  const endingSoon = minsLeft <= 60

  const dotOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [dotOpacity])

  const circleNames = venue.players
    .slice(0, 2)
    .map(p => p.displayName?.split(' ')[0] ?? 'Player')
    .join(', ')

  const extraCircle = venue.circleCount > 2
    ? ` + ${venue.circleCount - 2} more from your circle`
    : ' from your circle'

  const footerRight = () => {
    if (endingSoon) {
      return (
        <View style={s.endingSoon}>
          <Text style={s.endingSoonText}>⚡ Ending soon · {minsLeft}m left</Text>
        </View>
      )
    }
    return (
      <TouchableOpacity
        style={s.checkClubBtn}
        onPress={() => venue.eventUrl && Linking.openURL(venue.eventUrl)}
        activeOpacity={0.75}
      >
        <Text style={s.checkClubText}>Check club</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.venueName} numberOfLines={1} ellipsizeMode="tail">
            {truncateVenueName(venue.venueName)}
          </Text>
          <Text style={s.sessionTime}>
            {formatTime(venue.startTime)} · {durationH}h session
          </Text>
        </View>
        <View style={s.liveBadge}>
          <Animated.View style={[s.liveDot, { opacity: dotOpacity }]} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={s.body}>
        <View style={s.playersRow}>
          <View style={s.playersRowMain}>
            {venue.players.slice(0, 3).map((p, i) => (
              <TouchableOpacity
                key={p.userId}
                style={[s.playerAvWrap, { zIndex: 4 - i }]}
                onPress={() => onPlayerPress(p.userId)}>
                {p.imageUrl ? (
                  <Image
                    source={{ uri: p.imageUrl }}
                    style={s.playerAv}
                    resizeMode="cover" />
                ) : (
                  <View style={[s.playerAv, s.playerAvFallback]}>
                    <Text style={s.playerAvInitial}>
                      {(p.displayName ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
            {venue.totalRoster > 3 && (
              <View style={[s.playerAvWrap, s.playerMore]}>
                <Text style={s.playerMoreText}>+{venue.totalRoster - 3}</Text>
              </View>
            )}
            <Text style={s.circleInfo} numberOfLines={2} ellipsizeMode="tail">
              <Text style={s.circleNames}>{circleNames}</Text>
              {extraCircle}
            </Text>
          </View>
          <View style={s.btnGroup}>
            {onShowRoster && (
              <TouchableOpacity
                style={s.showMeBtn}
                onPress={() => onShowRoster(venue.sessionId)}
                activeOpacity={0.85}
              >
                <Text style={s.showMeBtnText}>Show me</Text>
              </TouchableOpacity>
            )}
            {footerRight()}
          </View>
        </View>
      </View>
    </View>
  )
}

function createS(T: ThemeColors) {
  return StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#0d1a0d',
    borderWidth: 0.5,
    borderColor: '#1D9E75',
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#0a1f0a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  venueName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5DCAA5',
  },
  sessionTime: {
    fontSize: 9,
    color: '#0F6E56',
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1D9E75',
  },
  liveText: {
    fontSize: 9,
    color: '#1D9E75',
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  body: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playersRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  playerAvWrap: {
    marginRight: -6,
  },
  playerAv: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: T.bg,
    overflow: 'hidden',
  },
  playerAvFallback: {
    backgroundColor: '#1a2a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvInitial: {
    fontSize: 10,
    fontWeight: '600',
    color: '#5DCAA5',
  },
  playerMore: {
    backgroundColor: T.input,
    borderColor: T.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerMoreText: {
    fontSize: 8,
    color: T.muted,
  },
  circleInfo: {
    fontSize: 10,
    color: T.muted,
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
  },
  circleNames: {
    color: '#5DCAA5',
    fontWeight: '500',
  },
  endsAt: {
    fontSize: 10,
    color: T.muted,
  },
  endingSoon: {
    backgroundColor: '#1f1400',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
    alignSelf: 'center',
  },
  endingSoonText: {
    fontSize: 10,
    color: T.amber,
    fontWeight: '500',
  },
  checkClubBtn: {
    backgroundColor: T.amber,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
    alignSelf: 'center',
  },
  checkClubText: {
    fontSize: 10,
    fontWeight: '600',
    color: T.textOnPrimary,
  },
  btnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  showMeBtn: {
    backgroundColor: '#1D9E75',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  showMeBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: T.text,
  },
})
}
