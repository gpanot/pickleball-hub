import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
  Image, ScrollView,
} from 'react-native';
import type { SquadChest } from '../types';

const GOLD = '#facc15';
const LIME = '#a3e635';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan small.png');
const CARD_WIDTH = 108;
const CARD_GAP = 10;
const MAX_SLOTS = 8;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Props {
  /** All active chests for the squad, oldest first */
  chests: SquadChest[];
  myProfileId?: string | null;
  onTap: (chest: SquadChest) => void;
  onOpen: (chest: SquadChest) => void;
  onNudge: (chest: SquadChest) => void;
  onPress: (chest: SquadChest) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SquadChestCard({
  chests,
  myProfileId,
  onTap,
  onOpen,
  onNudge,
  onPress,
}: Props) {
  // One slot per chest for this player, padded with empties up to MAX_SLOTS
  const mySlots = buildMySlots(chests, myProfileId ?? null, MAX_SLOTS);

  // Nudge: chests where OTHER members are still pending
  const nudgeable = chests.filter(chest =>
    chest.openings.some(o => o.profileId !== myProfileId && o.status === 'pending')
  );

  return (
    <View style={s.wrapper}>
      {/* Section header */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>SQUAD CHESTS</Text>
        {chests.length > 0 && (
          <Text style={s.streakBadge}>🔥 Day {computeStreakDay(chests[0].createdAt)} of 3</Text>
        )}
      </View>

      {/* Horizontal scroll — one slot per chest */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        decelerationRate="fast"
      >
        {mySlots.map((slot, idx) => (
          <ChestSlot
            key={slot.chestId ?? `empty-${idx}`}
            slot={slot}
            onTap={slot.chest && slot.status === 'pending' ? () => onTap(slot.chest!) : undefined}
            onOpen={slot.chest && slot.status === 'ready' ? () => onOpen(slot.chest!) : undefined}
            onPress={slot.chest ? () => onPress(slot.chest!) : undefined}
          />
        ))}
      </ScrollView>

      {/* Nudge row — only when there are other members still pending */}
      {nudgeable.length > 0 && (
        <TouchableOpacity
          style={s.nudgeRow}
          onPress={() => onNudge(nudgeable[0])}
          activeOpacity={0.7}
        >
          <Text style={s.nudgeText}>
            👋 Nudge squadmates to tap their chest
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Single slot card ─────────────────────────────────────────────────────────

interface MySlot {
  chestId: string | null;
  chest: SquadChest | null;
  status: 'empty' | 'pending' | 'unlocking' | 'ready' | 'opened' | 'expired';
  unlocksAt: string | null;
  source: string | null;
}

function ChestSlot({
  slot,
  onTap,
  onOpen,
  onPress,
}: {
  slot: MySlot;
  onTap?: () => void;
  onOpen?: () => void;
  onPress?: () => void;
}) {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const [timeLeft, setTimeLeft] = useState('');

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

  if (slot.status === 'empty') {
    return (
      <View style={[s.card, s.cardEmpty]}>
        <View style={s.emptyBox} />
        <Text style={s.emptyLabel}>CHEST SLOT</Text>
      </View>
    );
  }

  const borderColor = getSlotBorder(slot.status);
  const isOpen = slot.status === 'opened';
  const isUnlocking = slot.status === 'unlocking';
  const isReady = slot.status === 'ready';
  const handlePress = onOpen ?? onTap ?? onPress;

  // Source label
  const sourceLabel = slot.source === 'play_intent' ? '🎯' : '📍';

  return (
    <TouchableOpacity
      style={[s.card, borderColor ? { borderColor, borderWidth: 2 } : {}]}
      activeOpacity={0.82}
      onPress={handlePress}
    >
      <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
        <Image
          source={CHEST_IMAGE}
          style={[s.chestImg, (isOpen || slot.status === 'expired') && s.chestImgDim]}
          resizeMode="contain"
        />
      </Animated.View>

      {isReady && (
        <View style={s.openBtn}>
          <Text style={s.openBtnText}>OPEN!</Text>
        </View>
      )}
      {isUnlocking && (
        <View style={s.timerBadge}>
          <Text style={s.timerText}>{timeLeft}</Text>
        </View>
      )}
      {slot.status === 'pending' && (
        <View style={s.tapStartBtn}>
          <Text style={s.tapStartText}>TAP TO{'\n'}START</Text>
        </View>
      )}

      <Text style={s.sourceLabel}>{sourceLabel}</Text>
    </TouchableOpacity>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMySlots(
  chests: SquadChest[],
  myProfileId: string | null,
  maxSlots: number,
): MySlot[] {
  const slots: MySlot[] = chests.map(chest => {
    const myOpening = chest.myOpening
      ?? chest.openings.find(o => o.profileId === myProfileId);
    return {
      chestId: chest.id,
      chest,
      status: (myOpening?.status ?? 'pending') as MySlot['status'],
      unlocksAt: myOpening?.unlocksAt ?? null,
      source: chest.source,
    };
  });

  // Pad with empty slots
  while (slots.length < maxSlots) {
    slots.push({ chestId: null, chest: null, status: 'empty', unlocksAt: null, source: null });
  }

  return slots.slice(0, maxSlots);
}

function getSlotBorder(status: MySlot['status']): string | null {
  if (status === 'ready') return LIME;
  if (status === 'unlocking') return GOLD;
  if (status === 'pending') return 'rgba(163,230,53,0.4)';
  if (status === 'opened') return '#22c55e';
  return null;
}

function computeStreakDay(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.min(Math.floor(diff / 86400000) + 1, 3);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1,
    textTransform: 'uppercase', color: '#52525b',
  },
  streakBadge: { fontSize: 12, fontWeight: '800', color: GOLD },
  scrollContent: { paddingHorizontal: 16, gap: CARD_GAP, paddingRight: 24 },
  card: {
    width: CARD_WIDTH, backgroundColor: '#111', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6,
    gap: 6, minHeight: 140,
  },
  cardEmpty: {
    borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.07)', justifyContent: 'center',
  },
  emptyBox: {
    width: 48, height: 48, backgroundColor: '#1a1a1a', borderRadius: 8, marginBottom: 6,
  },
  emptyLabel: {
    fontSize: 9, fontWeight: '700', color: '#3f3f46',
    textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center',
  },
  chestImg: { width: 64, height: 64 },
  chestImgDim: { opacity: 0.45 },
  openBtn: {
    backgroundColor: LIME, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 12,
  },
  openBtnText: { fontSize: 11, fontWeight: '900', color: '#000' },
  timerBadge: {
    backgroundColor: 'rgba(250,204,21,0.12)', borderRadius: 6,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  timerText: {
    fontSize: 11, fontWeight: '900', color: GOLD, fontVariant: ['tabular-nums'],
  },
  tapStartBtn: {
    backgroundColor: 'rgba(163,230,53,0.12)', borderRadius: 6,
    paddingVertical: 5, paddingHorizontal: 8,
  },
  tapStartText: {
    fontSize: 9, fontWeight: '900', color: LIME, textAlign: 'center', lineHeight: 13,
  },
  sourceLabel: { fontSize: 12, marginTop: 2 },
  nudgeRow: {
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  nudgeText: { fontSize: 12, fontWeight: '700', color: '#71717a' },
});
