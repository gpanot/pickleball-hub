import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLeaderboard } from '../api';
import { SquadBackButton } from '../components/SquadBackButton';
import type { LeaderboardData, LeaderboardSquad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';

interface Props {
  mySquadId?: string | null;
  onBack: () => void;
}

export function CityLeaderboardScreen({ mySquadId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const result = await getLeaderboard('hcm');
      setData(result);
    } catch (e) {
      console.error('Leaderboard fetch error:', e);
      setError('Could not load leaderboard. Pull to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  if (loading) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <SquadBackButton onPress={onBack} />
          <Text style={s.topTitle}>Leaderboard</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={s.loadingWrap}><ActivityIndicator color={GOLD} /></View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <View style={s.topBar}>
          <SquadBackButton onPress={onBack} />
          <Text style={s.topTitle}>Leaderboard</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={s.loadingWrap}>
          <Text style={s.errorText}>{error ?? 'No data'}</Text>
          <TouchableOpacity onPress={fetchData} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const daysToReset = Math.max(0, Math.ceil((new Date(data.resetDate).getTime() - Date.now()) / 86400000));
  const mySquadEntry = data.squads.find(s => s.squadId === mySquadId);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIME} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Hero */}
        <View style={s.hero}>
          <SquadBackButton onPress={onBack} style={s.heroBack} />
          <Text style={s.cityTitle}>{data.city.toUpperCase()}</Text>
          <Text style={s.citySub}>Monthly squad leaderboard · resets in {daysToReset} days</Text>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statVal}>{data.totalSquads}</Text>
              <Text style={s.statLabel}>SQUADS</Text>
            </View>
            <View style={[s.stat, s.statBorder]}>
              <Text style={s.statVal}>{data.totalPlayers}</Text>
              <Text style={s.statLabel}>PLAYERS</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statVal}>{data.totalSessions}</Text>
              <Text style={s.statLabel}>SESSIONS</Text>
            </View>
          </View>
          <View style={s.resetPill}>
            <Text style={s.resetText}>🔄 Resets monthly · rank badge persists</Text>
          </View>
        </View>

        {/* My squad banner */}
        {mySquadEntry && (
          <View style={s.mySquadBanner}>
            <View style={{ flex: 1 }}>
              <Text style={s.mySquadName}>{mySquadEntry.emoji} {mySquadEntry.name} · Your squad</Text>
              <Text style={s.mySquadSub}>+{mySquadEntry.xp} XP this month · climbing</Text>
            </View>
            <Text style={s.mySquadRank}>#{mySquadEntry.rank}</Text>
          </View>
        )}

        {/* Top squads */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>TOP SQUADS THIS MONTH</Text>
          {data.squads.map((squad, i) => (
            <SquadRow key={squad.squadId} squad={squad} isMe={squad.squadId === mySquadId} />
          ))}
        </View>

        {/* XP sources */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>HOW XP IS EARNED</Text>
          <View style={s.xpCard}>
            <XpSourceRow label="Member plays a session" xp="+80 XP" />
            <XpSourceRow label="Member checks in" xp="+60 XP" />
            <XpSourceRow label="Earner opens chest" xp="+30–80 XP" />
            <XpSourceRow label="Contributor opens chest" xp="+10–30 XP" />
            <XpSourceRow label="Daily streak maintained" xp="+20 XP" />
            <XpSourceRow label="New member joins (first time)" xp="+40 XP" last />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SquadRow({ squad, isMe }: { squad: LeaderboardSquad; isMe: boolean }) {
  const isTop3 = squad.rank <= 3;
  return (
    <View style={[s.lbItem, isMe && s.lbItemSelf]}>
      <Text style={[s.lbRank, isTop3 && s.lbRankTop]}>
        {String(squad.rank).padStart(2, '0')}
      </Text>
      <Text style={s.lbEmoji}>{squad.emoji}</Text>
      <View style={s.lbInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.lbName}>{squad.name.toUpperCase()}</Text>
          {isMe && (
            <View style={s.youBadge}><Text style={s.youText}>You</Text></View>
          )}
        </View>
        <Text style={s.lbSub}>{squad.memberCount} members · {squad.sessionCount} sessions</Text>
      </View>
      <Text style={s.lbXp}>{squad.xp.toLocaleString()}</Text>
    </View>
  );
}

function XpSourceRow({ label, xp, last }: { label: string; xp: string; last?: boolean }) {
  return (
    <View style={[s.xpRow, !last && s.xpRowBorder]}>
      <Text style={s.xpLabel}>{label}</Text>
      <Text style={s.xpValue}>{xp}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  errorText: { fontSize: 14, color: '#a1a1aa', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: 'rgba(250,204,21,0.15)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10,
  },
  retryText: { fontSize: 14, fontWeight: '800', color: GOLD },
  hero: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(250,204,21,0.15)',
    alignItems: 'center',
  },
  heroBack: { position: 'absolute', top: 20, left: 20 },
  cityTitle: { fontFamily: BANGERS, fontSize: 32, color: GOLD, textShadowColor: '#000', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0, marginBottom: 4 },
  citySub: { fontSize: 13, color: '#a1a1aa', marginBottom: 16 },
  statsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, overflow: 'hidden', width: '100%', marginBottom: 12,
  },
  stat: { flex: 1, padding: 12, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statVal: { fontSize: 18, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  resetPill: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
  },
  resetText: { fontSize: 11, color: '#52525b', fontWeight: '700' },
  mySquadBanner: {
    margin: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(250,204,21,0.08)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)',
    borderRadius: 16, padding: 14,
  },
  mySquadName: { fontSize: 14, fontWeight: '800', color: '#fff' },
  mySquadSub: { fontSize: 12, color: '#a1a1aa', marginTop: 2 },
  mySquadRank: { fontFamily: BANGERS, fontSize: 28, color: GOLD },
  section: { paddingHorizontal: 16, marginTop: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  lbItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: '#1e1e1e', borderRadius: 10,
    marginBottom: 8,
  },
  lbItemSelf: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)',
  },
  lbRank: { fontSize: 13, fontWeight: '900', color: '#52525b', width: 22, textAlign: 'center', fontStyle: 'italic' },
  lbRankTop: { color: GOLD },
  lbEmoji: { fontSize: 20 },
  lbInfo: { flex: 1 },
  lbName: { fontSize: 13, fontWeight: '800', color: '#fff' },
  lbSub: { fontSize: 11, color: '#a1a1aa', marginTop: 2 },
  lbXp: { fontSize: 13, fontWeight: '900', color: GOLD },
  youBadge: {
    backgroundColor: 'rgba(250,204,21,0.15)',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  youText: { fontSize: 9, fontWeight: '800', color: GOLD },
  xpCard: {
    backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 16,
  },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  xpRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  xpLabel: { fontSize: 13, color: '#a1a1aa' },
  xpValue: { fontSize: 13, fontWeight: '800', color: LIME },
});
