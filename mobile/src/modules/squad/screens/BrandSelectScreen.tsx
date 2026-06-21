import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../stores/authStore';
import { SquadScreenHeader } from '../components/SquadScreenHeader';
import type { PlayerBrandData } from '../types';

const LIME = '#a3e635';

const BRAND_LOGOS: Record<string, ReturnType<typeof require>> = {
  joola:     require('../../../../assets/images/Brand_logo/joola_square_logo.png'),
  selkirk:   require('../../../../assets/images/Brand_logo/selkirk_square_logo.png'),
  gearbox:   require('../../../../assets/images/Brand_logo/gearbox_square_logo.png'),
  six_zero:  require('../../../../assets/images/Brand_logo/six_zero_square_logo.png'),
  crbn:      require('../../../../assets/images/Brand_logo/crbn_square_logo.png'),
  vatic_pro: require('../../../../assets/images/Brand_logo/vatic_square_logo.jpeg'),
  facolos:   require('../../../../assets/images/Brand_logo/focolos_square_logo.png'),
  sypik:     require('../../../../assets/images/Brand_logo/sypic_square_logo.png'),
};

const BRANDS: Array<{
  key: string;
  name: string;
  pvpRewardPct: number;
  territoryInfPct: number;
  label: string;
}> = [
  { key: 'joola',     name: 'JOOLA',     pvpRewardPct: 5, territoryInfPct: 3, label: 'Aggressive — fast attacks' },
  { key: 'selkirk',   name: 'Selkirk',   pvpRewardPct: 3, territoryInfPct: 5, label: 'Balanced — reliable defense' },
  { key: 'gearbox',   name: 'Gearbox',   pvpRewardPct: 4, territoryInfPct: 4, label: 'Consistency — streak bonuses' },
  { key: 'six_zero',  name: 'Six Zero',  pvpRewardPct: 2, territoryInfPct: 6, label: 'Team play — Pod synergy' },
  { key: 'crbn',      name: 'CRBN',      pvpRewardPct: 7, territoryInfPct: 1, label: 'High risk — power spikes' },
  { key: 'vatic_pro', name: 'Vatic Pro', pvpRewardPct: 4, territoryInfPct: 4, label: 'Underdog — efficient leveling' },
  { key: 'facolos',   name: 'Facolos',   pvpRewardPct: 3, territoryInfPct: 6, label: 'Precision — control & placement' },
  { key: 'sypik',     name: 'Sypik',     pvpRewardPct: 6, territoryInfPct: 2, label: 'Dynamic — momentum builder' },
];

interface Props {
  onSelected: (brand: PlayerBrandData) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export function BrandSelectScreen({ onSelected, onSkip, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);

  const handleSelect = async (brandKey: string) => {
    if (confirming) return;
    setConfirming(true);
    try {
      const res = await useAuthStore.getState().authedFetch('/api/brand/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: brandKey }),
      });
      if (!res.ok) {
        setConfirming(false);
        return;
      }
      const data: PlayerBrandData = await res.json();
      onSelected(data);
    } catch {
      setConfirming(false);
    }
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
            style={s.card}
            onPress={() => handleSelect(brand.key)}
            disabled={confirming}
            activeOpacity={0.75}
          >
            <Image source={BRAND_LOGOS[brand.key]} style={s.brandLogo} />
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
            {confirming && (
              <ActivityIndicator size="small" color={LIME} />
            )}
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={s.skipBtn} onPress={onSkip} activeOpacity={0.7} disabled={confirming}>
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
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#141414',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 16, marginBottom: 10,
  },
  brandLogo: { width: 72, height: 72, borderRadius: 12 },
  brandName: { fontSize: 16, fontWeight: '900', color: '#fff', marginBottom: 2 },
  brandLabel: { fontSize: 12, color: '#a1a1aa', marginBottom: 8 },
  bonusRow: { flexDirection: 'row', gap: 6 },
  bonusPill: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3,
  },
  bonusText: { fontSize: 11, fontWeight: '700', color: '#d4d4d8' },
  skipBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: '#52525b', fontWeight: '600' },
});
