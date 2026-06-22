/**
 * LocationPicker — bottom-sheet modal for pinning a preferred location.
 *
 * Rows:
 *   1. "Use my current location" — requests GPS, then calls onPick({ lat, lng, label })
 *   2–N. Recent Conquest spots: venueName as primary, relative-date as secondary
 *
 * Usage:
 *   <LocationPicker
 *     visible={show}
 *     onClose={() => setShow(false)}
 *     onPick={(place) => handleAdd(place)}
 *   />
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MapPin, Navigation, ChevronRight } from 'lucide-react-native'
import {
  getCurrentLocation,
  getRecentSpots,
  type RecentSpot,
} from '../../../services/locationPicker'

// ─── Design tokens ─────────────────────────────────────────────────────────
const BG = '#141414'
const SURFACE2 = '#1e1e1e'
const LIME = '#84cc16'
const TEXT = '#f4f4f5'
const TEXT2 = '#71717a'
const BORDER = 'rgba(255,255,255,0.08)'

// ─── Types ──────────────────────────────────────────────────────────────────
export interface PickedPlace {
  lat: number
  lng: number
  label: string
}

interface Props {
  visible: boolean
  onClose: () => void
  onPick: (place: PickedPlace) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return '1 week ago'
  return `${Math.floor(days / 7)} weeks ago`
}

// ─── Component ──────────────────────────────────────────────────────────────
export function LocationPicker({ visible, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets()
  const [loadingGps, setLoadingGps] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [recentSpots, setRecentSpots] = useState<RecentSpot[]>([])

  useEffect(() => {
    if (!visible) return
    setLoadingHistory(true)
    getRecentSpots()
      .then(setRecentSpots)
      .finally(() => setLoadingHistory(false))
  }, [visible])

  const handleCurrentLocation = useCallback(async () => {
    setLoadingGps(true)
    try {
      const loc = await getCurrentLocation()
      if (loc) {
        onPick({ lat: loc.lat, lng: loc.lng, label: loc.label })
        onClose()
      }
    } finally {
      setLoadingGps(false)
    }
  }, [onPick, onClose])

  const handleSpot = useCallback(
    (spot: RecentSpot) => {
      onPick({ lat: spot.lat, lng: spot.lng, label: spot.venueName })
      onClose()
    },
    [onPick, onClose]
  )

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
        {/* Handle bar */}
        <View style={s.handle} />

        <Text style={s.title}>Add a place</Text>

        {/* Current location row */}
        <TouchableOpacity
          style={s.row}
          onPress={handleCurrentLocation}
          disabled={loadingGps}
          activeOpacity={0.75}
        >
          <View style={[s.iconWrap, { backgroundColor: 'rgba(132,204,22,0.15)' }]}>
            {loadingGps ? (
              <ActivityIndicator size="small" color={LIME} />
            ) : (
              <Navigation size={18} color={LIME} />
            )}
          </View>
          <View style={s.rowText}>
            <Text style={s.rowLabel}>Use my current location</Text>
            <Text style={s.rowSub}>Tap to detect via GPS</Text>
          </View>
          {!loadingGps && <ChevronRight size={16} color={TEXT2} />}
        </TouchableOpacity>

        {/* Divider */}
        {(loadingHistory || recentSpots.length > 0) && (
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>YOUR RECENT SPOTS</Text>
          </View>
        )}

        {loadingHistory ? (
          <ActivityIndicator color={TEXT2} style={{ marginVertical: 16 }} />
        ) : (
          <FlatList
            data={recentSpots}
            keyExtractor={(item) => item.venueId}
            scrollEnabled={recentSpots.length > 5}
            style={s.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={s.row}
                onPress={() => handleSpot(item)}
                activeOpacity={0.75}
              >
                <View style={[s.iconWrap, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                  <MapPin size={16} color={TEXT2} />
                </View>
                <View style={s.rowText}>
                  {/* venueName is the primary label */}
                  <Text style={s.rowLabel} numberOfLines={1}>
                    {item.venueName}
                  </Text>
                  <Text style={s.rowSub}>Last visited {relativeDate(item.lastUsedAt)}</Text>
                </View>
                <ChevronRight size={16} color={TEXT2} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={s.empty}>No recent spots yet — check in to a venue first</Text>
            }
          />
        )}
      </View>
    </Modal>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderColor: BORDER,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT,
  },
  rowSub: {
    fontSize: 12,
    color: TEXT2,
  },
  sectionHeader: {
    paddingTop: 16,
    paddingBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TEXT2,
    letterSpacing: 1,
  },
  list: {
    flexGrow: 0,
  },
  empty: {
    fontSize: 13,
    color: TEXT2,
    textAlign: 'center',
    paddingVertical: 20,
    lineHeight: 20,
  },
})
