/**
 * ClubhouseChoiceStep — Phase 3 of the Gang-first onboarding funnel.
 *
 * Merged screen: "Find a Clubhouse for your Gang"
 * - Compact Create card at the top → create-squad
 * - Inline nearby squads list; tapping Join on a card → join-preview for that squad
 * - "Explore app first" escape hatch at bottom
 *
 * The old two-screen split (ClubhouseChoiceStep → SquadBrowseScreen) is gone.
 * SquadBrowseScreen is kept for the post-onboarding flow (SquadModule, etc.)
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { Building2 } from 'lucide-react-native'
import { getNearbySquads } from '../../modules/squad/api'
import { OnboardingShell, SecondaryButton } from '../OnboardingShell'
import { onboardingStorage } from '../onboardingStorage'
import type { NearbySquad } from '../../modules/squad/types'

const LIME = '#a3e635'
const LIME_DARK = '#65a30d'
const LIME_DIM = 'rgba(163,230,53,0.13)'
const GOLD = '#facc15'
const MUTED2 = '#71717a'
const MUTED3 = '#a1a1aa'
const BANGERS = 'Bangers_400Regular'
const BG2 = '#18181b'
const BORDER = 'rgba(255,255,255,0.07)'
const INITIAL_SHOWN = 3

interface Props {
  onCreate: () => void
  onJoin: (code: string) => void
  onBrowseAll?: () => void
  onBack?: () => void
  onExplorePause?: () => void
  /** Pre-fetched squads from InviteGangStep — skips the location + API call on this screen. */
  prefetchedSquads?: NearbySquad[]
}

type ListItem =
  | { type: 'create' }
  | { type: 'sectionLabel' }
  | { type: 'squad'; squad: NearbySquad }
  | { type: 'browseAll' }
  | { type: 'showMore'; total: number }
  | { type: 'empty' }
  | { type: 'loading' }
  | { type: 'footer' }

export function ClubhouseChoiceStep({ onCreate, onJoin, onBrowseAll, onBack, onExplorePause, prefetchedSquads }: Props) {
  const insets = useSafeAreaInsets()
  // If prefetchedSquads is provided (pre-warmed by InviteGangStep), use it immediately.
  const [squads, setSquads] = useState<NearbySquad[]>(prefetchedSquads ?? [])
  const [loading, setLoading] = useState(prefetchedSquads === undefined)
  const [showAll, setShowAll] = useState(false)
  const [locationDenied, setLocationDenied] = useState(false)

  const requestLocationAndLoad = useCallback(async () => {
    setLocationDenied(false)
    setLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationDenied(true)
        setSquads([])
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
      const data = await getNearbySquads(loc.coords.latitude, loc.coords.longitude, 100)
      setSquads(data.squads ?? [])
    } catch {
      setSquads([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Skip own fetch if the Orchestrator already pre-fetched while the user was on InviteGangStep.
    if (prefetchedSquads !== undefined) return
    requestLocationAndLoad()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExplore() {
    await onboardingStorage.setExplorePaused(true)
    onExplorePause?.()
  }

  const visibleSquads = showAll ? squads : squads.slice(0, INITIAL_SHOWN)
  const hasMore = squads.length > INITIAL_SHOWN && !showAll

  const listData: ListItem[] = [
    { type: 'create' },
    { type: 'sectionLabel' },
    ...(onBrowseAll ? [{ type: 'browseAll' } as ListItem] : []),
    ...(loading
      ? [{ type: 'loading' } as ListItem]
      : visibleSquads.length === 0
        ? [{ type: 'empty' } as ListItem]
        : visibleSquads.map((sq) => ({ type: 'squad', squad: sq } as ListItem))),
    ...(hasMore ? [{ type: 'showMore', total: squads.length } as ListItem] : []),
    { type: 'footer' },
  ]

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'create') {
      return (
        <View style={styles.createCard}>
          <View style={styles.createIconWrap}>
            <Building2 size={24} color={LIME} strokeWidth={1.8} />
          </View>
          <View style={styles.createBody}>
            <Text style={styles.createTitle}>Create a clubhouse</Text>
            <Text style={styles.createSub}>Your Gang becomes the founding pod</Text>
          </View>
          <TouchableOpacity onPress={onCreate} activeOpacity={0.85}>
            <LinearGradient colors={[LIME, LIME_DARK]} style={styles.createBtn}>
              <Text style={styles.createBtnText}>Create</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )
    }

    if (item.type === 'sectionLabel') {
      return <Text style={styles.sectionLabel}>OR JOIN ONE NEARBY</Text>
    }

    if (item.type === 'browseAll') {
      return (
        <TouchableOpacity style={styles.browseAllBtn} onPress={onBrowseAll} activeOpacity={0.7}>
          <Text style={{ fontSize: 16 }}>📍</Text>
          <Text style={styles.browseAllText}>Browse squads near me</Text>
        </TouchableOpacity>
      )
    }

    if (item.type === 'loading') {
      return <ActivityIndicator color={LIME} style={styles.loader} />
    }

    if (item.type === 'empty') {
      if (locationDenied) {
        return (
          <View style={styles.locationDeniedWrap}>
            <Text style={styles.emptyText}>
              Location access is needed to find nearby clubhouses.
            </Text>
          </View>
        )
      }
      return (
        <Text style={styles.emptyText}>
          No clubhouses found nearby yet.{'\n'}Be the first to create one!
        </Text>
      )
    }

    if (item.type === 'showMore') {
      return (
        <TouchableOpacity onPress={() => setShowAll(true)} activeOpacity={0.7} style={styles.showMoreBtn}>
          <Text style={styles.showMoreText}>See more nearby</Text>
        </TouchableOpacity>
      )
    }

    if (item.type === 'footer') {
      return (
        <View style={[styles.footerWrap, { paddingBottom: insets.bottom + 16 }]}>
          {locationDenied && (
            <TouchableOpacity
              style={styles.enableLocationBtn}
              onPress={requestLocationAndLoad}
              activeOpacity={0.85}
            >
              <Text style={styles.enableLocationText}>Enable Location First</Text>
            </TouchableOpacity>
          )}
          {onExplorePause && (
            <SecondaryButton label="Explore app first" onPress={handleExplore} />
          )}
        </View>
      )
    }

    // squad card — whole card is tappable (same as tapping Join)
    const sq = item.squad
    const duprLabel = sq.avgDupr != null ? `DUPR avg ${sq.avgDupr.toFixed(1)}` : null
    const meta = [
      `${sq.memberCount}/${sq.maxMembers}`,
      duprLabel,
      sq.sessions != null ? `${sq.sessions} session${sq.sessions !== 1 ? 's' : ''}` : null,
    ].filter(Boolean).join(' · ')
    const isFull = sq.openSpots === 0

    return (
      <TouchableOpacity
        style={styles.squadCard}
        onPress={() => !isFull && sq.code && onJoin(sq.code)}
        activeOpacity={isFull ? 1 : 0.75}
        disabled={isFull}
      >
        <Text style={styles.squadEmoji}>{sq.emoji}</Text>
        <View style={styles.squadBody}>
          <Text style={styles.squadName}>{sq.name}</Text>
          <Text style={styles.squadMeta}>{meta}</Text>
        </View>
        <View style={styles.squadRight}>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>{sq.totalXp != null ? sq.totalXp.toLocaleString() : ''}</Text>
          </View>
          {isFull ? (
            <View style={[styles.joinBtn, styles.joinBtnFull]}>
              <Text style={styles.joinBtnFullText}>Full</Text>
            </View>
          ) : (
            <View style={styles.joinBtn}>
              <Text style={styles.joinBtnText}>Join</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }, [squads, visibleSquads, loading, locationDenied, requestLocationAndLoad, onExplorePause, onCreate, onJoin, insets.bottom]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OnboardingShell currentStep="clubhouse-choice" onBack={onBack}>
      <View style={styles.container}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>FIND A CLUBHOUSE{'\n'}FOR YOUR GANG</Text>
          <Text style={styles.subtitle}>Start fresh, or join one of these nearby.</Text>
        </View>
        <FlatList
          data={listData}
          keyExtractor={(item, i) => `${item.type}-${i}`}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={false}
        />
      </View>
    </OnboardingShell>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleBlock: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 6,
  },
  title: {
    fontFamily: BANGERS,
    fontSize: 32,
    color: '#f4f4f5',
    letterSpacing: 1,
    lineHeight: 36,
  },
  subtitle: {
    color: MUTED3,
    fontSize: 14,
    lineHeight: 20,
  },
  listContent: {
    gap: 12,
    paddingBottom: 8,
  },
  // Create card
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.2)',
    padding: 16,
    gap: 12,
  },
  createIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(163,230,53,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBody: { flex: 1, gap: 2 },
  createTitle: { fontSize: 15, fontWeight: '700', color: '#f4f4f5' },
  createSub: { fontSize: 12, color: MUTED2 },
  createBtn: {
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  createBtnText: {
    fontFamily: BANGERS,
    fontSize: 16,
    letterSpacing: 0.5,
    color: '#000',
  },
  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: MUTED2,
    marginTop: 4,
  },
  // Squad card — compact, matches the screenshot
  squadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 12,
  },
  squadEmoji: { fontSize: 36 },
  squadBody: { flex: 1, gap: 3 },
  squadName: {
    fontFamily: BANGERS,
    fontSize: 20,
    color: '#f4f4f5',
    letterSpacing: 0.5,
  },
  squadMeta: { fontSize: 12, color: MUTED2 },
  squadRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  xpBadge: {
    backgroundColor: 'transparent',
  },
  xpText: {
    fontSize: 16,
    fontWeight: '900',
    color: GOLD,
  },
  joinBtn: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: LIME,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  joinBtnText: {
    fontFamily: BANGERS,
    fontSize: 15,
    letterSpacing: 0.5,
    color: LIME,
  },
  joinBtnFull: {
    borderColor: MUTED2,
  },
  joinBtnFullText: {
    fontFamily: BANGERS,
    fontSize: 15,
    color: MUTED2,
  },
  // Browse all CTA — secondary pill, consistent with squad cards on this screen
  browseAllBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    backgroundColor: BG2,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  browseAllText: {
    fontSize: 15,
    fontWeight: '700',
    color: MUTED3,
  },
  // Misc
  loader: { marginVertical: 24 },
  emptyText: {
    color: MUTED2,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginVertical: 16,
  },
  showMoreBtn: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  showMoreText: {
    fontSize: 14,
    color: MUTED3,
    textDecorationLine: 'underline',
  },
  footerWrap: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 10,
  },
  locationDeniedWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  enableLocationBtn: {
    backgroundColor: LIME,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
  },
  enableLocationText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.3,
  },
})
