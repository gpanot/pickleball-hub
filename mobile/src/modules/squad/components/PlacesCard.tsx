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
      <MapPin size={28} color={LIME} style={s.icon} />
      <Text style={s.title}>YOUR PLACES</Text>
      <Text style={s.subtitle} numberOfLines={1}>
        {subtitle}
      </Text>
      <TouchableOpacity style={s.addBtn} onPress={onPress} hitSlop={8}>
        <Plus size={12} color={LIME} />
        <Text style={s.addText}>+ Add</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    width: 160,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 2,
  },
  icon: { marginBottom: 4 },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: LIME,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    color: TEXT2,
    textAlign: 'center',
    marginBottom: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1.5,
    borderColor: LIME,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  addText: {
    fontSize: 11,
    fontWeight: '800',
    color: LIME,
  },
})

