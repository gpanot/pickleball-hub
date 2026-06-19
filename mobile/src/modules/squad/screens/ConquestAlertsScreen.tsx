import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';
import * as conquestApi from '../conquestApi';
import { timeAgoLabel } from '../hooks/useConquest';
import type { ConquestAlert } from '../types';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const GOLD = '#facc15';
const RED = '#ef4444';
const SURFACE = '#141414';

const ALERT_ICONS: Record<string, string> = {
  clash_alert: '⚔️',
  battle_won: '🏆',
  battle_lost: '💀',
  territory_claimed: '🏳️',
  territory_lost: '😤',
  counter_attack: '↩️',
  session_ended: '📍',
  conquest_session_reveal: '⚡',
  conquest_overlord_gained: '👑',
  conquest_overlord_lost: '😤',
  conquest_rival_posted: '📡',
  conquest_battle_progress: '⚔️',
};

const ALERT_COLORS: Record<string, string> = {
  clash_alert: GOLD,
  battle_won: LIME,
  battle_lost: RED,
  territory_claimed: LIME,
  territory_lost: RED,
  counter_attack: GOLD,
  session_ended: '#a1a1aa',
  conquest_session_reveal: LIME,
  conquest_overlord_gained: GOLD,
  conquest_overlord_lost: RED,
  conquest_rival_posted: '#a1a1aa',
  conquest_battle_progress: GOLD,
};

// Alert types that are tappable and navigate somewhere meaningful
const TAPPABLE_TYPES = new Set([
  'conquest_session_reveal',
  'battle_won',
  'battle_lost',
  'clash_alert',
  'counter_attack',
]);

interface Props {
  onBack: () => void;
  onAlertRead?: () => void;
  onAlertPress?: (alert: ConquestAlert) => void;
}

export function ConquestAlertsScreen({ onBack, onAlertRead, onAlertPress }: Props) {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState<ConquestAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadAlerts = useCallback(async (cursor?: string) => {
    try {
      const { alerts: newAlerts, nextCursor: next } = await conquestApi.getAlerts(cursor);
      if (cursor) {
        setAlerts(prev => [...prev, ...newAlerts]);
      } else {
        setAlerts(newAlerts);
      }
      setNextCursor(next);
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAlerts().finally(() => setLoading(false));
  }, [loadAlerts]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  }, [loadAlerts]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await loadAlerts(nextCursor);
    setLoadingMore(false);
  }, [nextCursor, loadingMore, loadAlerts]);

  const handleMarkAllRead = useCallback(async () => {
    setMarking(true);
    try {
      await conquestApi.markAlertsRead();
      setAlerts(prev => prev.map(a => ({ ...a, readAt: a.readAt ?? new Date().toISOString() })));
      onAlertRead?.();
    } finally {
      setMarking(false);
    }
  }, [onAlertRead]);

  const unreadCount = alerts.filter(a => !a.readAt).length;
  const unread = alerts.filter(a => !a.readAt);
  const read = alerts.filter(a => !!a.readAt);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <SquadBackButton onPress={onBack} />
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>🔔 SQUAD ALERTS</Text>
          {unreadCount > 0 && (
            <View style={s.unreadBadge}>
              <Text style={s.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {unreadCount > 0 && !marking && (
          <TouchableOpacity onPress={handleMarkAllRead} style={s.markAllBtn}>
            <Text style={s.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
        {marking && <ActivityIndicator color={LIME} size="small" />}
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={LIME} size="large" />
        </View>
      ) : alerts.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyIcon}>📭</Text>
          <Text style={s.emptyTitle}>No alerts yet</Text>
          <Text style={s.emptySub}>Squad conquest activity will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AlertRow
              alert={item}
              onPress={onAlertPress ? () => onAlertPress(item) : undefined}
            />
          )}
          ListHeaderComponent={
            unread.length > 0 ? (
              <View style={s.sectionHeader}>
                <Text style={s.sectionLabel}>UNREAD · {unread.length}</Text>
              </View>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListFooterComponent={
            <>
              {read.length > 0 && unread.length > 0 && (
                <View style={s.sectionHeader}>
                  <Text style={[s.sectionLabel, { color: '#52525b' }]}>READ HISTORY</Text>
                </View>
              )}
              {loadingMore && (
                <View style={s.loadMoreIndicator}>
                  <ActivityIndicator color={LIME} size="small" />
                </View>
              )}
              {nextCursor && !loadingMore && (
                <TouchableOpacity style={s.loadMoreBtn} onPress={handleLoadMore}>
                  <Text style={s.loadMoreText}>Load more</Text>
                </TouchableOpacity>
              )}
            </>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIME} />
          }
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function AlertRow({ alert, onPress }: { alert: ConquestAlert; onPress?: () => void }) {
  // Use prefix-match for battle_result_* dynamic types from cron
  const typeKey = alert.type.startsWith('battle_result_')
    ? (alert.title?.includes('won') ? 'battle_won' : 'battle_lost')
    : alert.type;

  const icon = ALERT_ICONS[typeKey] ?? '📋';
  const accentColor = ALERT_COLORS[typeKey] ?? '#a1a1aa';
  const isUnread = !alert.readAt;
  const isTappable = !!onPress && (TAPPABLE_TYPES.has(typeKey) || alert.type.startsWith('battle_result_'));

  const content = (
    <>
      {isUnread && <View style={r.unreadDot} />}
      <View style={[r.iconBox, { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30` }]}>
        <Text style={r.icon}>{icon}</Text>
      </View>
      <View style={r.body}>
        <Text style={[r.title, isUnread && r.titleUnread]}>{alert.title}</Text>
        <Text style={r.bodyText} numberOfLines={2}>{alert.body}</Text>
        <Text style={r.time}>{timeAgoLabel(alert.createdAt)}</Text>
      </View>
      {isTappable && <Text style={r.chevron}>›</Text>}
    </>
  );

  if (isTappable) {
    return (
      <TouchableOpacity style={[r.row, isUnread && r.rowUnread]} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={[r.row, isUnread && r.rowUnread]}>{content}</View>;
}

const r = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0a0a0a',
    gap: 10,
  },
  rowUnread: {
    backgroundColor: 'rgba(163,230,53,0.04)',
  },
  unreadDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: LIME,
    marginTop: 5, flexShrink: 0,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  icon: { fontSize: 18 },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: '#d4d4d4', marginBottom: 2 },
  titleUnread: { color: '#fff' },
  bodyText: { fontSize: 12, color: '#a1a1aa', lineHeight: 17 },
  time: { fontSize: 10, color: '#52525b', marginTop: 4 },
  chevron: { fontSize: 22, color: '#52525b', alignSelf: 'center', paddingLeft: 4 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 8,
  },
  headerCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  headerTitle: { fontFamily: BANGERS, fontSize: 20, color: GOLD, letterSpacing: 1 },
  unreadBadge: {
    backgroundColor: RED, borderRadius: 100, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  markAllBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(163,230,53,0.08)',
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.25)',
    borderRadius: 10,
  },
  markAllText: { fontSize: 11, fontWeight: '700', color: LIME },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#a1a1aa', textAlign: 'center' },
  listContent: { paddingBottom: 100 },
  sectionHeader: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: LIME,
  },
  separator: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginLeft: 66,
  },
  loadMoreIndicator: { paddingVertical: 16, alignItems: 'center' },
  loadMoreBtn: {
    margin: 16, padding: 12,
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14, alignItems: 'center',
  },
  loadMoreText: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
});
