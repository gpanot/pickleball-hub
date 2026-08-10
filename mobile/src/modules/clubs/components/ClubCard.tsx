import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useGlassTheme } from '../../../glassTheme'
import type { GlassThemeColors } from '../../../glassTheme'
import { PlayerAvatar } from '../../../components/PlayerAvatar'
import { resolveApiBase } from '../../../stores/authStore'

export interface ClubCardData {
  id: string
  name: string
  icon: string | null
  tagline: string | null
  coverImageUrl: string | null
  vibeTag: string | null
  memberCount: number
  sessionCount: number
  circlePlayers?: { userId: string; displayName: string | null; imageUrl: string | null }[]
  recentActivity?: number
  city?: string | null
  distanceKm?: number
}

interface Props {
  data: ClubCardData
  onPress: () => void
}

function vibeColor(tag: string | null): string {
  if (!tag) return '#a855f7'
  const lower = tag.toLowerCase()
  if (lower.includes('welcoming')) return '#f472b6'   // pink
  if (lower.includes('competitive')) return '#f59e0b' // gold/amber
  if (lower.includes('social')) return '#84cc16'      // lime
  return '#a855f7'
}

export function ClubCard({ data, onPress }: Props) {
  const T = useGlassTheme()
  const styles = useMemo(() => createStyles(T), [T])

  const stackedPlayers = (data.circlePlayers ?? []).slice(0, 4)
  const extraCount = (data.circlePlayers?.length ?? 0) - stackedPlayers.length

  const coverUri = data.coverImageUrl
    ? (data.coverImageUrl.startsWith('http')
        ? data.coverImageUrl
        : `${resolveApiBase()}${data.coverImageUrl}`)
    : null

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Cover photo banner */}
      {coverUri ? (
        <ImageBackground source={{ uri: coverUri }} style={styles.banner} imageStyle={styles.bannerImage}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerName} numberOfLines={1}>{data.name}</Text>
            {!!data.tagline && (
              <Text style={styles.bannerTagline} numberOfLines={1}>{data.tagline}</Text>
            )}
          </View>
          {(data.recentActivity ?? 0) > 0 && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{data.recentActivity}</Text>
            </View>
          )}
        </ImageBackground>
      ) : (
        /* Fallback: no cover photo — gradient banner with initial */
        <LinearGradient
          colors={[T.glassPrimary + 'CC', T.glassPrimaryEnd]}
          style={styles.banner}
        >
          <View style={styles.initialBadge}>
            <Text style={styles.initialText}>{data.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.bannerOverlay}>
            <Text style={styles.bannerName} numberOfLines={1}>{data.name}</Text>
            {!!data.tagline && (
              <Text style={styles.bannerTagline} numberOfLines={1}>{data.tagline}</Text>
            )}
          </View>
          {(data.recentActivity ?? 0) > 0 && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{data.recentActivity}</Text>
            </View>
          )}
        </LinearGradient>
      )}

      {/* Body */}
      <View style={styles.body}>
        {/* Meta */}
        <Text style={styles.meta}>{data.memberCount} members · {data.sessionCount} sessions</Text>

        {/* Signals row */}
        <View style={styles.signalsRow}>
          {!!data.vibeTag && (
            <View style={[styles.vibePill, { backgroundColor: vibeColor(data.vibeTag) + '22', borderColor: vibeColor(data.vibeTag) + '55' }]}>
              <Text style={[styles.vibePillText, { color: vibeColor(data.vibeTag) }]}>{data.vibeTag}</Text>
            </View>
          )}
          {data.distanceKm != null && (
            <View style={styles.statPill}>
              <Text style={styles.statPillText}>
                {data.distanceKm < 1 ? '0 km' : `${Math.round(data.distanceKm)} km`}
                {(data.recentActivity ?? 0) > 0 ? ` · ${data.recentActivity} this month` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Circle row */}
        {stackedPlayers.length > 0 && (
          <View style={styles.circleRow}>
            {stackedPlayers.map((p, i) => (
              <View key={p.userId} style={[styles.stackedAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: stackedPlayers.length - i }]}>
                <PlayerAvatar userId={p.userId} displayName={p.displayName} imageUrl={p.imageUrl} size={28} />
              </View>
            ))}
            {extraCount > 0 && (
              <View style={[styles.extraAvatarBadge, { marginLeft: -10 }]}>
                <Text style={styles.extraAvatarText}>+{extraCount}</Text>
              </View>
            )}
            <Text style={styles.circleText}>
              {stackedPlayers.length === 1
                ? `${stackedPlayers[0].displayName ?? 'Someone'} plays here`
                : `${stackedPlayers.length + extraCount} in your circle play here`}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

function createStyles(T: GlassThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: T.glassCard,
      borderWidth: 1,
      borderColor: T.glassBorder,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 12,
    },
    banner: {
      height: 130,
      justifyContent: 'flex-end',
    },
    bannerImage: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },
    bannerOverlay: {
      padding: 12,
    },
    bannerName: {
      fontSize: 17,
      fontWeight: '800',
      color: '#fff',
      textShadowColor: 'rgba(0,0,0,0.5)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    bannerTagline: {
      fontSize: 12,
      fontStyle: 'italic',
      color: 'rgba(255,255,255,0.85)',
      marginTop: 2,
    },
    initialBadge: {
      position: 'absolute',
      top: 16,
      left: 16,
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    initialText: {
      fontSize: 24,
      fontWeight: '800',
      color: '#fff',
    },
    liveBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: '#22c55e33',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: '#22c55e66',
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#22c55e',
    },
    liveText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#22c55e',
    },
    body: {
      padding: 12,
    },
    meta: {
      fontSize: 12,
      color: T.muted,
      marginBottom: 8,
    },
    signalsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 8,
    },
    vibePill: {
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    vibePillText: {
      fontSize: 11,
      fontWeight: '600',
    },
    statPill: {
      backgroundColor: T.glassBorder,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    statPillText: {
      fontSize: 11,
      color: T.muted,
    },
    circleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    stackedAvatar: {
      borderRadius: 14,
      borderWidth: 2,
      borderColor: T.glassCard,
    },
    extraAvatarBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: T.glassPrimary + '33',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: T.glassCard,
    },
    extraAvatarText: {
      fontSize: 9,
      fontWeight: '700',
      color: T.glassPrimary,
    },
    circleText: {
      fontSize: 12,
      color: T.muted,
      flex: 1,
    },
  })
}
