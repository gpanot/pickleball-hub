import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../stores/authStore';
import { SquadScreenHeader } from '../components/SquadScreenHeader';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';

interface Props {
  onNavigateToCircle: () => void;
  onBack: () => void;
  followsThreshold: number;
}

export function SquadGateScreen({ onNavigateToCircle, onBack, followsThreshold }: Props) {
  const insets = useSafeAreaInsets();
  const [followCount, setFollowCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await useAuthStore.getState().authedFetch('/api/follows');
        if (res.ok) {
          const data = await res.json();
          // API returns a plain array
          setFollowCount(Array.isArray(data) ? data.length : 0);
        }
      } catch {}
    })();
  }, []);

  const remaining = Math.max(0, followsThreshold - followCount);
  const progressPct = Math.min(100, (followCount / followsThreshold) * 100);

  return (
    <View style={s.container}>
      <SquadScreenHeader title="SQUADD" insetTop={insets.top} onBack={onBack} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 56, textAlign: 'center', marginBottom: 16 }}>🛡️</Text>
        <Text style={s.headline}>Squads unlock soon</Text>
        <Text style={s.subtitle}>
          Follow more players to unlock squad creation. Squads form from people you already play with.
        </Text>

        {/* Progress card */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Follows needed</Text>
            <Text style={s.cardCount}>{followCount} / {followsThreshold}</Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={s.cardHint}>
            {remaining > 0
              ? `Follow ${remaining} more player${remaining > 1 ? 's' : ''} to create or join a squad`
              : 'You can now create a squad!'}
          </Text>
        </View>

        <TouchableOpacity style={s.secondaryBtn} onPress={onNavigateToCircle} activeOpacity={0.7}>
          <Text style={s.secondaryBtnText}>Find players to follow →</Text>
        </TouchableOpacity>

        {/* Nearby squads placeholder */}
        <Text style={s.sectionLabel}>Squads near you</Text>
        <View style={s.emptyCard}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
          <Text style={s.emptyText}>No squads nearby yet</Text>
          <Text style={s.emptyHint}>Be the first to create one in your area</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingBottom: 100 },
  headline: { fontFamily: BANGERS, fontSize: 28, color: '#a1a1aa', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#52525b', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  cardCount: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
  progressTrack: { height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: GOLD, backgroundGradient: `linear-gradient(to right, ${GOLD_DARK}, ${GOLD})` } as any,
  cardHint: { fontSize: 12, color: '#52525b', marginTop: 8 },
  secondaryBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginBottom: 24 },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  emptyCard: { backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '700', color: '#a1a1aa' },
  emptyHint: { fontSize: 12, color: '#52525b', marginTop: 4 },
});
