import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../stores/authStore';
import { ChestOpenAnimation } from '../components/ChestOpenAnimation';
import type { WelcomeChestResult } from '../types';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const GOLD = '#facc15';

interface Props {
  squadName: string;
  onOpened: (result: WelcomeChestResult) => void;
}

type Phase = 'prompt' | 'opening' | 'opened' | 'error';

export function WelcomeChestScreen({ squadName, onOpened }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>('prompt');
  const [result, setResult] = useState<WelcomeChestResult | null>(null);

  const handleOpen = async () => {
    setPhase('opening');
    try {
      const res = await useAuthStore.getState().authedFetch('/api/onboarding/welcome-chest', {
        method: 'POST',
      });
      if (!res.ok) {
        // 409 means already claimed — treat as success and move on
        if (res.status === 409) {
          onOpened({ clubTokensAwarded: 0, brandTokensAwarded: 0, xpAwarded: 0 });
          return;
        }
        setPhase('error');
        return;
      }
      const data: WelcomeChestResult = await res.json();
      setResult(data);
      setPhase('opened');
    } catch {
      setPhase('error');
    }
  };

  if (phase === 'opened' && result) {
    return (
      <View style={[s.container, { paddingBottom: insets.bottom + 20 }]}>
        <ChestOpenAnimation
          clubTokensAwarded={result.clubTokensAwarded}
          brandTokensAwarded={result.brandTokensAwarded}
          xpAwarded={result.xpAwarded}
          squadName={squadName}
        />
        <View style={s.bottom}>
          <TouchableOpacity style={s.doneBtn} onPress={() => onOpened(result)} activeOpacity={0.8}>
            <Text style={s.doneBtnText}>Split my Club Tokens →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'opening') {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator color={LIME} size="large" />
        <Text style={s.loadingText}>Opening chest…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={[s.container, s.centered]}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>⚠️</Text>
        <Text style={s.errorText}>Something went wrong</Text>
        <TouchableOpacity onPress={handleOpen} style={s.retryBtn}>
          <Text style={s.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingBottom: insets.bottom + 20 }]}>
      <View style={[s.content, { paddingTop: insets.top + 24 }]}>
        <Text style={s.emoji}>🎁</Text>
        <Text style={s.title}>Welcome Chest</Text>
        <Text style={s.sub}>
          Your Squad is set up. Open this one-time chest to see your first Club Tokens and Brand Tokens.
        </Text>

        <View style={s.previewRow}>
          <View style={s.previewCard}>
            <View style={[s.tokenIcon, { backgroundColor: '#60a5fa' }]}>
              <Text style={s.tokenLetter}>C</Text>
            </View>
            <Text style={s.previewAmount}>150</Text>
            <Text style={s.previewLabel}>Club Tokens</Text>
          </View>
          <View style={s.previewCard}>
            <View style={[s.tokenIcon, { backgroundColor: '#a78bfa' }]}>
              <Text style={s.tokenLetter}>★</Text>
            </View>
            <Text style={s.previewAmount}>50</Text>
            <Text style={s.previewLabel}>Brand Tokens</Text>
          </View>
          <View style={s.previewCard}>
            <Text style={{ fontSize: 22, marginBottom: 4 }}>⚡</Text>
            <Text style={s.previewAmount}>200</Text>
            <Text style={s.previewLabel}>Squad XP</Text>
          </View>
        </View>
      </View>

      <View style={s.bottom}>
        <TouchableOpacity style={s.openBtn} onPress={handleOpen} activeOpacity={0.85}>
          <Text style={s.openBtnText}>Open Welcome Chest 🎁</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050a02' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emoji: { fontSize: 64, marginBottom: 16 },
  title: {
    fontSize: 28, fontWeight: '900', color: '#facc15',
    textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0,
    marginBottom: 12, textAlign: 'center',
  },
  sub: { fontSize: 14, color: '#a1a1aa', lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  previewRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14, padding: 14, alignItems: 'center', flex: 1,
  },
  tokenIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  tokenLetter: { fontSize: 16, fontWeight: '900', color: '#fff' },
  previewAmount: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 2 },
  previewLabel: { fontSize: 10, color: '#71717a', fontWeight: '700', textAlign: 'center' },
  bottom: { paddingHorizontal: 24, paddingBottom: 8 },
  openBtn: {
    backgroundColor: GOLD,
    borderBottomWidth: 3, borderBottomColor: '#92400e',
    borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  openBtnText: { fontSize: 17, fontWeight: '900', color: '#000' },
  doneBtn: {
    backgroundColor: LIME,
    borderBottomWidth: 3, borderBottomColor: '#365314',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
  loadingText: { fontSize: 14, color: '#a1a1aa', marginTop: 16 },
  errorText: { fontSize: 16, fontWeight: '700', color: '#a1a1aa', textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24 },
  retryText: { fontSize: 14, color: LIME, fontWeight: '700' },
});
