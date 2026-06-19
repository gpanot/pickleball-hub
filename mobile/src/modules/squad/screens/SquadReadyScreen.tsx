import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { SquadScreenHeader } from '../components/SquadScreenHeader';
import { getNearbySquads } from '../api';
import type { NearbySquad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const PENDING_INVITE_KEY = 'squadd_pending_invite';

interface PendingInvite {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
  inviterName?: string;
  code?: string;
}

interface Props {
  onCreateSquad: () => void;
  onBrowseSquads: () => void;
  onAcceptInvite: (code: string) => void;
  onJoinSquad: (code: string) => void;
  onBack: () => void;
}

function CompactSquadCard({ squad, onJoin }: { squad: NearbySquad; onJoin?: (code: string) => void }) {
  const isFull = squad.openSpots === 0;
  const duprLabel = squad.avgDupr != null ? `DUPR avg ${squad.avgDupr}` : 'DUPR —';

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={isFull ? 1 : 0.8}
      onPress={() => !isFull && squad.code && onJoin?.(squad.code)}
      disabled={isFull || !squad.code}
    >
      <Text style={s.cardEmoji}>{squad.emoji}</Text>
      <View style={s.cardBody}>
        <Text style={s.cardName}>{squad.name.toUpperCase()}</Text>
        <Text style={s.cardMeta}>
          {squad.memberCount}/{squad.maxMembers} · {duprLabel} · {squad.sessions} sessions
        </Text>
      </View>
      <View style={s.cardRight}>
        {isFull ? (
          <Text style={s.fullLabel}>Full</Text>
        ) : (
          <>
            <Text style={s.xpValue}>{squad.totalXp.toLocaleString()}</Text>
            <TouchableOpacity
              style={s.joinPill}
              onPress={() => squad.code && onJoin?.(squad.code)}
              activeOpacity={0.7}
            >
              <Text style={s.joinPillText}>Join</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function SquadReadyScreen({
  onCreateSquad, onBrowseSquads, onAcceptInvite, onJoinSquad, onBack,
}: Props) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<PendingInvite | null>(null);
  const [nearby, setNearby] = useState<NearbySquad[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY);
        if (raw) setPending(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingNearby(true);
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const data = await getNearbySquads(
          loc.coords.latitude,
          loc.coords.longitude,
          10,
        );
        setNearby(data.squads.slice(0, 3));
      } catch {
        setNearby([]);
      } finally {
        setLoadingNearby(false);
      }
    })();
  }, []);

  const handleDeclinePending = async () => {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    setPending(null);
  };

  return (
    <View style={s.container}>
      <SquadScreenHeader title="SQUADD" insetTop={insets.top} onBack={onBack} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {pending && (
          <View style={s.pendingCard}>
            <Text style={s.pendingLabel}>Squad invite waiting</Text>
            <View style={s.pendingRow}>
              <Text style={{ fontSize: 36 }}>{pending.emoji}</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.pendingName}>{pending.name}</Text>
                <Text style={s.pendingMeta}>
                  {pending.memberCount} members{pending.inviterName ? ` · ${pending.inviterName} invited you` : ''}
                </Text>
              </View>
            </View>
            <View style={s.pendingActions}>
              <TouchableOpacity
                style={s.pendingAcceptBtn}
                onPress={() => pending.code && onAcceptInvite(pending.code)}
                activeOpacity={0.8}
              >
                <LinearGradient colors={[LIME, LIME_DARK]} style={s.pendingAcceptGrad}>
                  <Text style={s.pendingAcceptText}>Accept invite →</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={s.pendingDeclineBtn} onPress={handleDeclinePending}>
                <Text style={s.pendingDeclineText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={s.hero}>
          <View style={s.emojiRow}>
            <Text style={{ fontSize: 48 }}>🦁</Text>
            <Text style={{ fontSize: 48 }}>🐉</Text>
            <Text style={{ fontSize: 48 }}>🦅</Text>
          </View>
          <Text style={s.headline}>Build your crew.</Text>
          <Text style={s.subtitle}>
            Play together. Every session earns chest rewards for your whole squad.
          </Text>
        </View>

        <TouchableOpacity style={s.primaryBtn} onPress={onCreateSquad} activeOpacity={0.8}>
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.primaryGrad}>
            <Text style={s.primaryText}>🦁 Create your squad</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={onBrowseSquads} activeOpacity={0.7}>
          <Text style={s.secondaryText}>Browse squads near me</Text>
        </TouchableOpacity>

        {/* Squads near you */}
        {(loadingNearby || nearby.length > 0) && (
          <View style={s.nearbySection}>
            <Text style={s.nearbyTitle}>SQUADS NEAR YOU</Text>
            {loadingNearby ? (
              <ActivityIndicator color={LIME} style={{ marginVertical: 16 }} />
            ) : (
              nearby.map((sq) => (
                <CompactSquadCard key={sq.id} squad={sq} onJoin={onJoinSquad} />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingBottom: 100 },
  hero: { alignItems: 'center', paddingVertical: 24 },
  emojiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  headline: {
    fontFamily: BANGERS, fontSize: 32, color: GOLD,
    textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0,
    marginBottom: 8,
  },
  subtitle: { fontSize: 14, color: '#a1a1aa', lineHeight: 22, textAlign: 'center' },
  primaryBtn: { marginBottom: 10 },
  primaryGrad: {
    paddingVertical: 15, borderRadius: 16, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: '#365314',
  },
  primaryText: { fontSize: 16, fontWeight: '900', color: '#000' },
  secondaryBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center', marginBottom: 24,
  },
  secondaryText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
  nearbySection: { marginTop: 8 },
  nearbyTitle: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, color: '#52525b', marginBottom: 12,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  cardEmoji: { fontSize: 32 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontFamily: BANGERS, fontSize: 18, color: '#fff', letterSpacing: 0.5 },
  cardMeta: { fontSize: 11, color: '#71717a', marginTop: 4 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  xpValue: { fontSize: 14, fontWeight: '900', color: GOLD },
  fullLabel: { fontSize: 12, fontWeight: '700', color: '#52525b' },
  joinPill: {
    borderWidth: 1.5, borderColor: LIME, borderRadius: 100,
    paddingHorizontal: 14, paddingVertical: 5,
    backgroundColor: 'rgba(163,230,53,0.13)',
  },
  joinPillText: { fontSize: 12, fontWeight: '800', color: LIME },
  pendingCard: {
    backgroundColor: 'rgba(26,26,10,1)', borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.25)', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  pendingLabel: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, color: GOLD, marginBottom: 10,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  pendingName: { fontFamily: BANGERS, fontSize: 20, color: GOLD },
  pendingMeta: { fontSize: 12, color: '#a1a1aa', marginTop: 2 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  pendingAcceptBtn: { flex: 1 },
  pendingAcceptGrad: { paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  pendingAcceptText: { fontSize: 14, fontWeight: '900', color: '#000' },
  pendingDeclineBtn: {
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', justifyContent: 'center',
  },
  pendingDeclineText: { fontSize: 13, fontWeight: '700', color: '#52525b' },
});
