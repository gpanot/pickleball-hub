/**
 * IntentCard — Persistent "When are you playing next?" card on the My Squadd home screen.
 *
 * Prompt state  (no active intent):
 *   "YOUR MOVE" header, WHEN ARE YOU PLAYING NEXT? title, squad member avatars,
 *   green action card "Plan your next game / N others are in"
 *
 * Active state  (intent set, not yet expired):
 *   "✓ YOU'RE IN" header, dynamic title (PLAYING TODAY / PLAYING THURSDAY / …),
 *   first squad member avatar, dark card "Tap to update your plan"
 *
 * Tapping either state calls onPress → parent opens DayOneIntentModal.
 */

import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import type { StoredIntent } from '../../../components/DayOneIntentModal'

// ─── Design tokens ────────────────────────────────────────────────────────────

const BANGERS = 'Bangers_400Regular'
const BG = '#0f1a0f'
const SURFACE = '#141414'
const SURFACE2 = '#1a1a1a'
const LIME = '#a3e635'
const LIME_DIM = 'rgba(163,230,53,0.15)'
const LIME_BORDER = 'rgba(163,230,53,0.35)'
const TEXT = '#fff'
const TEXT2 = '#a1a1aa'
const TEXT3 = '#52525b'
const GOLD = '#facc15'
const BORDER = 'rgba(255,255,255,0.07)'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IntentData {
  intent: StoredIntent | null
  intentDate: string | null    // 'YYYY-MM-DD' — only for specific_day
  expiresAt: string | null
  isActive: boolean
  aggregateCount: number
}

interface SquadMemberSnippet {
  profileId: string
  displayName: string | null
}

interface Props {
  intentData: IntentData | null
  squadMembers: SquadMemberSnippet[]
  onPress: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initial(name: string | null): string {
  return (name ?? '?').charAt(0).toUpperCase()
}

/** Derive the big title from stored intent */
function activeTitle(intent: StoredIntent, intentDate: string | null): string {
  if (intent === 'today') return 'PLAYING TODAY'
  if (intent === 'this_weekend') return 'PLAYING THIS WEEKEND'
  if (intent === 'not_sure') return 'PLAYING SOON'
  if (intent === 'specific_day' && intentDate) {
    const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    // Parse date safely without timezone shift
    const parts = intentDate.split('-').map(Number)
    const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!)
    return `PLAYING ${DAYS[d.getDay()] ?? intentDate}`
  }
  return 'PLAYING SOON'
}

// ─── Avatar strip ─────────────────────────────────────────────────────────────

function AvatarStrip({ members, max = 3 }: { members: SquadMemberSnippet[]; max?: number }) {
  const shown = members.slice(0, max)
  const overflow = members.length - max
  return (
    <View style={s.avatarStrip}>
      {shown.map((m) => (
        <View key={m.profileId} style={s.avatar}>
          <Text style={s.avatarText}>{initial(m.displayName)}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View style={[s.avatar, s.avatarOverflow]}>
          <Text style={s.avatarOverflowText}>+{overflow}</Text>
        </View>
      )}
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntentCard({ intentData, squadMembers, onPress }: Props) {
  const isActive = intentData?.isActive === true

  if (isActive && intentData) {
    return <ActiveCard intentData={intentData} squadMembers={squadMembers} onPress={onPress} />
  }

  return (
    <PromptCard
      aggregateCount={intentData?.aggregateCount ?? 0}
      squadMembers={squadMembers}
      onPress={onPress}
    />
  )
}

// ─── Prompt card ("YOUR MOVE") ────────────────────────────────────────────────

function PromptCard({
  aggregateCount,
  squadMembers,
  onPress,
}: {
  aggregateCount: number
  squadMembers: SquadMemberSnippet[]
  onPress: () => void
}) {
  const countCopy = aggregateCount > 0
    ? `${aggregateCount} ${aggregateCount === 1 ? 'player' : 'players'} are in`
    : 'Be the first to commit'

  return (
    <View style={s.card}>
      <Text style={s.tagPrompt}>YOUR MOVE</Text>
      <Text style={s.titlePrompt}>WHEN ARE YOU{'\n'}PLAYING NEXT?</Text>

      <AvatarStrip members={squadMembers} />

      <TouchableOpacity style={s.actionRowGreen} onPress={onPress} activeOpacity={0.85}>
        <View style={s.actionTextCol}>
          <Text style={s.actionTitle}>Plan your next game</Text>
          <Text style={s.actionSub}>{countCopy}</Text>
        </View>
        <Text style={s.arrow}>→</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Active card ("YOU'RE IN") ────────────────────────────────────────────────

function ActiveCard({
  intentData,
  squadMembers,
  onPress,
}: {
  intentData: IntentData
  squadMembers: SquadMemberSnippet[]
  onPress: () => void
}) {
  const title = activeTitle(intentData.intent!, intentData.intentDate)
  const firstMember = squadMembers[0] ?? null

  return (
    <View style={[s.card, s.cardActive]}>
      <View style={s.tagActiveRow}>
        <Text style={s.tagActiveCheck}>✓ </Text>
        <Text style={s.tagActive}>YOU'RE IN</Text>
      </View>
      <Text style={s.titleActive}>{title}</Text>

      {firstMember && (
        <View style={s.avatarStrip}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initial(firstMember.displayName)}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={s.actionRowDark} onPress={onPress} activeOpacity={0.85}>
        <View style={s.actionTextCol}>
          <Text style={s.actionTitleDark}>Tap to update your plan</Text>
        </View>
        <Text style={s.arrowDark}>→</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: BG,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LIME_BORDER,
    padding: 18,
    gap: 12,
  },
  cardActive: {
    backgroundColor: '#0c1a0c',
  },

  // Prompt state
  tagPrompt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: LIME,
    textTransform: 'uppercase',
  },
  titlePrompt: {
    fontFamily: BANGERS,
    fontSize: 26,
    color: TEXT,
    lineHeight: 30,
    letterSpacing: 0.5,
  },

  // Active state
  tagActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagActiveCheck: {
    fontSize: 12,
    color: LIME,
    fontWeight: '900',
  },
  tagActive: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: LIME,
    textTransform: 'uppercase',
  },
  titleActive: {
    fontFamily: BANGERS,
    fontSize: 26,
    color: TEXT,
    lineHeight: 30,
    letterSpacing: 0.5,
  },

  // Avatar strip
  avatarStrip: {
    flexDirection: 'row',
    gap: -8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a2e1a',
    borderWidth: 2,
    borderColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: LIME,
  },
  avatarOverflow: {
    backgroundColor: '#27272a',
  },
  avatarOverflowText: {
    fontSize: 10,
    fontWeight: '800',
    color: TEXT2,
  },

  // Green action row
  actionRowGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: LIME,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
  },
  actionTextCol: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#000',
  },
  actionSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(0,0,0,0.6)',
  },
  arrow: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000',
  },

  // Dark action row (active state)
  actionRowDark: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE2,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  actionTitleDark: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT2,
  },
  arrowDark: {
    fontSize: 16,
    color: TEXT3,
  },
})
