import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { T } from '../theme'

interface LiveVenue {
  venueName: string
  sessionId: number
  startTime: string
  endTime: string
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

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}${m > 0 ? `:${String(m).padStart(2, '0')}` : ''} ${ampm}`
}

function minutesUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 60000)
}

function sessionDurationHours(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000)
}

interface Props {
  venue: LiveVenue
  onPlayerPress: (userId: string) => void
}

export function PresenceCard({ venue, onPlayerPress }: Props) {
  const minsLeft = minutesUntil(venue.endTime)
  const durationH = sessionDurationHours(venue.startTime, venue.endTime)
  const endingSoon = minsLeft <= 60

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
    if (venue.nextSessionTime) {
      return (
        <Text style={s.nextSession}>
          Next session {formatTime(venue.nextSessionTime)} →
        </Text>
      )
    }
    return (
      <Text style={s.endsAt}>Ends at {formatTime(venue.endTime)}</Text>
    )
  }

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View>
          <Text style={s.venueName}>{venue.venueName}</Text>
          <Text style={s.sessionTime}>
            {formatTime(venue.startTime)} · {durationH}h session
          </Text>
        </View>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={s.body}>
        <View style={s.playersRow}>
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
          <Text style={s.circleInfo}>
            <Text style={s.circleNames}>{circleNames}</Text>
            {extraCircle}
          </Text>
        </View>

        <View style={s.footer}>
          <Text style={s.footerLeft}>
            {formatTime(venue.startTime)} · {durationH}h session
          </Text>
          {footerRight()}
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
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
    padding: 10,
  },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  playerAvWrap: {
    marginRight: -6,
  },
  playerAv: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#0a0a0a',
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
    backgroundColor: '#141414',
    borderColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerMoreText: {
    fontSize: 8,
    color: '#555',
  },
  circleInfo: {
    fontSize: 10,
    color: '#555',
    marginLeft: 12,
    flex: 1,
    flexWrap: 'wrap',
  },
  circleNames: {
    color: '#5DCAA5',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    fontSize: 10,
    color: '#2a2a2a',
  },
  endsAt: {
    fontSize: 10,
    color: '#444',
  },
  endingSoon: {
    backgroundColor: '#1f1400',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  endingSoonText: {
    fontSize: 10,
    color: '#f5a623',
    fontWeight: '500',
  },
  nextSession: {
    fontSize: 10,
    color: '#f5a623',
  },
})
