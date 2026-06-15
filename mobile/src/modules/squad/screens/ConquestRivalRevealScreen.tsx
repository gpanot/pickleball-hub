import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';
import type { ConquestSession, SquadCardData } from '../types';
import { formatCountdown } from '../hooks/useConquest';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';
const RED = '#ef4444';
const SURFACE = '#141414';

interface Props {
  session: ConquestSession;
  mySquad: { id: string; name: string; emoji: string; level: number };
  rivalSquadName: string;
  rivalSquadEmoji: string;
  cardData: SquadCardData | null;
  onBack: () => void;
  onPlayCard: () => Promise<void>;
  onViewBattle?: () => void;
  battlePending?: boolean; // true once the battle has been initiated
}

export function ConquestRivalRevealScreen({
  session,
  mySquad,
  rivalSquadName,
  rivalSquadEmoji,
  cardData,
  onBack,
  onPlayCard,
  onViewBattle,
  battlePending = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [playing, setPlaying] = useState(false);
  const [revealSeconds, setRevealSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date(session.autoEndsAt).getTime() - Date.now()) / 1000))
  );

  const autoRevealTotal = Math.floor(
    (new Date(session.autoEndsAt).getTime() - new Date(session.startedAt).getTime()) / 1000
  );
  const progress = autoRevealTotal > 0
    ? Math.min(1, 1 - revealSeconds / autoRevealTotal)
    : 1;

  useEffect(() => {
    setRevealSeconds(Math.max(0, Math.floor((new Date(session.autoEndsAt).getTime() - Date.now()) / 1000)));
    const t = setInterval(() => setRevealSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [session.autoEndsAt]);

  const handlePlayCard = async () => {
    setPlaying(true);
    try {
      await onPlayCard();
    } finally {
      setPlaying(false);
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <SquadBackButton onPress={onBack} />
        <View style={s.headerCenter}>
          <Text style={s.headerSub}>⚡ FOG LIFTING</Text>
          <Text style={s.headerTitle}>Rival Revealed</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Trigger banner */}
        <View style={s.triggerBanner}>
          <View style={s.triggerDot} />
          <Text style={s.triggerText}>
            {rivalSquadName} just checked in — battle triggered automatically
          </Text>
        </View>

        {/* VS card */}
        <View style={s.vsCard}>
          <View style={s.vsWatermark}>
            <Text style={s.vsWatermarkText}>⚔️</Text>
          </View>
          <View style={s.vsRow}>
            <View style={s.vsSquad}>
              <Text style={s.vsEmoji}>{mySquad.emoji}</Text>
              <Text style={[s.vsName, { color: LIME }]}>{mySquad.name}</Text>
              <Text style={s.vsSub}>You</Text>
            </View>
            <View style={s.vsCenter}>
              <Text style={s.vsLabel}>VS</Text>
              <Text style={s.vsClash}>CLASH</Text>
            </View>
            <View style={s.vsSquad}>
              <Text style={s.vsEmoji}>{rivalSquadEmoji}</Text>
              <Text style={[s.vsName, { color: GOLD }]}>{rivalSquadName}</Text>
              <Text style={s.vsSub}>just arrived</Text>
            </View>
          </View>
          <View style={s.clashMultiplier}>
            <Text style={s.clashMultiplierText}>
              🏟️ <Text style={s.clashRed}>Arena Clash active</Text>
              {' '}— both squads earn ×2.0
            </Text>
            <Text style={s.clashX}>×2.0</Text>
          </View>
        </View>

        {/* Squad Card */}
        <View style={s.cardSection}>
          <Text style={s.sectionLabel}>YOUR SQUAD CARD</Text>
          <View style={s.squadCard}>
            <View style={s.cardWatermark}>
              <Text style={s.cardWatermarkText}>SQUAD CARD</Text>
            </View>
            {/* Card top row */}
            <View style={s.cardTopRow}>
              <View style={s.cardEmojiBox}>
                <Text style={s.cardEmoji}>{mySquad.emoji}</Text>
              </View>
              <View style={s.cardNameWrap}>
                <Text style={s.cardName}>{mySquad.name}</Text>
                <Text style={s.cardSubName}>Level {mySquad.level}</Text>
              </View>
              <View style={s.cardPowerWrap}>
                <Text style={s.cardPowerLabel}>CARD POWER</Text>
                <Text style={s.cardPower}>{cardData?.cardPowerInf ?? '…'}</Text>
                <Text style={s.cardPowerSub}>INF bonus</Text>
              </View>
            </View>
            {/* Stat boxes */}
            <View style={s.cardStats}>
              <View style={s.cardStat}>
                <Text style={s.cardStatIcon}>🏆</Text>
                <Text style={s.cardStatValue}>{cardData?.venuesOwnedCount ?? 0}</Text>
                <Text style={s.cardStatLabel}>Venues owned</Text>
              </View>
              <View style={s.cardStat}>
                <Text style={s.cardStatIcon}>⚡</Text>
                <Text style={[s.cardStatValue, { color: LIME }]}>LV {mySquad.level}</Text>
                <Text style={s.cardStatLabel}>Squad level</Text>
              </View>
              <View style={s.cardStat}>
                <Text style={s.cardStatIcon}>🏓</Text>
                <Text style={[s.cardStatValue, { color: LIME }]}>{cardData?.activeMembersThisWeek ?? 0}</Text>
                <Text style={s.cardStatLabel}>Active this week</Text>
              </View>
            </View>
            {/* CTA — switches to "Check the Battle" once battle is initiated */}
            {battlePending ? (
              <TouchableOpacity
                style={[s.playBtn, { backgroundColor: LIME }]}
                onPress={onViewBattle}
                activeOpacity={0.82}
              >
                <Text style={s.playBtnText}>⚔️ Check the Battle →</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={s.playBtn}
                onPress={handlePlayCard}
                disabled={playing}
                activeOpacity={0.82}
              >
                {playing ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={s.playBtnText}>⚔️ Play Squad Card</Text>
                )}
              </TouchableOpacity>
            )}
            <Text style={s.gamblerNote}>You don't know their card power — it's a gamble</Text>
          </View>
        </View>

        {/* Auto-reveal strip */}
        <View style={s.revealStrip}>
          <Text style={s.revealLabel}>INF AUTO-REVEALS IN</Text>
          <Text style={s.revealValue}>{formatCountdown(revealSeconds)}</Text>
          <View style={s.revealBar}>
            <View style={[s.revealFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerSub: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', color: GOLD,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  scroll: { paddingBottom: 100 },

  triggerBanner: {
    margin: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 10, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  triggerDot: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: RED,
  },
  triggerText: { fontSize: 12, fontWeight: '700', color: RED, flex: 1, lineHeight: 16 },

  // VS card
  vsCard: {
    marginHorizontal: 12, marginBottom: 10,
    backgroundColor: '#0f0d00',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)',
    borderRadius: 16, padding: 16, overflow: 'hidden',
  },
  vsWatermark: {
    position: 'absolute', top: '50%', left: '50%',
    transform: [{ translateX: -40 }, { translateY: -40 }],
  },
  vsWatermarkText: { fontSize: 80, opacity: 0.04 },
  vsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12,
  },
  vsSquad: { flex: 1, alignItems: 'center', gap: 4 },
  vsEmoji: { fontSize: 36, lineHeight: 40 },
  vsName: { fontFamily: BANGERS, fontSize: 17, letterSpacing: 0.5 },
  vsSub: { fontSize: 11, color: '#a1a1aa' },
  vsCenter: { alignItems: 'center', flexShrink: 0 },
  vsLabel: { fontFamily: BANGERS, fontSize: 26, color: RED, letterSpacing: 1 },
  vsClash: { fontSize: 9, fontWeight: '800', color: RED, letterSpacing: 1 },
  clashMultiplier: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  clashMultiplierText: { fontSize: 12, color: '#a1a1aa', flex: 1 },
  clashRed: { color: RED, fontWeight: '700' },
  clashX: { fontFamily: BANGERS, fontSize: 20, color: RED },

  // Squad card
  cardSection: { marginHorizontal: 12, marginBottom: 10 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, color: '#52525b', marginBottom: 10,
  },
  squadCard: {
    backgroundColor: '#1a1a0a',
    borderWidth: 1.5, borderColor: 'rgba(250,204,21,0.4)',
    borderRadius: 20, padding: 18, overflow: 'hidden',
  },
  cardWatermark: {
    position: 'absolute', bottom: 10, right: 14,
  },
  cardWatermarkText: {
    fontFamily: BANGERS, fontSize: 11, letterSpacing: 2,
    color: 'rgba(250,204,21,0.15)',
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14,
  },
  cardEmojiBox: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  cardEmoji: { fontSize: 26 },
  cardNameWrap: { flex: 1, justifyContent: 'center' },
  cardName: { fontFamily: BANGERS, fontSize: 20, color: GOLD, letterSpacing: 0.5 },
  cardSubName: { fontSize: 11, color: '#a1a1aa', marginTop: 2 },
  cardPowerWrap: { alignItems: 'flex-end', flexShrink: 0 },
  cardPowerLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: '#52525b' },
  cardPower: { fontFamily: BANGERS, fontSize: 28, color: GOLD, lineHeight: 32 },
  cardPowerSub: { fontSize: 9, color: '#52525b' },
  cardStats: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  cardStat: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8, padding: 8, alignItems: 'center', gap: 2,
  },
  cardStatIcon: { fontSize: 16 },
  cardStatValue: { fontFamily: BANGERS, fontSize: 16, color: GOLD },
  cardStatLabel: { fontSize: 9, color: '#52525b', textAlign: 'center' },
  playBtn: {
    backgroundColor: GOLD,
    borderBottomWidth: 3, borderBottomColor: GOLD_DARK,
    borderRadius: 16, padding: 14, alignItems: 'center',
  },
  playBtnText: { fontSize: 15, fontWeight: '900', color: '#000' },
  gamblerNote: { fontSize: 10, color: '#52525b', textAlign: 'center', marginTop: 8 },

  // Reveal strip
  revealStrip: {
    marginHorizontal: 12, marginBottom: 20,
    backgroundColor: SURFACE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 14, alignItems: 'center',
  },
  revealLabel: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 6,
  },
  revealValue: { fontFamily: BANGERS, fontSize: 44, color: LIME, letterSpacing: 1 },
  revealBar: {
    width: '100%', height: 4, backgroundColor: '#2a2a2a',
    borderRadius: 2, marginTop: 10, overflow: 'hidden',
  },
  revealFill: { height: '100%', borderRadius: 2, backgroundColor: LIME },
  revealNote: { fontSize: 11, color: '#52525b', marginTop: 8 },
});
