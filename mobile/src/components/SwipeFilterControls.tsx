import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { X } from 'lucide-react-native'
import Slider from '@react-native-community/slider'
import { T } from '../theme'
import {
  SWIPE_FILTER_DEFAULTS,
  type SwipeDateFilter,
  type TimeSlotKey,
} from '../stores/uiStore'
import { useUiStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'

function vnDateString(offsetDays: number): string {
  const now = new Date()
  now.setTime(now.getTime() + (7 * 60 + offsetDays * 24 * 60) * 60 * 1000)
  return now.toISOString().slice(0, 10)
}

type LocationRef = { lat: number; lng: number }

/** Standalone filter pill — can be placed anywhere */
export function FilterPill({
  onPress,
  hideSections,
}: {
  onPress: () => void
  hideSections?: HiddenFilterSections
}) {
  const swipeDuprMin = useUiStore((s) => s.swipeDuprMin)
  const swipeTimeSlots = useUiStore((s) => s.swipeTimeSlots)
  const swipeMaxCards = useUiStore((s) => s.swipeMaxCards)
  const swipeRangeKm = useUiStore((s) => s.swipeRangeKm)

  let activeCount =
    (swipeDuprMin !== SWIPE_FILTER_DEFAULTS.duprMin ? 1 : 0) +
    (swipeTimeSlots.length < SWIPE_FILTER_DEFAULTS.timeSlots.length ? 1 : 0)
  if (!hideSections?.maxDistance) {
    activeCount += swipeMaxCards !== SWIPE_FILTER_DEFAULTS.maxCards ? 1 : 0
    activeCount += swipeRangeKm !== SWIPE_FILTER_DEFAULTS.rangeKm ? 1 : 0
  }

  const primaryLabel = `⚡ Filters${activeCount > 0 ? ` · ${activeCount}` : ''}`
  const secondaryLabel = `Min ${swipeDuprMin.toFixed(1)}+`

  const phase = useSharedValue(0)

  useEffect(() => {
    const timer = setInterval(() => {
      phase.value = withTiming(phase.value === 0 ? 1 : 0, { duration: 450 })
    }, 3200)
    return () => clearInterval(timer)
  }, [phase])

  const primaryStyle = useAnimatedStyle(() => ({
    opacity: 1 - phase.value,
  }))
  const secondaryStyle = useAnimatedStyle(() => ({
    opacity: phase.value,
    position: 'absolute' as const,
    left: 0,
    right: 0,
  }))

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[bar.filterPill, activeCount > 0 && bar.filterPillActive]}
      activeOpacity={0.8}
    >
      <View style={{ height: 16, minWidth: 70, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Text style={[bar.filterPillText, activeCount > 0 && bar.filterPillTextActive, primaryStyle]}>
          {primaryLabel}
        </Animated.Text>
        <Animated.Text style={[bar.filterPillText, activeCount > 0 && bar.filterPillTextActive, secondaryStyle]}>
          {secondaryLabel}
        </Animated.Text>
      </View>
    </TouchableOpacity>
  )
}

/** Today / Tomorrow pills + Filters button */
export function SwipeFilterBar({
  onFiltersPress,
}: {
  onFiltersPress: () => void
}) {
  const dateFilter = useUiStore((s) => s.swipeDateFilter)
  const setDateFilter = useUiStore((s) => s.setSwipeDateFilter)

  return (
    <View style={bar.row}>
      {(['today', 'tomorrow'] as const).map((key: SwipeDateFilter) => {
        const on = dateFilter === key
        const label = key === 'today' ? 'Today' : 'Tomorrow'
        return (
          <TouchableOpacity
            key={key}
            onPress={() => setDateFilter(key)}
            style={bar.pillTap}
          >
            <Text style={[bar.pillText, on && bar.pillTextOn]}>{label}</Text>
          </TouchableOpacity>
        )
      })}
      <View style={{ flex: 1 }} />
      <FilterPill onPress={onFiltersPress} />
    </View>
  )
}

/** Which filter sections to hide */
export type HiddenFilterSections = {
  maxDistance?: boolean
  vibe?: boolean
  spotsOnly?: boolean
}

/** Full-screen filter sheet — call onApply after store commit */
export function SwipeFilterSheet({
  visible,
  onClose,
  locationRef,
  filterOpenKey,
  vibeFilter,
  setVibeFilter,
  spotsOnly,
  setSpotsOnly,
  onApplied,
  hideSections,
  onApplyCustom,
  slotStats,
}: {
  visible: boolean
  onClose: () => void
  locationRef: React.RefObject<LocationRef>
  filterOpenKey: number
  vibeFilter: 'social' | 'competitive' | null
  setVibeFilter: React.Dispatch<React.SetStateAction<'social' | 'competitive' | null>>
  spotsOnly: boolean
  setSpotsOnly: React.Dispatch<React.SetStateAction<boolean>>
  onApplied?: () => void
  /** Hide specific filter sections for contexts that don't need them */
  hideSections?: HiddenFilterSections
  /** Override apply handler (e.g. Top 5 uses /api/play instead of fetchSessions) */
  onApplyCustom?: (filters: { duprMin: number; timeSlots: TimeSlotKey[] }) => Promise<void>
  /** Per-slot max avgDupr from the current Top 5 pool */
  slotStats?: { morning: number | null; afternoon: number | null; evening: number | null }
}) {
  const dateFilter = useUiStore((s) => s.swipeDateFilter)
  const swipeDuprMin = useUiStore((s) => s.swipeDuprMin)
  const swipeTimeSlots = useUiStore((s) => s.swipeTimeSlots)
  const swipeMaxCards = useUiStore((s) => s.swipeMaxCards)
  const swipeRangeKm = useUiStore((s) => s.swipeRangeKm)
  const setSwipeDuprMin = useUiStore((s) => s.setSwipeDuprMin)
  const setSwipeTimeSlots = useUiStore((s) => s.setSwipeTimeSlots)
  const setSwipeMaxCards = useUiStore((s) => s.setSwipeMaxCards)
  const setSwipeRangeKm = useUiStore((s) => s.setSwipeRangeKm)
  const { fetchSessions } = useSessionStore.getState()

  const [draftDupr, setDraftDupr] = useState(swipeDuprMin)
  const [slidingDupr, setSlidingDupr] = useState(swipeDuprMin)
  const [draftTimeSlots, setDraftTimeSlots] = useState<TimeSlotKey[]>(swipeTimeSlots)
  const [draftMaxCards, setDraftMaxCards] = useState(swipeMaxCards)
  const [draftRangeKm, setDraftRangeKm] = useState<number | null>(swipeRangeKm)

  useEffect(() => {
    if (!visible) return
    setDraftDupr(swipeDuprMin)
    setSlidingDupr(swipeDuprMin)
    setDraftTimeSlots([...swipeTimeSlots])
    setDraftMaxCards(swipeMaxCards)
    setDraftRangeKm(swipeRangeKm)
  }, [visible, filterOpenKey, swipeDuprMin, swipeTimeSlots, swipeMaxCards, swipeRangeKm])

  const [applying, setApplying] = useState(false)

  if (!visible) return null

  const handleApply = async () => {
    if (applying) return
    setApplying(true)

    setSwipeDuprMin(draftDupr)
    setSwipeTimeSlots(draftTimeSlots)
    setSwipeMaxCards(draftMaxCards)
    setSwipeRangeKm(draftRangeKm)

    if (onApplyCustom) {
      await onApplyCustom({ duprMin: draftDupr, timeSlots: draftTimeSlots })
      await new Promise((r) => setTimeout(r, 1000))
      setApplying(false)
      onClose()
      onApplied?.()
    } else {
      const date = dateFilter === 'tomorrow' ? vnDateString(1) : undefined
      const { lat, lng } = locationRef.current
      const fetchPromise = fetchSessions(lat, lng, date, {
        duprMin: draftDupr,
        timeSlots: draftTimeSlots,
        maxCards: draftMaxCards,
        rangeKm: draftRangeKm,
      })

      await new Promise((r) => setTimeout(r, 2000))
      setApplying(false)
      onClose()

      await fetchPromise
      onApplied?.()
    }
  }

  return (
    <View style={sheet.host} pointerEvents="box-none">
      <Pressable style={sheet.backdrop} onPress={onClose} />
      <View style={sheet.sheet} pointerEvents="auto">
        <View style={sheet.handle} />
        <View style={sheet.header}>
          <Text style={sheet.title}>Filters</Text>
          <View style={sheet.headerRight}>
            <TouchableOpacity
              onPress={() => {
                setDraftDupr(SWIPE_FILTER_DEFAULTS.duprMin)
                setSlidingDupr(SWIPE_FILTER_DEFAULTS.duprMin)
                setDraftTimeSlots([...SWIPE_FILTER_DEFAULTS.timeSlots])
                setDraftMaxCards(SWIPE_FILTER_DEFAULTS.maxCards)
                setDraftRangeKm(SWIPE_FILTER_DEFAULTS.rangeKm)
                setVibeFilter(null)
                setSpotsOnly(false)
              }}
            >
              <Text style={sheet.reset}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sheet.close} onPress={onClose}>
              <X size={16} color="#555" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
          <View style={sheet.section}>
            <View style={sheet.sectionRow}>
              <Text style={sheet.label}>Min DUPR</Text>
              <Text style={sheet.value}>{slidingDupr.toFixed(1)}+</Text>
            </View>
            <Slider
              key={`slider-${filterOpenKey}`}
              style={{ width: '100%', height: 32 }}
              minimumValue={2.0}
              maximumValue={6.0}
              step={0.1}
              value={draftDupr}
              onValueChange={(val) => setSlidingDupr(Math.round(val * 10) / 10)}
              onSlidingComplete={(val) => {
                const rounded = Math.round(val * 10) / 10
                setSlidingDupr(rounded)
                setDraftDupr(rounded)
              }}
              minimumTrackTintColor={T.amber}
              maximumTrackTintColor="#1e1e1e"
              thumbTintColor={T.amber}
            />
            <View style={sheet.sliderLabels}>
              {['2.0', '3.0', '4.0', '5.0', '6.0'].map((l) => (
                <Text key={l} style={sheet.sliderLabel}>{l}</Text>
              ))}
            </View>
          </View>

          <View style={sheet.section}>
            <Text style={sheet.label}>Time of day</Text>
            <View style={sheet.chipRow}>
              {([
                { key: 'morning' as TimeSlotKey, label: 'Morning', sub: 'Before 12h' },
                { key: 'afternoon' as TimeSlotKey, label: 'Afternoon', sub: '12h — 17h' },
                { key: 'evening' as TimeSlotKey, label: 'Evening', sub: 'After 17h' },
              ]).map((t) => {
                const on = draftTimeSlots.includes(t.key)
                const maxDupr = slotStats?.[t.key]
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={[sheet.timeBtn, on && sheet.timeBtnOn]}
                    onPress={() =>
                      setDraftTimeSlots((prev) =>
                        prev.includes(t.key)
                          ? prev.filter((k) => k !== t.key).length > 0
                            ? prev.filter((k) => k !== t.key)
                            : prev
                          : [...prev, t.key],
                      )
                    }
                  >
                    <Text style={[sheet.timeLbl, on && sheet.timeLblOn]}>{t.label}</Text>
                    <Text style={[sheet.timeSub, on && sheet.timeSubOn]}>{t.sub}</Text>
                    {maxDupr != null && (
                      <Text style={[sheet.timeMax, on && sheet.timeMaxOn]}>
                        ↑ {maxDupr.toFixed(1)} max
                      </Text>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {!hideSections?.vibe && (
            <View style={sheet.section}>
              <Text style={sheet.label}>Vibe</Text>
              <View style={sheet.chipRow}>
                {([
                  { key: 'social' as const, label: 'Social' },
                  { key: 'competitive' as const, label: 'Competitive' },
                ]).map((v) => (
                  <TouchableOpacity
                    key={v.key}
                    style={[sheet.vibeBtn, vibeFilter === v.key && sheet.vibeBtnOn]}
                    onPress={() => setVibeFilter((prev) => (prev === v.key ? null : v.key))}
                  >
                    <Text style={[sheet.vibeLbl, vibeFilter === v.key && sheet.vibeLblOn]}>
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[sheet.vibeBtn, vibeFilter === null && sheet.vibeBtnOn]}
                  onPress={() => setVibeFilter(null)}
                >
                  <Text style={[sheet.vibeLbl, vibeFilter === null && sheet.vibeLblOn]}>Any</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!hideSections?.maxDistance && (
            <View style={sheet.section}>
              <Text style={sheet.label}>Max distance</Text>
              <View style={sheet.chipRow}>
                {([null, 5, 10, 20, 30] as (number | null)[]).map((v) => (
                  <TouchableOpacity
                    key={v ?? 'any'}
                    style={[sheet.vibeBtn, draftRangeKm === v && sheet.vibeBtnOn]}
                    onPress={() => setDraftRangeKm(v)}
                  >
                    <Text style={[sheet.vibeLbl, draftRangeKm === v && sheet.vibeLblOn]}>
                      {v == null ? 'Any' : `${v} km`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {!hideSections?.spotsOnly && (
            <View style={sheet.section}>
              <TouchableOpacity
                style={sheet.toggleRow}
                onPress={() => setSpotsOnly((prev) => !prev)}
                activeOpacity={0.8}
              >
                <View style={sheet.toggleLeft}>
                  <Text style={sheet.toggleLbl}>3+ spots available only</Text>
                  <Text style={sheet.toggleSub}>Hide sessions that are nearly full</Text>
                </View>
                <View style={[sheet.toggle, spotsOnly && sheet.toggleOn]}>
                  <View style={[sheet.toggleDot, spotsOnly && sheet.toggleDotOn]} />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity
          style={[sheet.apply, applying && sheet.applyDisabled]}
          onPress={handleApply}
          activeOpacity={0.85}
          disabled={applying}
        >
          {applying ? (
            <View style={sheet.applyRow}>
              <ActivityIndicator size="small" color="#1a0a00" />
              <Text style={sheet.applyText}>Applying...</Text>
            </View>
          ) : (
            <Text style={sheet.applyText}>Apply Filters</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const bar = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    alignItems: 'center',
  },
  pillTap: {
    paddingVertical: 5,
    paddingHorizontal: 2,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '400',
    color: T.muted,
  },
  pillTextOn: {
    fontWeight: '600',
    color: '#fff',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
  },
  filterPillActive: {
    backgroundColor: T.amber,
    borderColor: T.amber,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: T.amber,
  },
  filterPillTextActive: {
    color: '#1a0a00',
  },
})

const sheet = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: '#222',
    maxHeight: '85%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    alignSelf: 'center',
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reset: {
    fontSize: 13,
    color: T.amber,
    fontWeight: '500',
  },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingHorizontal: 18,
    marginBottom: 22,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '500',
    marginBottom: 10,
  },
  value: {
    fontSize: 22,
    fontWeight: '700',
    color: T.amber,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sliderLabel: {
    fontSize: 10,
    color: '#333',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 7,
  },
  timeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 3,
  },
  timeBtnOn: {
    backgroundColor: '#1f1400',
    borderColor: T.amber,
  },
  timeLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  timeLblOn: {
    color: T.amber,
  },
  timeSub: {
    fontSize: 9,
    color: '#2a2a2a',
  },
  timeSubOn: {
    color: T.amber,
    opacity: 0.6,
  },
  timeMax: {
    fontSize: 9,
    color: '#444',
    marginTop: 3,
    fontWeight: '600' as const,
  },
  timeMaxOn: {
    color: T.amber,
    opacity: 0.85,
  },
  vibeBtn: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibeBtnOn: {
    backgroundColor: '#1f1400',
    borderColor: T.amber,
  },
  vibeLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
  },
  vibeLblOn: {
    color: T.amber,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLeft: {
    flex: 1,
  },
  toggleLbl: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '500',
  },
  toggleSub: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
  },
  toggle: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2a2a2a',
    position: 'relative',
    flexShrink: 0,
  },
  toggleOn: {
    backgroundColor: T.amber,
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#555',
    position: 'absolute',
    top: 2,
    left: 2,
  },
  toggleDotOn: {
    backgroundColor: '#fff',
    left: 18,
  },
  apply: {
    marginHorizontal: 18,
    marginBottom: 24,
    backgroundColor: T.amber,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  applyDisabled: {
    opacity: 0.75,
  },
  applyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  applyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a0a00',
  },
})
