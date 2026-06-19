import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../stores/authStore';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const BLUE = '#60a5fa';

interface Props {
  squadId: string;
  squadName: string;
  squadEmoji: string;
  totalClubTokens: number;
  onConfirmExtra?: () => Promise<void>;
  onDone: () => void;
}

export function TokenSplitScreen({ squadId, squadName, squadEmoji, totalClubTokens, onConfirmExtra, onDone }: Props) {
  const insets = useSafeAreaInsets();
  // Default: 50% donate
  const [donateRatio, setDonateRatio] = useState(0.5);
  const [confirming, setConfirming] = useState(false);

  const donateAmount = Math.floor(totalClubTokens * donateRatio);
  const keepAmount = totalClubTokens - donateAmount;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      if (donateAmount > 0) {
        await useAuthStore.getState().authedFetch('/api/wallet/donate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ squadId, clubTokens: donateAmount }),
        });
      }
      if (onConfirmExtra) await onConfirmExtra();
      onDone();
    } catch {
      // Silent — tokens stay in wallet, player can donate later
      onDone();
    }
    setConfirming(false);
  };

  const pct = Math.round(donateRatio * 100);

  return (
    <View style={[s.container, { paddingBottom: insets.bottom + 20 }]}>
      <View style={[s.header, { paddingTop: insets.top + 20 }]}>
        <Text style={s.title}>Split your Club Tokens</Text>
        <Text style={s.sub}>Donate some to boost {squadEmoji} {squadName}'s XP, or keep them for yourself.</Text>
      </View>

      <View style={s.body}>
        {/* Visual split */}
        <View style={s.splitCard}>
          <View style={s.splitRow}>
            <View style={s.splitCol}>
              <View style={[s.tokenIcon, { backgroundColor: BLUE }]}>
                <Text style={s.tokenLetter}>C</Text>
              </View>
              <Text style={s.splitAmount}>{keepAmount}</Text>
              <Text style={s.splitLabel}>You keep</Text>
            </View>
            <View style={s.divider} />
            <View style={s.splitCol}>
              <Text style={{ fontSize: 28, marginBottom: 4 }}>{squadEmoji}</Text>
              <Text style={[s.splitAmount, { color: LIME }]}>{donateAmount}</Text>
              <Text style={s.splitLabel}>Donate to Squad</Text>
            </View>
          </View>

          <Text style={s.splitPct}>{pct}% donated</Text>

          <Slider
            style={s.slider}
            minimumValue={0}
            maximumValue={1}
            step={0.05}
            value={donateRatio}
            onValueChange={setDonateRatio}
            minimumTrackTintColor={LIME}
            maximumTrackTintColor="#2a2a2a"
            thumbTintColor={LIME}
          />

          <View style={s.sliderLabels}>
            <Text style={s.sliderLabel}>Keep all</Text>
            <Text style={s.sliderLabel}>Donate all</Text>
          </View>
        </View>

        <View style={s.infoCard}>
          <Text style={s.infoText}>
            💡 Every Club Token donated gives your Squad 1 XP. Tokens kept stay in your wallet for future use.
          </Text>
        </View>
      </View>

      <View style={s.bottom}>
        <TouchableOpacity onPress={handleConfirm} disabled={confirming} activeOpacity={0.8}>
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.confirmGrad}>
            {confirming ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.confirmText}>
                {donateAmount > 0
                  ? `Donate ${donateAmount} · Keep ${keepAmount} →`
                  : `Keep all ${totalClubTokens} tokens →`}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 24, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 8 },
  sub: { fontSize: 14, color: '#71717a', lineHeight: 20 },
  body: { flex: 1, paddingHorizontal: 24, gap: 14 },
  splitCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18, padding: 20,
  },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  splitCol: { flex: 1, alignItems: 'center', gap: 4 },
  divider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.07)' },
  tokenIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tokenLetter: { fontSize: 16, fontWeight: '900', color: '#fff' },
  splitAmount: { fontSize: 28, fontWeight: '900', color: '#fff' },
  splitLabel: { fontSize: 12, color: '#71717a', fontWeight: '600' },
  splitPct: { fontSize: 13, fontWeight: '800', color: '#a1a1aa', textAlign: 'center', marginBottom: 12 },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -4 },
  sliderLabel: { fontSize: 11, color: '#52525b', fontWeight: '600' },
  infoCard: {
    backgroundColor: '#111',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, padding: 14,
  },
  infoText: { fontSize: 13, color: '#71717a', lineHeight: 20 },
  bottom: { paddingHorizontal: 24, paddingTop: 16 },
  confirmGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#365314' },
  confirmText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
