import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  Image, ScrollView, Dimensions,
} from 'react-native';
import type { SquadChest, SquadChestOpening } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan small.png');
const CARD_WIDTH = 108;
const CARD_GAP = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  chest: SquadChest;
  myProfileId?: string | null;
  /** Up to 8 squad member names for empty slot labels */
  squadMembers?: Array<{ profileId: string; displayName: string | null }>;
  onTap: () => void;
  onOpen: () => void;
  onNudge: () => void;
  onPress: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SquadChestCard({
  chest,
  myProfileId,
  squadMembers = [],
  onTap,
  onOpen,
  onNudge,
  onPress,
}: Props) {
  // Build a full list of up to 8 slots: existing openings first, then empty slots for remaining members
  const slots = buildSlots(chest.openings, squadMembers);
  const pendingCount = chest.openings.filter(o => o.status === 'pending' && o.profileId !== myProfileId).length;
  const myOpening = chest.myOpening ?? chest.openings.find(o => o.profileId === myProfileId);
  const myStatus = myOpening?.status ?? 'pending';
  const streakDay = computeStreakDay(chest.createdAt);

  return (
    <View style={s.wrapper}>
      {/* Section header */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>SQUAD CHESTS</Text>
        <Text style={s.streakBadge}>🔥 Day {streakDay} of 3</Text>
      </View>

      {/* Horizontal scroll of chest slots */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
      >
        {slots.map((slot, idx) => (
          <ChestSlot
            key={slot.profileId ?? `empty-${idx}`}
            slot={slot}
            isMe={slot.profileId === myProfileId}
            onTap={slot.profileId === myProfileId && slot.status === 'pending' ? onTap : undefined}
            onOpen={slot.profileId === myProfileId && slot.status === 'ready' ? onOpen : undefined}
            onPress={onPress}
          />
        ))}
      </ScrollView>

      {/* Nudge row */}
      {pendingCount > 0 && (
        <TouchableOpacity style={s.nudgeRow} onPress={onNudge} activeOpacity={0.7}>
          <Text style={s.nudgeText}>👋 Nudge {pendingCount} squadmate{pendingCount > 1 ? 's' : ''} to tap their chest</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Single slot card ─────────────────────────────────────────────────────────

interface SlotData {
  profileId: string | null;
  displayName: string | null;
  status: 'empty' | 'pending' | 'unlocking' | 'ready' | 'opened' | 'expired';
  unlocksAt: string | null;
}

function ChestSlot({
  slot,
  isMe,
  onTap,
  onOpen,
  onPress,
}: {
  slot: SlotData;
  isMe: boolean;
  onTap?: () => void;
  onOpen?: () => void;
  onPress?: () => void;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const [timeLeft, setTimeLeft] = useState('');

  // Float animation for chests that are active
  useEffect(() => {
    if (slot.status === 'empty') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -5, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [floatAnim, slot.status]);

  // Countdown timer for unlocking
  useEffect(() => {
    if (slot.status !== 'unlocking' || !slot.unlocksAt) return;
    const tick = () => {
      const diff = new Date(slot.unlocksAt!).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft('Ready!'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [slot.status, slot.unlocksAt]);

  const label = slot.displayName
    ? `@${slot.displayName.replace('@', '')}`
    : null;

  if (slot.status === 'empty') {
    return (
      <View style={[s.card, s.cardEmpty]}>
        <View style={s.emptyBox} />
        <Text style={s.emptyLabel}>CHEST SLOT</Text>
      </View>
    );
  }

  const borderColor = getSlotBorder(slot.status, isMe);
  const isOpen = slot.status === 'opened';
  const isUnlocking = slot.status === 'unlocking';
  const isReady = slot.status === 'ready';

  const handlePress = onOpen ?? onTap ?? onPress;

  return (
    <TouchableOpacity
      style={[s.card, borderColor ? { borderColor, borderWidth: 2 } : {}]}
      activeOpacity={0.82}
      onPress={handlePress}
    >
      {/* Chest image */}
      <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
        <Image
          source={CHEST_IMAGE}
          style={[s.chestImg, (isOpen || slot.status === 'expired') && s.chestImgDim]}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Status button */}
      {isMe && isReady && (
        <View style={s.openBtn}>
          <Text style={s.openBtnText}>OPEN!</Text>
        </View>
      )}
      {isMe && isUnlocking && (
        <View style={s.timerBadge}>
          <Text style={s.timerText}>{timeLeft}</Text>
        </View>
      )}
      {isMe && slot.status === 'pending' && (
        <View style={s.tapStartBtn}>
          <Text style={s.tapStartText}>TAP TO{'\n'}START</Text>
        </View>
      )}
      {!isMe && isUnlocking && (
        <View style={s.timerBadge}>
          <Text style={s.timerText}>{timeLeft}</Text>
        </View>
      )}

      {/* Member label */}
      {label && (
        <Text style={[s.memberLabel, isMe && s.memberLabelMe]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSlots(
  openings: SquadChestOpening[],
  squadMembers: Array<{ profileId: string; displayName: string | null }>,
): SlotData[] {
  const slots: SlotData[] = openings.map(o => ({
    profileId: o.profileId,
    displayName: o.displayName,
    status: o.status as SlotData['status'],
    unlocksAt: o.unlocksAt,
  }));

  // Add empty slots for squad members who don't have an opening yet
  const existingIds = new Set(openings.map(o => o.profileId));
  for (const m of squadMembers) {
    if (!existingIds.has(m.profileId) && slots.length < 8) {
      slots.push({
        profileId: m.profileId,
        displayName: m.displayName,
        status: 'pending',
        unlocksAt: null,
      });
    }
  }

  // Pad up to 8 with empty slots
  while (slots.length < 8) {
    slots.push({ profileId: null, displayName: null, status: 'empty', unlocksAt: null });
  }

  return slots.slice(0, 8);
}

function getSlotBorder(status: SlotData['status'], isMe: boolean): string | null {
  if (isMe && status === 'ready') return LIME;
  if (isMe && status === 'unlocking') return GOLD;
  if (isMe && status === 'pending') return 'rgba(163,230,53,0.4)';
  if (status === 'opened') return '#22c55e';
  if (status === 'unlocking') return GOLD;
  return null;
}

function computeStreakDay(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(diff / 86400000);
  return Math.min(days + 1, 3);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#52525b',
  },
  streakBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: GOLD,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: CARD_GAP,
    paddingRight: 24,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 6,
    minHeight: 140,
  },
  cardEmpty: {
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
  },
  emptyBox: {
    width: 48,
    height: 48,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 6,
  },
  emptyLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#3f3f46',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  chestImg: {
    width: 64,
    height: 64,
  },
  chestImgDim: {
    opacity: 0.45,
  },
  // Buttons
  openBtn: {
    backgroundColor: LIME,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  openBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#000',
  },
  timerBadge: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '900',
    color: GOLD,
    fontVariant: ['tabular-nums'],
  },
  tapStartBtn: {
    backgroundColor: 'rgba(163,230,53,0.12)',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tapStartText: {
    fontSize: 9,
    fontWeight: '900',
    color: LIME,
    textAlign: 'center',
    lineHeight: 13,
  },
  memberLabel: {
    fontSize: 10,
    color: '#71717a',
    fontWeight: '700',
    textAlign: 'center',
  },
  memberLabelMe: {
    color: '#a1a1aa',
  },
  // Nudge row
  nudgeRow: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  nudgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717a',
  },
});
