import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Dimensions,
  Linking,
  Alert,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { X, Zap } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'
import { type Session } from '../data'
import { TopBar, CardBody } from '../components/CardBody'
import { LockedFriendsRow } from '../components/LockedFriendsRow'
import { useSignUpModal } from '../contexts/SignUpModalContext'
import { useAuthStore } from '../stores/authStore'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'
import { FriendsListModal } from '../components/FriendsListModal'
import type { FriendListItem } from '../components/FriendListRow'

const { width: W } = Dimensions.get('window')
const CARD_WIDTH = W * 0.84
const CARD_GAP = 12
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP

/* ── Sort pill types ─────────────────────────────────────────── */
type SortKey = 'match' | 'friends'

const SORT_LABELS: Record<SortKey, string> = {
  match: 'Best match',
  friends: 'Friends',
}

/* ── Dot indicator ───────────────────────────────────────────── */
function CarouselDot({ active }: { active: boolean }) {
  const T = useTheme()
  const w = useSharedValue(active ? 14 : 5)

  React.useEffect(() => {
    w.value = withTiming(active ? 14 : 5, { duration: 200 })
  }, [active])

  const animStyle = useAnimatedStyle(() => ({
    width: w.value,
    height: 5,
    borderRadius: 3,
    backgroundColor: active ? T.amber : T.borderSubtle,
  }))

  return <Animated.View style={animStyle} />
}

/* ── Carousel card CTA — "Join on Reclub" + X remove ────────── */
function CarouselCta({ eventUrl, onRemove }: { eventUrl: string; onRemove: () => void }) {
  const T = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity
        onPress={() => Linking.openURL(eventUrl)}
        accessibilityLabel="Join this session on Reclub"
        accessibilityRole="link"
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
        accessibilityLabel="Remove from shortlist"
        accessibilityRole="button"
        style={{
          width: 48,
          backgroundColor: T.input,
          borderWidth: 1,
          borderColor: T.border,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={16} color={T.iconMuted} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  )
}

/* ── ShortlistScreen ─────────────────────────────────────────── */
export function ShortlistScreen({ onNavigateToSwipe }: { onNavigateToSwipe?: () => void } = {}) {
  const T = useTheme()
  const { openSignUp } = useSignUpModal()
  const signedIn = useAuthStore((s) => s.isSignedIn)()
  const sort = useUiStore((s) => s.shortlistSort)
  const setShortlistSort = useUiStore((s) => s.setShortlistSort)
  const [removedIds, setRemovedIds] = useState<Set<number>>(new Set())
  const [carouselIdx, setCarouselIdx] = useState(0)
  const [friendsModal, setFriendsModal] = useState<{
    visible: boolean
    title: string
    friends: FriendListItem[]
    overflowNote?: string
  }>({ visible: false, title: '', friends: [] })
  const flatListRef = useRef<FlatList>(null)

  const savedSessions = useSessionStore((s) => s.getSavedSessions)()
  const visibleSessions = useMemo(() => {
    const filtered = savedSessions.filter((s) => !removedIds.has(s.id))
    switch (sort) {
      case 'match':
        return [...filtered].sort((a, b) => b.matchScore - a.matchScore)
      case 'friends':
        return [...filtered]
          .filter((s) => s.friendCount > 0)
          .sort((a, b) => b.friendCount - a.friendCount)
      default:
        return filtered
    }
  }, [savedSessions, removedIds, sort])

  const unsaveSession = useSessionStore((s) => s.unsaveSession)

  const openSessionFriends = useCallback(
    (session: Session) => {
      if (!signedIn) return
      setFriendsModal({
        visible: true,
        title: `${session.friendCount} ${session.friendCount === 1 ? 'friend' : 'friends'} joining`,
        friends: session.friends.map((f) => ({
          userId: f.userId,
          displayName: f.displayName,
          imageUrl: f.imageUrl,
        })),
        overflowNote:
          session.friendsOverflow > 0
            ? `+${session.friendsOverflow} more on this session`
            : undefined,
      })
    },
    [signedIn]
  )

  const handleRemove = useCallback((id: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Alert.alert(
      'Remove from shortlist?',
      'You can always add it back by swiping again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setRemovedIds((prev) => new Set([...prev, id]))
            unsaveSession(id)
          },
        },
      ]
    )
  }, [unsaveSession])

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
          isSignedIn={signedIn}
          lockedFriendsSlot={
            !signedIn ? <LockedFriendsRow onPress={openSignUp} /> : undefined
          }
          onSignIn={openSignUp}
          onFriendsPress={() => openSessionFriends(item)}
          renderCta={<CarouselCta eventUrl={item.eventUrl} onRemove={() => handleRemove(item.id)} />}
        />
      </View>
    ),
    [handleRemove, signedIn, openSignUp, openSessionFriends]
  )

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <TopBar
        title="Your shortlist"
        counter={visibleSessions.length > 0 ? `${visibleSessions.length}` : undefined}
      />

      {/* Sort pills */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 16,
          marginBottom: 12,
        }}
      >
        {(['match', 'friends'] as const).map((key) => {
          const on = sort === key
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setShortlistSort(key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 5,
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
          <Zap size={40} color={T.textTertiary} strokeWidth={1.5} />
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: T.text,
              marginTop: 16,
            }}
          >
            No saved sessions yet
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: T.textSecondary,
              marginTop: 6,
              textAlign: 'center',
            }}
          >
            Swipe right on sessions you like to save them here
          </Text>
          {onNavigateToSwipe && (
            <TouchableOpacity
              onPress={onNavigateToSwipe}
              style={{
                marginTop: 20,
                backgroundColor: T.amber,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 28,
              }}
              accessibilityLabel="Start swiping sessions"
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0B0B0C' }}>
                Start swiping
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FriendsListModal
        visible={friendsModal.visible}
        onClose={() => setFriendsModal((m) => ({ ...m, visible: false }))}
        title={friendsModal.title}
        friends={friendsModal.friends}
        overflowNote={friendsModal.overflowNote}
      />
    </View>
  )
}
