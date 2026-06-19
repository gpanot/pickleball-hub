import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { FeedItem } from '../types';

const LIME = '#a3e635';
const GOLD = '#facc15';

const FEED_ICONS: Record<string, string> = {
  checkin: '📍',
  scraper_session: '🏓',
  chest_opened: '📦',
  member_joined: '👥',
  streak_daily: '🔥',
  streak_milestone: '🔥',
};

interface Props {
  feed: FeedItem[];
}

export function SquadActivityFeed({ feed }: Props) {
  if (feed.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.sectionLabel}>SQUAD ACTIVITY</Text>
      {feed.map((item, i) => {
        const icon = FEED_ICONS[item.type] ?? '📋';
        const showXpBadge = item.type !== 'streak_milestone' && item.xpAwarded > 0;

        return (
          <View key={`${item.createdAt}-${i}`} style={[s.row, i < feed.length - 1 && s.rowBorder]}>
            <View style={s.iconBox}>
              <Text style={s.icon}>{icon}</Text>
            </View>
            <View style={s.body}>
              <Text style={s.text}>
                <Text style={s.highlight}>{item.displayName}</Text>
                {' '}{getActionText(item)}
              </Text>
              <Text style={s.time}>{getTimeAgo(item.createdAt)}</Text>
            </View>
            {showXpBadge && (
              <View style={s.xpBadge}>
                <Text style={s.xpText}>+{item.xpAwarded} XP</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function getActionText(item: FeedItem): string {
  switch (item.type) {
    case 'checkin': return 'checked in';
    case 'scraper_session': return 'played · Reclub confirmed';
    case 'chest_opened': return 'opened their chest';
    case 'member_joined': return 'joined the squad';
    case 'streak_daily': return 'maintained the daily streak';
    case 'streak_milestone': return `hit a ${item.streakDays ?? '?'}-day streak`;
    default: return 'earned XP';
  }
}

function getTimeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 8 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  iconBox: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: '#1e1e1e',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 15 },
  body: { flex: 1 },
  text: { fontSize: 13, fontWeight: '600', color: '#fff', lineHeight: 18 },
  highlight: { color: GOLD },
  time: { fontSize: 11, color: '#52525b', marginTop: 2 },
  xpBadge: {
    backgroundColor: 'rgba(163,230,53,0.13)',
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 100, alignSelf: 'center',
  },
  xpText: { fontSize: 11, fontWeight: '800', color: LIME },
});
