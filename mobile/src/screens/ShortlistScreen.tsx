import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Linking,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { X } from 'lucide-react-native'
import { T } from '../theme'
import { type Session, ALL_SESSIONS, SAVED_IDS } from '../data'
import { TopBar, CardBody } from '../components/CardBody'

const { width: W } = Dimensions.get('window')
const CARD_WIDTH = W * 0.84
const CARD_GAP = 12
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP

/* ── Sort pill types ─────────────────────────────────────────── */
type SortKey = 'match' | 'wait' | 'friends'

const SORT_LABELS: Record<SortKey, string> = {
  match: 'Best match',
  wait: 'Wait time',
  friends: 'Friends',
}

/* ── Dot indicator ───────────────────────────────────────────── */
function CarouselDot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 14 : 5)

  React.useEffect(() => {
    w.value = withTiming(active ? 14 : 5, { duration: 200 })
  }, [active])

  const animStyle = useAnimatedStyle(() => ({
    width: w.value,
    height: 5,
    borderRadius: 3,
    backgroundColor: active ? T.amber : 'rgba(255,255,255,0.1)',
  }))

  return <Animated.View style={animStyle} />
}

/* ── Carousel card CTA — "Join on Reclub" + X remove ────────── */
function CarouselCta({ onRemove }: { onRemove: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity
        onPress={() => Linking.openURL('https://reclub.co/m/3CUP8A')}
        style={{
          flex: 1,
          backgroundColor: T.amber,
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
          shadowColor: T.amber,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 20,
          elevation: 6,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B0B0C' }}>
          Join on Reclub
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onRemove}
        style={{
          width: 48,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} color="rgba(255,255,255,0.4)" strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}

/* ── ShortlistScreen ─────────────────────────────────────────── */
export function ShortlistScreen() {
  const [sort, setSort] = useState<SortKey>('match')
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set())
  const [carouselIdx, setCarouselIdx] = useState(0)
  const flatListRef = useRef<FlatList>(null)

  const savedSessions = ALL_SESSIONS.filter((s) => SAVED_IDS.includes(s.id))
  const visibleSessions = savedSessions.filter((s) => !removedIds.has(s.id))

  const handleRemove = useCallback((id: number) => {
    setRemovedIds((prev) => new Set([...prev, id]))
  }, [])

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCarouselIdx(viewableItems[0].index)
      }
    }
  ).current

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current

  const renderCard = useCallback(
    ({ item }: { item: Session }) => (
      <View style={{ width: CARD_WIDTH, marginRight: CARD_GAP }}>
        <CardBody
          s={item}
          matchDialBelowTopRow
          renderCta={<CarouselCta onRemove={() => handleRemove(item.id)} />}
        />
      </View>
    ),
    [handleRemove]
  )

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <TopBar title="Your shortlist" />

      {/* Sort pills */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          marginBottom: 12,
        }}
      >
        {(['match', 'wait', 'friends'] as const).map((key) => {
          const on = sort === key
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSort(key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: on ? T.amber : T.input,
                borderWidth: 1,
                borderColor: on ? T.amber : T.border,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: on ? '600' : '400',
                  color: on ? '#000' : T.muted,
                }}
              >
                {SORT_LABELS[key]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* Carousel */}
      {visibleSessions.length > 0 ? (
        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatListRef}
            data={visibleSessions}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderCard}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={SNAP_INTERVAL}
            decelerationRate="fast"
            contentContainerStyle={{
              paddingLeft: 16,
              paddingRight: W - CARD_WIDTH - 16,
            }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />

          {/* Dot indicators */}
          {visibleSessions.length > 1 && (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 12,
              }}
            >
              {visibleSessions.map((_, i) => (
                <CarouselDot key={i} active={i === carouselIdx} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            No saved sessions yet.
          </Text>
        </View>
      )}
    </View>
  )
}
