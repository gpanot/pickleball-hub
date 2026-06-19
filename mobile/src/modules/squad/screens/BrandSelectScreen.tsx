import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../stores/authStore';
import { SquadScreenHeader } from '../components/SquadScreenHeader';
import type { PlayerBrandData } from '../types';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

const BRANDS: Array<{
  key: string;
  name: string;
  emoji: string;
  pvpRewardPct: number;
  territoryInfPct: number;
  label: string;
}> = [
  { key: 'joola',     name: 'JOOLA',     emoji: '⚡', pvpRewardPct: 5, territoryInfPct: 3, label: 'Aggressive — fast attacks' },
  { key: 'selkirk',   name: 'Selkirk',   emoji: '🛡', pvpRewardPct: 3, territoryInfPct: 5, label: 'Balanced — reliable defense' },
  { key: 'gearbox',   name: 'Gearbox',   emoji: '🔁', pvpRewardPct: 4, territoryInfPct: 4, label: 'Consistency — streak bonuses' },
  { key: 'six_zero',  name: 'Six Zero',  emoji: '🤝', pvpRewardPct: 2, territoryInfPct: 6, label: 'Team play — Pod synergy' },
  { key: 'crbn',      name: 'CRBN',      emoji: '💥', pvpRewardPct: 7, territoryInfPct: 1, label: 'High risk — power spikes' },
  { key: 'vatic_pro', name: 'Vatic Pro', emoji: '🌱', pvpRewardPct: 4, territoryInfPct: 4, label: 'Underdog — efficient leveling' },
];

interface Props {
  onSelected: (brand: PlayerBrandData) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export function BrandSelectScreen({ onSelected, onSkip, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    if (!selected || confirming) return;
    setConfirming(true);
    try {
      const res = await useAuthStore.getState().authedFetch('/api/brand/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: selected }),
      });
      if (!res.ok) return;
      const data: PlayerBrandData = await res.json();
      onSelected(data);
    } catch {}
    setConfirming(false);
  };

  return (
    <View style={s.container}>
      <SquadScreenHeader title="PADDLE BRAND" insetTop={insets.top} onBack={onBack} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>Choose your paddle brand</Text>
        <Text style={s.sub}>
          Your brand gives passive bonuses to battles and territory. You can switch later, but it resets your Brand Level.
        </Text>

        {BRANDS.map((brand) => (
          <TouchableOpacity
            key={brand.key}
            style={[s.card, selected === brand.key && s.cardSelected]}
            onPress={() => setSelected(brand.key)}
            activeOpacity={0.8}
          >
            <Text style={s.brandEmoji}>{brand.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.brandName}>{brand.name}</Text>
              <Text style={s.brandLabel}>{brand.label}</Text>
              <View style={s.bonusRow}>
                <View style={s.bonusPill}>
                  <Text style={s.bonusText}>⚔️ +{brand.pvpRewardPct}% PvP</Text>
                </View>
                <View style={s.bonusPill}>
                  <Text style={s.bonusText}>🗺 +{brand.territoryInfPct}% INF</Text>
                </View>
              </View>
            </View>
            {selected === brand.key && (
              <View style={s.checkCircle}>
                <Text style={{ color: '#000', fontSize: 14, fontWeight: '900' }}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[s.ctaWrap, { opacity: selected ? 1 : 0.4 }]}
          onPress={handleConfirm}
          disabled={!selected || confirming}
          activeOpacity={0.8}
        >
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGrad}>
            {confirming ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.ctaText}>
                {selected ? `Choose ${BRANDS.find((b) => b.key === selected)?.name ?? ''} →` : 'Select a brand →'}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={s.skipBtn} onPress={onSkip} activeOpacity={0.7}>
          <Text style={s.skipText}>Skip — choose later</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingBottom: 60 },
  heading: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 6 },
  sub: { fontSize: 13, color: '#71717a', lineHeight: 20, marginBottom: 24 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: '#141414',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 16, marginBottom: 10,
  },
  cardSelected: { borderColor: LIME, backgroundColor: 'rgba(163,230,53,0.06)' },
  brandEmoji: { fontSize: 28, marginTop: 2 },
  brandName: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 2 },
  brandLabel: { fontSize: 12, color: '#a1a1aa', marginBottom: 8 },
  bonusRow: { flexDirection: 'row', gap: 6 },
  bonusPill: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3,
  },
  bonusText: { fontSize: 11, fontWeight: '700', color: '#d4d4d8' },
  checkCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: LIME, alignItems: 'center', justifyContent: 'center',
  },
  ctaWrap: { marginTop: 20 },
  ctaGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#365314' },
  ctaText: { fontSize: 16, fontWeight: '900', color: '#000' },
  skipBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: '#52525b', fontWeight: '600' },
});
