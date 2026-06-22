/**
 * PlacesCard — horizontal card for the My Squadd home screen.
 *
 * Shows the player's pinned preferred places count + a "+ Add" CTA.
 * Tapping the card or "+ Add" opens the LocationPicker sheet.
 */

import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { MapPin, Plus } from 'lucide-react-native'
import type { PreferredPlace } from '../../../services/locationPicker'

// ─── Design tokens ──────────────────────────────────────────────────────────
const SURFACE = '#141414'
const BORDER = 'rgba(255,255,255,0.08)'
const LIME = '#84cc16'
const TEXT2 = '#71717a'
const LIME_DIM = 'rgba(132,204,22,0.10)'

// ─── Props ──────────────────────────────────────────────────────────────────
interface Props {
  places: PreferredPlace[]
  onPress: () => void // opens LocationPicker
}

// ─── Component ──────────────────────────────────────────────────────────────
export function PlacesCard({ places, onPress }: Props) {
  const count = places.length
  const subtitle =
    count === 0
      ? 'No places pinned yet'
      : count === 1
      ? '1 place pinned'
      : `${count} places pinned`

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Icon */}
      <View style={s.iconWrap}>
        <MapPin size={18} color={LIME} />
      </View>

      {/* Text */}
      <View style={s.textBlock}>
        <Text style={s.title}>YOUR PLACES</Text>
        <Text style={s.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {/* Add CTA */}
      <TouchableOpacity style={s.addBtn} onPress={onPress} hitSlop={8}>
        <Plus size={14} color={LIME} />
        <Text style={s.addText}>Add</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    // Card width: same visual width as other cards in the horizontal row
    width: 220,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: LIME_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: LIME,
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 12,
    color: TEXT2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: LIME_DIM,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
  },
  addText: {
    fontSize: 12,
    fontWeight: '700',
    color: LIME,
  },
})

