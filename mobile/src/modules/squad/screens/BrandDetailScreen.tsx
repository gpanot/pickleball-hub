import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';
import type { PlayerBrandData } from '../types';

const PURPLE = '#a78bfa';
const BLUE = '#60a5fa';
const LIME = '#a3e635';

const BRAND_LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500, 11500];

function getXpProgress(xp: number, level: number) {
  const prev = BRAND_LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = BRAND_LEVEL_THRESHOLDS[level] ?? prev + 3000;
  const progress = Math.min(1, (xp - prev) / Math.max(1, next - prev));
  return { prev, next, progress, toNext: Math.max(0, next - xp) };
}

const BRAND_NAMES: Record<string, string> = {
  joola: 'JOOLA', selkirk: 'Selkirk', gearbox: 'Gearbox',
  six_zero: 'Six Zero', crbn: 'CRBN', vatic_pro: 'Vatic Pro',
};

const BRAND_EMOJIS: Record<string, string> = {
  joola: '⚡', selkirk: '🛡', gearbox: '🔁',
  six_zero: '🤝', crbn: '💥', vatic_pro: '🌱',
};

interface Props {
  brandData: PlayerBrandData;
  brandTokens: number;
  onSwitchBrand: () => void;
  onBack: () => void;
}

export function BrandDetailScreen({ brandData, brandTokens, onSwitchBrand, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { prev, next, progress, toNext } = getXpProgress(brandData.brandXp, brandData.supportLevel);
  const brandName = BRAND_NAMES[brandData.brand] ?? brandData.brand;
  const brandEmoji = BRAND_EMOJIS[brandData.brand] ?? '🏓';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Paddle Brand</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroCard}>
          <Text style={s.heroEmoji}>{brandEmoji}</Text>
          <Text style={s.heroName}>{brandName}</Text>
          <Text style={s.heroLevel}>Support Level {brandData.supportLevel}</Text>

          {/* XP bar */}
          <View style={s.xpBarWrap}>
            <View style={[s.xpBarFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={s.xpText}>
            {brandData.brandXp.toLocaleString()} XP · {toNext} to Level {brandData.supportLevel + 1}
          </Text>
        </View>

        {/* Bonus rows */}
        <Text style={s.sectionLabel}>ACTIVE BONUSES</Text>
        <View style={s.bonusCard}>
          <View style={s.bonusRow}>
            <Text style={s.bonusIcon}>⚔️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bonusTitle}>PvP Reward</Text>
              <Text style={s.bonusSub}>Extra loot from battles</Text>
            </View>
            <Text style={[s.bonusValue, { color: BLUE }]}>+{brandData.bonuses.pvpRewardPct}%</Text>
          </View>
          <View style={[s.bonusRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
            <Text style={s.bonusIcon}>🗺</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bonusTitle}>Territory INF</Text>
              <Text style={s.bonusSub}>Influence at captured venues</Text>
            </View>
            <Text style={[s.bonusValue, { color: PURPLE }]}>+{brandData.bonuses.territoryInfPct}%</Text>
          </View>
        </View>

        {/* Wallet */}
        <Text style={s.sectionLabel}>BRAND TOKENS</Text>
        <View style={s.walletCard}>
          <View style={[s.tokenIcon, { backgroundColor: PURPLE }]}>
            <Text style={s.tokenLetter}>★</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.walletAmount}>{brandTokens.toLocaleString()}</Text>
            <Text style={s.walletSub}>Tokens auto-apply as Brand XP when you open chests</Text>
          </View>
        </View>

        {/* Switch */}
        <TouchableOpacity style={s.switchBtn} onPress={onSwitchBrand} activeOpacity={0.7}>
          <Text style={s.switchText}>Switch Paddle Brand</Text>
          <Text style={s.switchSub}>Resets Level + XP, tokens carry over</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  heroCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 18, padding: 24, alignItems: 'center',
  },
  heroEmoji: { fontSize: 48, marginBottom: 8 },
  heroName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 2 },
  heroLevel: { fontSize: 14, color: PURPLE, fontWeight: '700', marginBottom: 16 },
  xpBarWrap: {
    width: '100%', height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden', marginBottom: 8,
  },
  xpBarFill: { height: 6, backgroundColor: PURPLE, borderRadius: 3 },
  xpText: { fontSize: 12, color: '#71717a', fontWeight: '600' },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 },
  bonusCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden',
  },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  bonusIcon: { fontSize: 20 },
  bonusTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  bonusSub: { fontSize: 11, color: '#71717a', marginTop: 1 },
  bonusValue: { fontSize: 18, fontWeight: '900' },
  walletCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  tokenIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tokenLetter: { fontSize: 18, fontWeight: '900', color: '#fff' },
  walletAmount: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 2 },
  walletSub: { fontSize: 11, color: '#71717a', lineHeight: 16 },
  switchBtn: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 14, padding: 16, alignItems: 'center',
  },
  switchText: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  switchSub: { fontSize: 11, color: '#71717a', marginTop: 2 },
});
