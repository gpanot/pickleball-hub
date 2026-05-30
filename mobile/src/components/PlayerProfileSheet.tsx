import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Modal, Pressable, Dimensions, Image, Linking, Alert,
  Animated as RNAnimated, Platform, ActionSheetIOS, TextInput,
} from 'react-native'
import * as Location from 'expo-location'
import { X, MapPin, MoreHorizontal } from 'lucide-react-native'
import { useAuthStore } from '../stores/authStore'
import { T } from '../theme'
import { formatDistance } from '../data'

const HCMC_LAT = 10.78
const HCMC_LNG = 106.69

const { height: H } = Dimensions.get('window')
const SHEET_HEIGHT = H * 0.88

function SkeletonBox({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: number | `${number}%`
  height: number
  borderRadius?: number
  style?: object
}) {
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: '#1a1a1a',
        },
        style,
      ]}
    />
  )
}

function ProfileSkeleton() {
  return (
    <View style={s.skeletonWrap}>
      <SkeletonBox width={156} height={156} borderRadius={78} style={{ alignSelf: 'center' }} />
      <SkeletonBox width={140} height={18} borderRadius={6} style={{ alignSelf: 'center', marginTop: 12 }} />
      <SkeletonBox width={56} height={11} borderRadius={4} style={{ alignSelf: 'center', marginTop: 8 }} />
      <SkeletonBox width="100%" height={52} borderRadius={12} style={{ marginTop: 18 }} />
      <SkeletonBox width="100%" height={52} borderRadius={12} style={{ marginTop: 10 }} />
      <SkeletonBox width={200} height={12} borderRadius={4} style={{ marginTop: 18 }} />
      <SkeletonBox width={80} height={9} borderRadius={4} style={{ marginTop: 6 }} />
      <SkeletonBox width="100%" height={72} borderRadius={10} style={{ marginTop: 10 }} />
      <SkeletonBox width="100%" height={72} borderRadius={10} style={{ marginTop: 8 }} />
    </View>
  )
}

interface ReclubKudo {
  type: string
  count: number
  label: string
}

interface PlayerProfile {
  userId: string
  profileId: string | null
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
  reclubId: number | null
  followingCount: number
  sessionCount: number
  isFollowing: boolean
  regularPlay: Array<{
    clubName: string
    venueName: string | null
    venueAddress: string | null
    placeLabel: string
    latitude: number | null
    longitude: number | null
    distanceKm: number | null
    visitCount: number
    sessions: Array<{
      timeLabel: string
      sessionName: string
      count: number
      eventUrl: string
    }>
  }>
  reclubKudos: ReclubKudo[]
  myKudos: { fistbump: number; flame: number; star: number; myReactions: string[] }
  streakData: {
    currentStreak: number
    weeklyPlayed: boolean[]
  } | null
}

export type PlayerProfileStub = {
  userId: string
  displayName: string | null
  imageUrl: string | null
  duprDoubles: number | null
}

interface Props {
  userId: string | null
  onClose: () => void
  stub?: PlayerProfileStub | null
}

export function PlayerProfileSheet({ userId, onClose, stub }: Props) {
  const { authedFetch } = useAuthStore()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [venuesLoading, setVenuesLoading] = useState(false)
  const [error, setError] = useState(false)
  const locationRef = useRef({ lat: HCMC_LAT, lng: HCMC_LNG })
  const locationReadyRef = useRef(false)
  const [avatarExpanded, setAvatarExpanded] = useState(false)

  // Report / Block state
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportDetail, setReportDetail] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const avatarScale = useRef(new RNAnimated.Value(1)).current
  // Shift the avatar down when expanding so it grows toward content, not into the modal top edge.
  // Avatar height = 156px. At scale 2 the extra height = 156px, half = 78px shift down.
  const avatarTranslateY = useRef(new RNAnimated.Value(0)).current

  const toggleAvatarExpand = useCallback(() => {
    const next = !avatarExpanded
    setAvatarExpanded(next)
    RNAnimated.spring(avatarScale, {
      toValue: next ? 2 : 1,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start()
    RNAnimated.spring(avatarTranslateY, {
      toValue: next ? 78 : 0,
      friction: 6,
      tension: 80,
      useNativeDriver: true,
    }).start()
  }, [avatarExpanded, avatarScale, avatarTranslateY])

  // Start resolving location in background immediately — doesn't block anything
  const resolveLocation = useCallback(async () => {
    if (locationReadyRef.current) return
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      locationRef.current = { lat: loc.coords.latitude, lng: loc.coords.longitude }
      locationReadyRef.current = true
    } catch {}
  }, [])

  // Phase 1: fast query — player basics, follow status, kudos (no venue scan)
  const loadFast = useCallback(async (uid: string) => {
    setError(false)
    try {
      const res = await authedFetch(`/api/players/${uid}/profile?quick=1`)
      if (!res.ok) { setError(true); return }
      const data = await res.json()
      if (!data.userId) { setError(true); return }
      setProfile({ ...data, regularPlay: [] })
    } catch {
      setError(true)
    }
  }, [authedFetch])

  // Phase 2: lazy venue scan — fires after fast data renders
  const loadVenues = useCallback(async (uid: string) => {
    setVenuesLoading(true)
    try {
      const { lat, lng } = locationRef.current
      const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) })
      const res = await authedFetch(`/api/players/${uid}/profile?${qs}`)
      if (!res.ok) return
      const data = await res.json()
      setProfile((prev) =>
        prev ? { ...prev, regularPlay: data.regularPlay ?? [] } : prev
      )
    } catch {
      // venues failing silently is acceptable
    } finally {
      setVenuesLoading(false)
    }
  }, [authedFetch])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setError(false)
      setVenuesLoading(false)
      return
    }
    setProfile(null)
    setError(false)
    setVenuesLoading(false)
    setAvatarExpanded(false)
    avatarScale.setValue(1)
    avatarTranslateY.setValue(0)

    // Fire location + fast profile in parallel, then venues after fast resolves
    void resolveLocation()
    void loadFast(userId).then(() => loadVenues(userId))
  }, [userId, loadFast, loadVenues, resolveLocation])

  const handleClose = () => {
    onClose()
  }

  const promptOpenInMaps = (venue: PlayerProfile['regularPlay'][number]) => {
    Alert.alert(
      'Open in Google Maps?',
      undefined,
      [
        { text: 'CANCEL', style: 'cancel' },
        {
          text: 'YES',
          onPress: () => {
            const query =
              venue.latitude != null && venue.longitude != null
                ? `${venue.latitude},${venue.longitude}`
                : encodeURIComponent(
                    venue.venueAddress ??
                      `${venue.placeLabel}${venue.clubName ? `, ${venue.clubName}` : ''}`
                  )
            Linking.openURL(
              `https://www.google.com/maps/search/?api=1&query=${query}`
            )
          },
        },
      ]
    )
  }

  const handleMoreMenu = useCallback(() => {
    const targetProfileId = profile?.profileId
    const name = profile?.displayName ?? 'this player'
    if (!targetProfileId) return

    const options = [`Report ${name}`, `Block ${name}`, 'Cancel']

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: options.indexOf(`Block ${name}`),
        },
        (idx) => {
          if (idx === 0) setReportModalVisible(true)
          if (idx === 1) handleBlock(targetProfileId, name)
        },
      )
    } else {
      Alert.alert(name, undefined, [
        { text: `Report ${name}`, onPress: () => setReportModalVisible(true) },
        { text: `Block ${name}`, style: 'destructive', onPress: () => handleBlock(targetProfileId, name) },
        { text: 'Cancel', style: 'cancel' },
      ])
    }
  }, [profile])

  const handleBlock = useCallback((targetProfileId: string, name: string) => {
    Alert.alert(
      `Block ${name}?`,
      "They won't see your profile or activity.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await authedFetch(`/api/users/${targetProfileId}/block`, { method: 'POST' })
              Alert.alert('Blocked.')
              onClose()
            } catch {
              Alert.alert('Error', 'Could not block. Please try again.')
            }
          },
        },
      ],
    )
  }, [authedFetch, onClose])

  const handleSubmitReport = useCallback(async () => {
    const targetProfileId = profile?.profileId
    if (!targetProfileId || !reportReason) return
    setReportSubmitting(true)
    try {
      await authedFetch(`/api/users/${targetProfileId}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason: reportReason, detail: reportDetail || null }),
      })
      setReportModalVisible(false)
      setReportReason('')
      setReportDetail('')
      Alert.alert('Report submitted.', 'We review all reports.')
    } catch {
      Alert.alert('Error', 'Could not submit report. Please try again.')
    } finally {
      setReportSubmitting(false)
    }
  }, [authedFetch, profile, reportReason, reportDetail])

  if (!userId) return null

  return (
    <>
    <Modal
      visible={!!userId}
      transparent
      animationType="none"
      onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <Pressable style={s.backdropTap} onPress={handleClose} />
        <View style={s.sheet}>

          <View style={s.handle} />

          <TouchableOpacity
            style={s.closeBtn}
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close profile">
            <X size={18} color="#999" />
          </TouchableOpacity>

          {profile?.profileId && (
            <TouchableOpacity
              style={s.moreBtn}
              onPress={handleMoreMenu}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="More options">
              <MoreHorizontal size={18} color="#999" />
            </TouchableOpacity>
          )}

          <ScrollView
            style={s.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}>

            {/* Show stub header instantly while fast data loads */}
            {!profile && !error && stub ? (
              <>
                <View style={s.header}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={toggleAvatarExpand}
                    style={[s.avatarTouchable, avatarExpanded && s.avatarTouchableExpanded]}
                  >
                    <RNAnimated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }, { translateY: avatarTranslateY }] }]}>
                      {stub.imageUrl ? (
                        <Image source={{ uri: stub.imageUrl }} style={s.avatar} resizeMode="cover" />
                      ) : (
                        <View style={[s.avatar, s.avatarFallback]}>
                          <Text style={s.avatarInitial}>
                            {(stub.displayName ?? '?')[0].toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </RNAnimated.View>
                  </TouchableOpacity>
                  <RNAnimated.View style={{ transform: [{ translateY: avatarTranslateY }] }}>
                    <Text style={s.displayName}>{stub.displayName ?? 'Player'}</Text>
                  </RNAnimated.View>
                </View>
                <View style={s.skeletonWrap}>
                  <SkeletonBox width="100%" height={52} borderRadius={12} style={{ marginTop: 0 }} />
                  <SkeletonBox width="100%" height={52} borderRadius={12} style={{ marginTop: 10 }} />
                  <SkeletonBox width={160} height={11} borderRadius={4} style={{ marginTop: 20 }} />
                  <SkeletonBox width="100%" height={72} borderRadius={10} style={{ marginTop: 8 }} />
                  <SkeletonBox width="100%" height={72} borderRadius={10} style={{ marginTop: 8 }} />
                </View>
              </>
            ) : !profile && !error ? (
              <ProfileSkeleton />
            ) : error ? (
              <View style={s.errorState}>
                <Text style={s.loadingText}>Could not load profile</Text>
                <TouchableOpacity
                  style={s.retryBtn}
                  onPress={() => userId && loadFast(userId).then(() => loadVenues(userId))}>
                  <Text style={s.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : profile ? (
              <>

              <View style={s.header}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={toggleAvatarExpand}
                  style={[s.avatarTouchable, avatarExpanded && s.avatarTouchableExpanded]}
                >
                  <RNAnimated.View style={[s.avatarWrap, { transform: [{ scale: avatarScale }, { translateY: avatarTranslateY }] }]}>
                    {profile.imageUrl ? (
                      <Image
                        source={{ uri: profile.imageUrl }}
                        style={s.avatar}
                        resizeMode="cover" />
                    ) : (
                      <View style={[s.avatar, s.avatarFallback]}>
                        <Text style={s.avatarInitial}>
                          {(profile.displayName ?? '?')[0].toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </RNAnimated.View>
                </TouchableOpacity>
                <RNAnimated.View style={{ transform: [{ translateY: avatarTranslateY }] }}>
                  <Text style={s.displayName}>
                    {profile.displayName ?? 'Player'}
                  </Text>
                  {profile.reclubId != null && (
                    <Text style={s.reclubId}>{profile.reclubId}</Text>
                  )}
                </RNAnimated.View>
              </View>

              {profile.duprDoubles != null && (
                <View style={s.duprPillRow}>
                  <View style={s.duprPill}>
                    <Text style={s.duprPillLabel}>DUPR</Text>
                    <Text style={s.duprPillValue}>{profile.duprDoubles.toFixed(2)}</Text>
                  </View>
                </View>
              )}

              <View style={s.statsRow}>
                <View style={[s.stat, { borderRightWidth: 0.5, borderRightColor: '#1e1e1e' }]}>
                  <Text style={s.statVal}>{profile.followingCount}</Text>
                  <Text style={s.statLbl}>Following</Text>
                </View>
                <View style={s.stat}>
                  <Text style={s.statVal}>{profile.sessionCount}</Text>
                  <Text style={s.statLbl}>Sessions</Text>
                </View>
              </View>

              <View style={s.kudosStatsRow}>
                <View style={[s.kudosStat, { borderRightWidth: 0.5, borderRightColor: '#2a2a2a' }]}>
                  <Text style={s.kudosStatEmoji}>🤜</Text>
                  <Text style={s.kudosStatVal}>{profile.myKudos.fistbump}</Text>
                  <Text style={s.kudosStatLbl}>Fist bumps</Text>
                </View>
                <View style={[s.kudosStat, { borderRightWidth: 0.5, borderRightColor: '#2a2a2a' }]}>
                  <Text style={s.kudosStatEmoji}>🔥</Text>
                  <Text style={s.kudosStatVal}>{profile.myKudos.flame}</Text>
                  <Text style={s.kudosStatLbl}>On fire</Text>
                </View>
                <View style={s.kudosStat}>
                  <Text style={s.kudosStatEmoji}>⭐</Text>
                  <Text style={s.kudosStatVal}>{profile.myKudos.star}</Text>
                  <Text style={s.kudosStatLbl}>Stars</Text>
                </View>
              </View>

              {profile.streakData && profile.streakData.currentStreak > 0 && (
                <View style={s.streakSection}>
                  <View style={s.streakTopRow}>
                    <Text style={s.streakNum}>
                      🔥 {profile.streakData.currentStreak}
                    </Text>
                    <View style={s.streakRight}>
                      <Text style={s.streakLabel}>week streak</Text>
                      <Text style={s.streakSub}>Playing consistently</Text>
                    </View>
                  </View>
                  <View style={s.weekDotsRow}>
                    {(profile.streakData.weeklyPlayed.length > 0
                      ? [...profile.streakData.weeklyPlayed, ...Array(6).fill(false)].slice(0, 6)
                      : Array(6).fill(false)
                    ).map((played, i) => (
                      <View key={i} style={[s.weekDot, played && s.weekDotOn]} />
                    ))}
                  </View>
                </View>
              )}

              {profile.reclubKudos.length > 0 && (
                <View style={s.section}>
                  <Text style={s.sectionLabel}>Endorsed on Reclub</Text>
                  <View style={s.reclubKudosRow}>
                    {profile.reclubKudos.map(k => (
                      <View key={k.type} style={s.reclubKudosPill}>
                        <Text style={s.reclubKudosCount}>{k.count}</Text>
                        <Text style={s.reclubKudosLabel}>{k.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={s.section}>
                <Text style={s.sectionLabel}>
                  Where {(profile.displayName ?? 'they').split(' ')[0]} plays regularly?
                </Text>
                <Text style={s.sectionSub}>Last 90 days</Text>
                {venuesLoading ? (
                  <>
                    <SkeletonBox width="100%" height={72} borderRadius={10} />
                    <SkeletonBox width="100%" height={72} borderRadius={10} style={{ marginTop: 8 }} />
                  </>
                ) : (profile.regularPlay?.length ?? 0) === 0 ? (
                  <Text style={s.venuesEmpty}>No sessions found in the last 90 days</Text>
                ) : null}
              </View>

              {(profile.regularPlay?.length ?? 0) > 0 && (
                <View style={s.section}>
                  {profile.regularPlay.map((venue, vi) => {
                    const distanceLabel = formatDistance(venue.distanceKm)
                    const metaParts = [
                      venue.venueName ? venue.clubName : null,
                      venue.venueAddress,
                    ].filter(Boolean)
                    return (
                    <View
                      key={`${venue.placeLabel}-${vi}`}
                      style={[
                        s.venueBlock,
                        vi === profile.regularPlay.length - 1 && s.venueBlockLast,
                      ]}>
                      <View style={s.venueHeader}>
                        <View style={s.venueIcon}>
                          <MapPin size={13} color={T.amber} />
                        </View>
                        <View style={s.venueHeaderText}>
                          <TouchableOpacity
                            style={s.venueTitleRow}
                            activeOpacity={0.7}
                            onPress={() => promptOpenInMaps(venue)}>
                            <Text style={s.venueName} numberOfLines={1}>
                              {venue.placeLabel}
                            </Text>
                            {distanceLabel !== '' && (
                              <Text style={s.venueDistance}>{distanceLabel}</Text>
                            )}
                          </TouchableOpacity>
                          {metaParts.length > 0 && (
                            <Text style={s.venueMeta} numberOfLines={1}>
                              {metaParts.join(' · ')}
                            </Text>
                          )}
                        </View>
                        <Text style={s.venueCount}>{venue.visitCount}×</Text>
                      </View>
                      {venue.sessions.map((slot, si) => (
                        <TouchableOpacity
                          key={`${slot.timeLabel}-${si}`}
                          style={s.slotRow}
                          activeOpacity={0.7}
                          onPress={() => slot.eventUrl && Linking.openURL(slot.eventUrl)}>
                          <View style={s.slotMain}>
                            <Text style={s.slotTime}>{slot.timeLabel}</Text>
                            <Text style={s.slotName} numberOfLines={1}>
                              {slot.sessionName}
                            </Text>
                          </View>
                          <Text style={s.slotCount}>{slot.count}×</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    )
                  })}
                </View>
              )}

              <View style={{ height: 32 }} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Report reason picker modal */}
    <Modal
      visible={reportModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setReportModalVisible(false)}>
      <View style={s.reportBackdrop}>
        <View style={s.reportSheet}>
          <Text style={s.reportTitle}>Report player</Text>

          {[
            { key: 'fake_account', label: 'Fake account' },
            { key: 'inappropriate', label: 'Inappropriate' },
            { key: 'harassment', label: 'Harassment' },
            { key: 'other', label: 'Other' },
          ].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[s.reportOption, reportReason === key && s.reportOptionActive]}
              onPress={() => setReportReason(key)}
            >
              <Text style={[s.reportOptionText, reportReason === key && s.reportOptionTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}

          <TextInput
            style={s.reportInput}
            value={reportDetail}
            onChangeText={setReportDetail}
            placeholder="Additional details (optional)"
            placeholderTextColor="#555"
            multiline
            numberOfLines={3}
          />

          <View style={s.reportActions}>
            <TouchableOpacity
              style={s.reportCancelBtn}
              onPress={() => {
                setReportModalVisible(false)
                setReportReason('')
                setReportDetail('')
              }}>
              <Text style={s.reportCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.reportSubmitBtn, (!reportReason || reportSubmitting) && { opacity: 0.5 }]}
              onPress={handleSubmitReport}
              disabled={!reportReason || reportSubmitting}>
              <Text style={s.reportSubmitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: SHEET_HEIGHT,
    paddingTop: 8,
    overflow: 'visible',
  },
  scroll: {
    flex: 1,
    overflow: 'visible',
  },
  handle: {
    width: 32, height: 3,
    backgroundColor: '#2a2a2a',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 20,
    elevation: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 40,
    paddingBottom: 32,
  },
  skeletonWrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  errorState: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 13,
    color: '#444',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 12,
    color: T.amber,
    fontWeight: '500',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    overflow: 'visible',
  },
  avatarTouchable: {
    overflow: 'visible',
    zIndex: 1,
  },
  avatarTouchableExpanded: {
    zIndex: 100,
    elevation: 100,
  },
  avatarWrap: {
    marginBottom: 10,
    overflow: 'visible',
  },
  avatar: {
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 2,
    borderColor: T.amber,
  },
  avatarFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: '600',
    color: T.amber,
  },
  displayName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  reclubId: {
    fontSize: 11,
    color: '#555',
    marginTop: 4,
    textAlign: 'center',
  },
  duprPillRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  duprPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(127,119,221,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(127,119,221,0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  duprPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7F77DD',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  duprPillValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7F77DD',
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  stat: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statVal: {
    fontSize: 16,
    fontWeight: '600',
    color: T.amber,
  },
  statLbl: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  kudosStatsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  kudosStat: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  kudosStatEmoji: {
    fontSize: 16,
  },
  kudosStatVal: {
    fontSize: 16,
    fontWeight: '600',
    color: T.amber,
    marginTop: 2,
  },
  kudosStatLbl: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  streakSection: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#1f1400',
    borderWidth: 0.5,
    borderColor: '#f5a623',
    borderRadius: 12,
    padding: 12,
  },
  streakTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  streakNum: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f5a623',
    lineHeight: 28,
  },
  streakRight: {
    flex: 1,
  },
  streakLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  streakSub: {
    fontSize: 10,
    color: '#555',
    marginTop: 1,
  },
  weekDotsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  weekDot: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
  },
  weekDotOn: {
    backgroundColor: '#f5a623',
    borderColor: '#f5a623',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11,
    color: '#ccc',
    fontWeight: '500',
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  reclubKudosRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  reclubKudosPill: {
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 60,
  },
  reclubKudosCount: {
    fontSize: 14,
    fontWeight: '600',
    color: T.amber,
  },
  reclubKudosLabel: {
    fontSize: 9,
    color: '#555',
    marginTop: 1,
  },
  venueBlock: {
    backgroundColor: '#141414',
    borderWidth: 0.5,
    borderColor: '#1e1e1e',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 8,
  },
  venueBlockLast: {
    marginBottom: 0,
  },
  venueHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  venueHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  venueIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  venueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  venueName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#ddd',
    minWidth: 0,
  },
  venueDistance: {
    fontSize: 11,
    fontWeight: '500',
    color: T.amber,
    flexShrink: 0,
  },
  venueMeta: {
    fontSize: 10,
    color: '#555',
    marginTop: 2,
  },
  venueCount: {
    fontSize: 11,
    fontWeight: '600',
    color: T.amber,
    flexShrink: 0,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 32,
    borderTopWidth: 0.5,
    borderTopColor: '#1a1a1a',
  },
  slotMain: {
    flex: 1,
    minWidth: 0,
  },
  slotTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5DCAA5',
  },
  slotName: {
    fontSize: 10,
    color: '#666',
    marginTop: 1,
  },
  slotCount: {
    fontSize: 10,
    color: '#444',
    flexShrink: 0,
  },
  venuesEmpty: {
    fontSize: 12,
    color: '#333',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  moreBtn: {
    position: 'absolute',
    top: 16,
    right: 48,
    zIndex: 10,
    padding: 4,
  },
  reportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  reportSheet: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  reportOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 8,
  },
  reportOptionActive: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  reportOptionText: {
    fontSize: 14,
    color: '#aaa',
  },
  reportOptionTextActive: {
    color: '#ef4444',
    fontWeight: '600',
  },
  reportInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 8,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  reportActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  reportCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  reportCancelText: {
    fontSize: 14,
    color: '#888',
  },
  reportSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  reportSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
})
