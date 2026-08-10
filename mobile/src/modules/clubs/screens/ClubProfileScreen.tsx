import React, { useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ImageBackground,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { X, Users, Star } from 'lucide-react-native'
import { useGlassTheme } from '../../../glassTheme'
import type { GlassThemeColors } from '../../../glassTheme'
import { useAuthStore, resolveApiBase } from '../../../stores/authStore'
import { PlayerAvatar } from '../../../components/PlayerAvatar'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ClubProfile {
  id: string
  name: string
  icon: string | null
  tagline: string | null
  coverImageUrl: string | null
  vibeTag: string | null
  privacy: string
  _count: { members: number; sessions: number }
  creator: { id: string; displayName: string | null } | null
  circleAtVenue: {
    followedPlayers: { userId: string; displayName: string | null; imageUrl: string | null }[]
    count: number
  } | null
  recentMoments: { type: string; playerName: string | null; timestamp: string }[]
  kudosCloud: { emoji: string; count: number }[]
  topHost: { displayName: string | null; imageUrl: string | null; userId: string | null; sessionCount: number } | null
  mySessionCount: number
}

export interface ClubPreviewData {
  name: string
  icon?: string | null
  tagline?: string | null
  coverImageUrl?: string | null
  vibeTag?: string | null
}

interface Props {
  clubId?: string
  previewData?: ClubPreviewData
  onClose: () => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function vibeColor(tag: string | null): string {
  if (!tag) return '#a855f7'
  const lower = tag.toLowerCase()
  if (lower.includes('welcoming')) return '#f472b6'   // pink
  if (lower.includes('competitive')) return '#f59e0b' // gold/amber
  if (lower.includes('social')) return '#84cc16'      // lime
  return '#a855f7'
}

function welcomeCopy(gender: string | null, displayName: string | null, mySessionCount: number): { main: string; sub: string } {
  const firstName = displayName?.split(' ')[0] ?? 'you'
  if (mySessionCount > 0) {
    if (gender === 'woman') {
      return { main: `We love having you here, ${firstName} 💛`, sub: 'You bring the energy!' }
    }
    return { main: `Good to have you here, ${firstName} 💪`, sub: 'The court knows your name.' }
  }
  return { main: 'Ready to play your first session here?', sub: 'Your circle is waiting 👋' }
}

function momentCopy(type: string, playerName: string | null): string {
  const pn = playerName ?? 'A player'
  switch (type) {
    case 'streak_milestone': return `${pn} hit a new streak here 🔥`
    case 'played_today': return `${pn} just played here 🏓`
    case 'venue_regular': return `${pn} became a regular here 🏠`
    default: return `${pn} had a milestone here`
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ClubProfileScreen({ clubId, previewData, onClose }: Props) {
  const T = useGlassTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => createStyles(T), [T])
  const { authedFetch, displayName, gender } = useAuthStore()

  const [profile, setProfile] = useState<ClubProfile | null>(null)
  const [loading, setLoading] = useState(!previewData)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (previewData || !clubId) return
    let cancelled = false
    setLoading(true)
    authedFetch(`/api/app-clubs/${clubId}`)
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        // Flatten: API returns { club: {...}, circleAtVenue, recentMoments, kudosCloud, topHost, mySessionCount }
        setProfile({
          ...data.club,
          circleAtVenue: data.circleAtVenue ?? null,
          recentMoments: data.recentMoments ?? [],
          kudosCloud: data.kudosCloud ?? [],
          topHost: data.topHost ?? null,
          mySessionCount: data.mySessionCount ?? 0,
        })
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [clubId, previewData, authedFetch])

  // Resolve display values (live or preview)
  const name = previewData ? previewData.name : (profile?.name ?? '')
  const icon = previewData ? (previewData.icon ?? null) : (profile?.icon ?? null)
  const tagline = previewData ? (previewData.tagline ?? null) : (profile?.tagline ?? null)
  const coverImageUrl = previewData ? (previewData.coverImageUrl ?? null) : (profile?.coverImageUrl ?? null)
  const vibeTag = previewData ? (previewData.vibeTag ?? null) : (profile?.vibeTag ?? null)
  const memberCount = profile?._count.members ?? 0
  const sessionCount = profile?._count.sessions ?? 0
  const circleAtVenue = profile?.circleAtVenue ?? null
  const recentMoments = profile?.recentMoments ?? []
  const kudosCloud = profile?.kudosCloud ?? []
  const topHost = profile?.topHost ?? null
  const mySessionCount = profile?.mySessionCount ?? 0

  const coverUri = coverImageUrl
    ? (coverImageUrl.startsWith('http')
        ? coverImageUrl
        : `${resolveApiBase()}${coverImageUrl}`)
    : null

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Hero */}
      {coverUri ? (
        <ImageBackground
          source={{ uri: coverUri }}
          style={styles.hero}
          imageStyle={{ borderRadius: 0 }}
        >
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={StyleSheet.absoluteFill}
          />
          <HeroContent
            name={name}
            icon={icon}
            tagline={tagline}
            vibeTag={vibeTag}
            T={T}
            styles={styles}
          />
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={[T.glassPrimary, T.glassPrimaryEnd]}
          style={styles.hero}
        >
          <HeroContent
            name={name}
            icon={icon}
            tagline={tagline}
            vibeTag={vibeTag}
            T={T}
            styles={styles}
          />
        </LinearGradient>
      )}

      {/* Close button overlay */}
      <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 12 }]} onPress={onClose} hitSlop={12}>
        <X size={20} color="#fff" />
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator color={T.glassPrimary} size="large" />
        </View>
      ) : error ? (
        <View style={styles.loader}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 40) }]}
        >
          {/* Stats row */}
          {!previewData && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{memberCount}</Text>
                <Text style={styles.statLabel}>Members</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{sessionCount}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              {mySessionCount > 0 && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{mySessionCount}</Text>
                    <Text style={styles.statLabel}>My sessions</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Personalized welcome */}
          {!previewData && (() => {
            const wc = welcomeCopy(gender ?? null, displayName ?? null, mySessionCount)
            return (
              <View style={[styles.welcomeCard, mySessionCount > 0 ? styles.welcomeCardReturning : styles.welcomeCardNew]}>
                <Text style={styles.welcomeText}>{wc.main}</Text>
                <Text style={styles.welcomeSub}>{wc.sub}</Text>
              </View>
            )
          })()}

          {/* Your circle is here */}
          {circleAtVenue && circleAtVenue.followedPlayers.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Users size={14} color={T.glassPrimary} />
                <Text style={styles.sectionTitle}>Your circle is here</Text>
              </View>
              <View style={styles.circleRow}>
                {circleAtVenue.followedPlayers.slice(0, 5).map((p, i) => (
                  <View
                    key={p.userId}
                    style={[styles.circleAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]}
                  >
                    <PlayerAvatar userId={p.userId} displayName={p.displayName} imageUrl={p.imageUrl} size={36} />
                  </View>
                ))}
                <Text style={styles.circleText}>
                  {circleAtVenue.count === 1
                    ? `${circleAtVenue.followedPlayers[0].displayName ?? 'Someone'} plays here`
                    : `${circleAtVenue.count} friends play here`}
                </Text>
              </View>
            </View>
          )}

          {/* Recent moments */}
          {recentMoments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent moments ✨</Text>
              {recentMoments.map((m, i) => (
                <View key={i} style={styles.momentRow}>
                  <Text style={styles.momentText}>{momentCopy(m.type, m.playerName)}</Text>
                  <Text style={styles.momentTime}>{new Date(m.timestamp).toLocaleDateString()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Kudos cloud */}
          {kudosCloud.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Star size={14} color={T.glassPrimary} />
                <Text style={styles.sectionTitle}>Kudos cloud</Text>
              </View>
              <View style={styles.kudosRow}>
                {kudosCloud.map((k) => (
                  <View key={k.emoji} style={styles.kudosPill}>
                    <Text style={styles.kudosEmoji}>{k.emoji}</Text>
                    <Text style={styles.kudosCount}>{k.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Top host */}
          {topHost && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top host</Text>
              <View style={styles.hostRow}>
                <PlayerAvatar
                  userId={topHost.userId ?? `tophost-${topHost.displayName ?? 'host'}`}
                  displayName={topHost.displayName}
                  imageUrl={topHost.imageUrl}
                  size={40}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.hostName}>{topHost.displayName ?? 'Unknown'}</Text>
                  <Text style={styles.hostMeta}>{topHost.sessionCount} sessions hosted</Text>
                </View>
              </View>
            </View>
          )}

          {/* CTA */}
          {!previewData && (
            <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={onClose}>
              <Text style={styles.ctaText}>See upcoming sessions →</Text>
            </TouchableOpacity>
          )}

          {previewData && (
            <View style={styles.previewBanner}>
              <Text style={styles.previewBannerText}>Preview — finish creating your club to go live</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

// ─── Hero sub-component ────────────────────────────────────────────────────────

function HeroContent({
  name, icon, tagline, vibeTag, T, styles,
}: {
  name: string
  icon: string | null
  tagline: string | null
  vibeTag: string | null
  T: GlassThemeColors
  styles: ReturnType<typeof createStyles>
}) {
  return (
    <View style={styles.heroContent}>
      <Text style={styles.heroIcon}>{icon ?? name.charAt(0).toUpperCase()}</Text>
      <Text style={styles.heroName}>{name}</Text>
      {!!tagline && <Text style={styles.heroTagline}>{tagline}</Text>}
      {!!vibeTag && (
        <View style={[styles.vibePill, { backgroundColor: vibeColor(vibeTag) + '33', borderColor: vibeColor(vibeTag) + '88' }]}>
          <Text style={[styles.vibePillText, { color: '#fff' }]}>{vibeTag}</Text>
        </View>
      )}
    </View>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function createStyles(T: GlassThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: T.bg,
    },
    hero: {
      height: 220,
      justifyContent: 'flex-end',
    },
    heroContent: {
      padding: 20,
    },
    heroIcon: {
      fontSize: 32,
      marginBottom: 4,
    },
    heroName: {
      fontSize: 26,
      fontWeight: '800',
      color: '#fff',
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    heroTagline: {
      fontSize: 14,
      fontStyle: 'italic',
      color: 'rgba(255,255,255,0.85)',
      marginTop: 4,
    },
    vibePill: {
      alignSelf: 'flex-start',
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    vibePillText: {
      fontSize: 12,
      fontWeight: '700',
    },
    closeBtn: {
      position: 'absolute',
      right: 16,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorText: {
      color: '#ef4444',
      fontSize: 14,
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: T.glassCard,
      borderWidth: 1,
      borderColor: T.glassBorder,
      borderRadius: 16,
      paddingVertical: 14,
      marginBottom: 14,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 20,
      fontWeight: '800',
      color: T.text,
    },
    statLabel: {
      fontSize: 11,
      color: T.muted,
      marginTop: 2,
    },
    statDivider: {
      width: 1,
      backgroundColor: T.glassBorder,
    },
    welcomeCard: {
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
    },
    welcomeCardReturning: {
      backgroundColor: '#4c1d9522',
      borderColor: '#7c3aed44',
    },
    welcomeCardNew: {
      backgroundColor: T.glassCard,
      borderColor: '#84cc1644',
    },
    welcomeText: {
      fontSize: 14,
      fontWeight: '700',
      color: T.text,
      lineHeight: 20,
    },
    welcomeSub: {
      fontSize: 13,
      color: T.muted,
      marginTop: 3,
    },
    section: {
      marginBottom: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: T.text,
    },
    circleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    circleAvatar: {
      borderRadius: 18,
      borderWidth: 2,
      borderColor: T.bg,
    },
    circleText: {
      fontSize: 13,
      color: T.muted,
      marginLeft: 10,
      flex: 1,
    },
    momentRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: T.glassBorder,
    },
    momentText: {
      fontSize: 13,
      color: T.text,
      flex: 1,
    },
    momentTime: {
      fontSize: 11,
      color: T.muted,
      marginLeft: 8,
    },
    kudosRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    kudosPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: T.glassCard,
      borderWidth: 1,
      borderColor: T.glassBorder,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    kudosEmoji: {
      fontSize: 16,
    },
    kudosCount: {
      fontSize: 13,
      fontWeight: '700',
      color: T.text,
    },
    hostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: T.glassCard,
      borderWidth: 1,
      borderColor: T.glassBorder,
      borderRadius: 14,
      padding: 12,
    },
    hostName: {
      fontSize: 15,
      fontWeight: '700',
      color: T.text,
    },
    hostMeta: {
      fontSize: 12,
      color: T.muted,
      marginTop: 2,
    },
    cta: {
      backgroundColor: T.glassPrimary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    ctaText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
    previewBanner: {
      backgroundColor: '#f59e0b22',
      borderWidth: 1,
      borderColor: '#f59e0b55',
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
      alignItems: 'center',
    },
    previewBannerText: {
      fontSize: 13,
      color: '#f59e0b',
      fontWeight: '600',
      textAlign: 'center',
    },
  })
}
