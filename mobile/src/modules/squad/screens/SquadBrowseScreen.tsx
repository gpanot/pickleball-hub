import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { getNearbySquads } from '../api';
import { SquadBackButton } from '../components/SquadBackButton';
import type { NearbySquad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const LIME_DIM = 'rgba(163,230,53,0.13)';

type FilterKey = 'all' | 'open' | 'dupr' | 'near';

interface Props {
  onJoinSquad: (code: string) => void;
  onBack: () => void;
}

function distanceBucket(km: number): string {
  if (km < 2) return 'NEARBY · UNDER 2 KM';
  if (km < 5) return '2 – 5 KM';
  if (km < 15) return '5 – 15 KM';
  if (km < 50) return '15 – 50 KM';
  return '50 – 100 KM';
}

const BUCKET_ORDER = [
  'NEARBY · UNDER 2 KM',
  '2 – 5 KM',
  '5 – 15 KM',
  '15 – 50 KM',
  '50 – 100 KM',
];

export function SquadBrowseScreen({ onJoinSquad, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [squads, setSquads] = useState<NearbySquad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cityLabel, setCityLabel] = useState('Your area');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSquads = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const req = await Location.requestForegroundPermissionsAsync();
        if (req.status !== 'granted') return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geo?.city) setCityLabel(geo.city);
        else if (geo?.subregion) setCityLabel(geo.subregion);
      } catch {}
      const data = await getNearbySquads(
        loc.coords.latitude,
        loc.coords.longitude,
        100,
      );
      setSquads(data.squads);
    } catch {
      setSquads([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSquads();
      setLoading(false);
    })();
  }, [fetchSquads]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSquads();
    setRefreshing(false);
  }, [fetchSquads]);

  const filtered = useMemo(() => {
    let list = squads;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    if (activeFilter === 'open') list = list.filter((s) => s.openSpots > 0);
    if (activeFilter === 'dupr') list = list.filter((s) => (s.avgDupr ?? 0) >= 3.5);
    if (activeFilter === 'near') list = list.filter((s) => s.distance < 5);
    return list;
  }, [squads, search, activeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, NearbySquad[]>();
    for (const sq of filtered) {
      const bucket = distanceBucket(sq.distance);
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(sq);
    }
    return BUCKET_ORDER
      .filter((b) => map.has(b))
      .map((b) => ({ label: b, squads: map.get(b)! }));
  }, [filtered]);

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open spots' },
    { key: 'dupr', label: 'DUPR 3.5+' },
    { key: 'near', label: 'Under 5 km' },
  ];

  const renderSquadCard = (sq: NearbySquad) => {
    const isFull = sq.openSpots === 0;
    const expanded = expandedId === sq.id;
    const duprLabel = sq.avgDupr != null ? sq.avgDupr.toFixed(1) : '—';

    return (
      <View key={sq.id} style={s.squadCard}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setExpandedId(expanded ? null : sq.id)}
        >
          <View style={s.squadHeader}>
            <Text style={s.squadEmoji}>{sq.emoji}</Text>
            <View style={s.squadHeaderBody}>
              <View style={s.squadNameRow}>
                <Text style={s.squadName}>{sq.name.toUpperCase()}</Text>
                {!isFull && (
                  <View style={s.openBadge}>
                    <Text style={s.openBadgeText}>{sq.openSpots} open</Text>
                  </View>
                )}
                {isFull && (
                  <View style={s.fullBadge}>
                    <Text style={s.fullBadgeText}>Full</Text>
                  </View>
                )}
              </View>
              <Text style={s.squadDist}>
                {sq.distance.toFixed(1)} km away
              </Text>
            </View>
            <View style={s.xpCol}>
              <Text style={s.xpVal}>{sq.totalXp.toLocaleString()}</Text>
              <Text style={s.xpLabel}>XP</Text>
            </View>
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={s.expanded}>
            <View style={s.statsRow}>
              <View style={s.statCell}>
                <Text style={s.statVal}>{sq.memberCount}/{sq.maxMembers}</Text>
                <Text style={s.statLbl}>MEMBERS</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statCell}>
                <Text style={s.statVal}>{duprLabel}</Text>
                <Text style={s.statLbl}>AVG DUPR</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statCell}>
                <Text style={s.statVal}>Lv.{sq.level}</Text>
                <Text style={s.statLbl}>LEVEL</Text>
              </View>
              <View style={s.statDiv} />
              <View style={s.statCell}>
                <Text style={s.statVal}>{sq.sessions}</Text>
                <Text style={s.statLbl}>SESSIONS</Text>
              </View>
            </View>

            <View style={s.avatarRow}>
              {sq.members.slice(0, 5).map((m, i) => (
                <View key={i} style={s.memberAvatar}>
                  <Text style={s.memberInitial}>{m.initial}</Text>
                </View>
              ))}
              {sq.openSpots > 0 && (
                <Text style={s.spotsOpen}>{sq.openSpots} spots open</Text>
              )}
            </View>

            {isFull ? (
              <View style={s.fullBtn}>
                <Text style={s.fullBtnText}>Squad full</Text>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => sq.code && onJoinSquad(sq.code)}
              >
                <LinearGradient colors={[LIME, LIME_DARK]} style={s.joinBtn}>
                  <Text style={s.joinBtnText}>Request to join →</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Squads near you</Text>
        <Text style={s.cityLabel} numberOfLines={1}>{cityLabel}</Text>
      </View>

      <View style={s.searchWrap}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search squad name..."
          placeholderTextColor="#52525b"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={s.filterScroll}
      >
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterPill, activeFilter === f.key && s.filterPillActive]}
            onPress={() => setActiveFilter(f.key)}
            activeOpacity={0.7}
          >
            <Text style={[s.filterText, activeFilter === f.key && s.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={LIME} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIME} />
          }
        >
          {grouped.length === 0 ? (
            <Text style={s.emptyText}>No squads found nearby.</Text>
          ) : (
            grouped.map((group) => (
              <View key={group.label}>
                <Text style={s.sectionLabel}>{group.label}</Text>
                {group.squads.map(renderSquadCard)}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 12, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row', alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', marginLeft: 4 },
  cityLabel: { fontSize: 11, color: '#52525b', maxWidth: 100, textAlign: 'right' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 14, marginBottom: 10,
    backgroundColor: '#141414', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: '#fff' },
  filterScroll: { maxHeight: 44, marginBottom: 8 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: '#141414',
  },
  filterPillActive: { backgroundColor: LIME_DIM, borderColor: LIME },
  filterText: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
  filterTextActive: { color: LIME },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase',
    letterSpacing: 1, color: '#52525b', marginBottom: 10, marginTop: 8,
  },
  squadCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  squadHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  squadEmoji: { fontSize: 36 },
  squadHeaderBody: { flex: 1, minWidth: 0 },
  squadNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  squadName: { fontFamily: BANGERS, fontSize: 20, color: '#fff', letterSpacing: 0.5 },
  openBadge: {
    backgroundColor: LIME_DIM, borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  openBadgeText: { fontSize: 10, fontWeight: '800', color: LIME },
  fullBadge: {
    backgroundColor: 'rgba(161,161,170,0.12)', borderRadius: 100,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  fullBadgeText: { fontSize: 10, fontWeight: '800', color: '#71717a' },
  squadDist: { fontSize: 12, color: '#71717a', marginTop: 4 },
  xpCol: { alignItems: 'flex-end' },
  xpVal: { fontSize: 16, fontWeight: '900', color: GOLD },
  xpLabel: { fontSize: 9, fontWeight: '700', color: '#52525b' },
  expanded: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  statsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, paddingVertical: 12, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  statCell: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '900', color: '#fff' },
  statLbl: { fontSize: 8, fontWeight: '800', color: '#52525b', marginTop: 2, letterSpacing: 0.5 },
  statDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 4 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e1e1e',
    borderWidth: 1.5, borderColor: 'rgba(163,230,53,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { fontSize: 12, fontWeight: '900', color: '#fff' },
  spotsOpen: { fontSize: 11, color: '#71717a', marginLeft: 4 },
  joinBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: '#365314',
  },
  joinBtnText: { fontSize: 15, fontWeight: '900', color: '#000' },
  fullBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  fullBtnText: { fontSize: 15, fontWeight: '700', color: '#52525b' },
  emptyText: { fontSize: 14, color: '#52525b', textAlign: 'center', marginTop: 40 },
});
