import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Squad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';
const LIME = '#a3e635';

const LEVEL_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];

function getXpProgress(totalXp: number, level: number): { current: number; threshold: number } {
  let prev = 0;
  let next = 300;
  if (level <= LEVEL_THRESHOLDS.length) {
    prev = LEVEL_THRESHOLDS[level - 1] ?? 0;
    next = LEVEL_THRESHOLDS[level] ?? (prev + 4000);
  } else {
    prev = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - LEVEL_THRESHOLDS.length) * 4000;
    next = prev + 4000;
  }
  return { current: totalXp - prev, threshold: next - prev };
}

interface Props {
  squad: Squad;
  cityRank?: number | null;
}

export function SquadIdentityBar({ squad, cityRank }: Props) {
  const { current, threshold } = getXpProgress(squad.totalXp, squad.level);
  const pct = Math.min(100, (current / threshold) * 100);
  const cityLabel = (squad as any).city === 'hcm' ? 'Ho Chi Minh City' : (squad as any).city ?? 'City';

  return (
    <View style={s.container}>
      <View style={s.topRow}>
        <Text style={s.emoji}>{squad.emoji}</Text>
        <Text style={s.name}>{squad.name}</Text>
        <View style={s.lvlBadge}>
          <Text style={s.lvlText}>LVL {squad.level}</Text>
        </View>
      </View>
      <Text style={s.district}>
        {cityLabel}{cityRank ? ` · #${cityRank} on leaderboard` : ''}
      </Text>
      <View style={s.xpRow}>
          <View style={s.xpTrack}>
            <View style={[s.xpFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.xpLabel}>{current} / {threshold} XP</Text>
        </View>
      <Text style={s.clubhouseHint}>🏛 Clubhouse →</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    margin: 16,
    backgroundColor: 'rgba(26,26,10,1)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.2)',
    borderRadius: 16,
    padding: 16,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  emoji: { fontSize: 32 },
  name: { fontFamily: BANGERS, fontSize: 24, color: GOLD, flex: 1 },
  lvlBadge: {
    backgroundColor: 'rgba(250,204,21,0.15)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 100,
  },
  lvlText: { fontSize: 11, fontWeight: '900', color: GOLD },
  district: { fontSize: 12, color: '#a1a1aa', fontWeight: '600', marginBottom: 10 },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  xpTrack: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: LIME },
  xpLabel: { fontSize: 11, fontWeight: '800', color: '#52525b' },
  clubhouseHint: { fontSize: 11, fontWeight: '700', color: 'rgba(163,230,53,0.5)', marginTop: 10, textAlign: 'right' },
});
