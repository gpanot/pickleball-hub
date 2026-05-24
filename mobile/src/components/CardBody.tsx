import React, { useEffect } from 'react'
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Clock,
  Layers,
  Users,
  Smile,
  Zap,
  MapPin,
} from 'lucide-react-native'
import { T } from '../theme'
import { ProfileAvatar } from './ProfileAvatar'
import {
  type Session,
  RING_COLORS,
  formatPriceDuration,
  formatDistance,
  formatTime,
} from '../data'
import { PlayerAvatar } from './PlayerAvatar'

/* eslint-disable @typescript-eslint/no-var-requires */
const CARD_BG_IMAGES = [
  require('../../assets/images/card-bg.webp'),
  require('../../assets/images/card-bg-2.jpg'),
]

const { height: H } = Dimensions.get('window')
export const CARD_HEIGHT = Math.min(H * 0.635, 568)

const VIBE_LABELS: Record<string, string> = {
  social: 'Social',
  competitive: 'Competitive',
  chill: 'Chill',
}

/* ── ImageAvatar (URL-based, used by card roster) ────────────── */
function ImageAvatar({ url, name, size }: { url: string; name: string; size: number }) {
  const [failed, setFailed] = React.useState(false)
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  if (failed || !url) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#333',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: size * 0.36 }}>
          {initials || '?'}
        </Text>
      </View>
    )
  }

  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setFailed(true)}
    />
  )
}

/* ── TopBar ───────────────────────────────────────────────────── */
export function TopBar({
  supertitle,
  title,
  counter,
  showAvatar = false,
}: {
  supertitle?: string
  title: string
  counter?: string
  showAvatar?: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: T.bg,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        {supertitle ? (
          <Text
            style={{
              fontSize: 9,
              fontWeight: '600',
              color: '#555',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 2,
            }}
          >
            {supertitle}
          </Text>
        ) : null}
        <Text
          style={{
            fontSize: supertitle ? 16 : 22,
            fontWeight: '600',
            color: '#fff',
          }}
        >
          {title}
        </Text>
      </View>
      {counter ? (
        <Text style={{ fontSize: 15, fontWeight: '700', color: T.amber, marginRight: showAvatar ? 8 : 0 }}>
          {counter}
        </Text>
      ) : null}
      {showAvatar ? <ProfileAvatar /> : null}
    </View>
  )
}

/* ── MatchDial ───────────────────────────────────────────────── */
export function MatchDial({ pct }: { pct: number }) {
  const isNew = pct === 0
  const size = 72
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const offset = isNew ? circumference : circumference - (pct / 100) * circumference
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2a2a2a"
          strokeWidth={3}
          fill="transparent"
        />
        {!isNew && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={T.amber}
            strokeWidth={3}
            fill="transparent"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        )}
      </Svg>
      <Text style={{ fontSize: isNew ? 13 : 18, fontWeight: '700', color: isNew ? '#888' : T.amber }}>
        {isNew ? 'New' : `${pct}%`}
      </Text>
    </View>
  )
}

/* ── CardBgRotator ───────────────────────────────────────────── */
export function CardBgRotator() {
  const opacity0 = useSharedValue(1)
  const opacity1 = useSharedValue(0)

  useEffect(() => {
    const timer = setInterval(() => {
      opacity0.value = withTiming(opacity0.value === 1 ? 0 : 1, { duration: 1200 })
      opacity1.value = withTiming(opacity1.value === 0 ? 1 : 0, { duration: 1200 })
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const style0 = useAnimatedStyle(() => ({ opacity: opacity0.value }))
  const style1 = useAnimatedStyle(() => ({ opacity: opacity1.value }))

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFillObject, style0]}>
        <Image
          source={CARD_BG_IMAGES[0]}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFillObject, style1]}>
        <Image
          source={CARD_BG_IMAGES[1]}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </Animated.View>
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.88)',
        }}
      />
    </>
  )
}

/* ── CardBody — the shared card content used by both screens ── */
export function CardBody({
  s,
  renderCta,
  matchDialBelowTopRow = false,
  isSignedIn = true,
  lockedFriendsSlot,
  onSignIn,
  onFriendsPress,
}: {
  s: Session
  renderCta: React.ReactNode
  matchDialBelowTopRow?: boolean
  isSignedIn?: boolean
  /** When signed out, parent supplies locked friend row (tap opens sign-up modal). */
  lockedFriendsSlot?: React.ReactNode
  /** Called when "Sign in to see friends" is tapped. */
  onSignIn?: () => void
  /** Signed-in: tap avatars or "X friends joining" to open friends list. */
  onFriendsPress?: () => void
}) {
  const displayFriends = s.friends.slice(0, 4)
  const price = formatPriceDuration(s.feeAmount, s.durationMin)
  const distance = formatDistance(s.distanceKm)
  const timeLabel = formatTime(s.startTime)
  const safeDupr =
    s.duprRange && s.duprRange.min <= 8 && s.duprRange.max <= 8
      ? s.duprRange
      : null
  const duprLabel = safeDupr
    ? `Mostly ${safeDupr.min.toFixed(1)}–${safeDupr.max.toFixed(1)}`
    : null
  const displayRegulars = s.regulars.slice(0, 3)
  const vibeLabel = VIBE_LABELS[s.vibeTag] ?? 'Social'
  const friendsOverflow =
    s.friendsOverflow > 0
      ? s.friendsOverflow
      : Math.max(0, s.friendCount - displayFriends.length)
  const hasFriends = s.friendCount > 0

  return (
    <View
      style={{
        width: '100%',
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
      }}
    >
      <CardBgRotator />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: CARD_HEIGHT * 0.45,
          zIndex: 1,
        }}
      />

      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(246,185,59,0.04)',
          zIndex: 2,
        }}
      />

      <View
        style={{
          position: 'relative',
          zIndex: 3,
          flex: 1,
          flexDirection: 'column',
          paddingHorizontal: 16,
          paddingBottom: 18,
        }}
      >
        {!matchDialBelowTopRow && (
          <View style={{ position: 'absolute', top: 10, right: 10, zIndex: 20 }}>
            <MatchDial pct={s.matchScore} />
          </View>
        )}

        {/* Row 1: Time pill + FILLING FAST */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingTop: 10,
            paddingBottom: matchDialBelowTopRow ? 0 : 6,
            paddingRight: matchDialBelowTopRow ? 0 : 72,
            flexWrap: matchDialBelowTopRow ? 'wrap' : 'nowrap',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: 'rgba(246,185,59,0.12)',
              borderWidth: 1,
              borderColor: 'rgba(246,185,59,0.18)',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Clock size={10} color={T.amber} strokeWidth={2} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: T.amber }}>
              {timeLabel}
            </Text>
          </View>
          {s.fillingFast && (
            <>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: T.green,
                }}
              />
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.green }}>
                FILLING FAST
              </Text>
              {s.joinedRecently > 0 && (
                <>
                  <Text style={{ fontSize: 11, color: '#555' }}>·</Text>
                  <Text style={{ fontSize: 11, color: '#888' }}>
                    {s.joinedRecently} joined recently
                  </Text>
                </>
              )}
            </>
          )}
        </View>

        {matchDialBelowTopRow && (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              paddingTop: 8,
              paddingBottom: 6,
            }}
          >
            <MatchDial pct={s.matchScore} />
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* Club name */}
        {s.club?.name && (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 4,
            }}
          >
            {s.club.name}
          </Text>
        )}

        {/* Session name */}
        <Text
          numberOfLines={3}
          style={{
            fontSize: 28,
            fontWeight: '800',
            color: '#fff',
            lineHeight: 32,
            marginBottom: 6,
            maxWidth: '75%',
          }}
        >
          {s.name}
        </Text>

        {/* Price + distance */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 16,
          }}
        >
          <Layers size={12} color="rgba(255,255,255,0.55)" strokeWidth={1.5} />
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            {price}
          </Text>
          {distance !== '' && (
            <>
              <Text style={{ fontSize: 12, color: '#555' }}>·</Text>
              <MapPin size={11} color="rgba(255,255,255,0.55)" strokeWidth={1.5} />
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                {distance}
              </Text>
            </>
          )}
        </View>

        {/* Friend avatars — real when signed in; locked slot when signed out */}
        {lockedFriendsSlot}

        {isSignedIn && (
          <TouchableOpacity
            activeOpacity={onFriendsPress ? 0.85 : 1}
            onPress={onFriendsPress}
            disabled={!onFriendsPress}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            {hasFriends ? (
              <>
                {displayFriends.map((p, i) => (
                  <View key={`friend-${p.userId}-${i}`} style={{ position: 'relative' }}>
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        borderWidth: 2.5,
                        borderColor: RING_COLORS[i % RING_COLORS.length],
                        overflow: 'hidden',
                      }}
                    >
                      <PlayerAvatar
                        userId={p.userId}
                        displayName={p.displayName}
                        imageUrl={p.imageUrl}
                        size={47}
                      />
                    </View>
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        right: 2,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: T.green,
                        borderWidth: 2,
                        borderColor: '#0a0a0a',
                      }}
                    />
                  </View>
                ))}
                {friendsOverflow > 0 && (
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      borderWidth: 1.5,
                      borderColor: 'rgba(255,255,255,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: '#aaa', fontWeight: '500' }}>
                      +{friendsOverflow}
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={`empty-${i}`}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      borderWidth: 2,
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderStyle: 'dashed',
                      backgroundColor: 'rgba(255,255,255,0.03)',
                    }}
                  />
                ))}
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* Metadata strip */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 12,
          }}
        >
          <Users size={12} color={T.amber} strokeWidth={2} />
          {isSignedIn ? (
            <TouchableOpacity
              onPress={onFriendsPress}
              disabled={!onFriendsPress}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 12, color: T.amber, fontWeight: '500' }}>
                {`${s.friendCount} ${s.friendCount === 1 ? 'friend' : 'friends'} joining`}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onSignIn} activeOpacity={0.7}>
              <Text style={{ fontSize: 12, color: T.amber, fontWeight: '500', textDecorationLine: 'underline' }}>
                Sign in to see friends
              </Text>
            </TouchableOpacity>
          )}
          {duprLabel && (
            <Text style={{ fontSize: 12, color: '#555' }}>|</Text>
          )}
          {duprLabel && (
            <Text style={{ fontSize: 12, color: '#7F77DD' }}>{duprLabel}</Text>
          )}
          <Text style={{ fontSize: 12, color: '#555' }}>|</Text>
          <Smile size={12} color="#1D9E75" strokeWidth={2} />
          <Text style={{ fontSize: 12, color: '#1D9E75' }}>
            {vibeLabel === 'Competitive' ? 'Intense' : vibeLabel === 'Chill' ? 'Relaxed vibes' : 'Great vibes'}
          </Text>
        </View>

        {/* Vibe panel + regulars */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: 'rgba(245,166,35,0.12)',
                borderWidth: 1.5,
                borderColor: 'rgba(245,166,35,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Zap size={20} color={T.amber} strokeWidth={2.5} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
              {vibeLabel}
            </Text>
          </View>
          {displayRegulars.length > 0 ? (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ flexDirection: 'row' }}>
                {displayRegulars.map((p, i) => (
                  <View
                    key={`reg-${p.displayName}-${i}`}
                    style={{
                      width: 33,
                      height: 33,
                      borderRadius: 17,
                      overflow: 'hidden',
                      marginLeft: i > 0 ? -8 : 0,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.2)',
                      zIndex: 3 - i,
                    }}
                  >
                    <ImageAvatar url={p.imageUrl} name={p.displayName} size={33} />
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 11, color: '#666' }}>
                Your regulars are here
              </Text>
            </View>
          ) : s.roster.length === 0 ? (
            <Text style={{ fontSize: 11, color: '#555' }}>
              No roster yet
            </Text>
          ) : null}
        </View>

        {renderCta}
      </View>
    </View>
  )
}
