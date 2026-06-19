import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SquadChestOpening } from '../types';

const GOLD = '#facc15';
const LIME = '#a3e635';
const GREEN = '#22c55e';

interface Props {
  openings: SquadChestOpening[];
  myProfileId?: string | null;
  size?: 'small' | 'large';
}

export function SquadChestMemberGrid({ openings, myProfileId, size = 'small' }: Props) {
  const avatarSize = size === 'large' ? 52 : 40;
  const badgeSize = size === 'large' ? 18 : 14;
  const fontSize = size === 'large' ? 22 : 16;
  const nameSize = size === 'large' ? 11 : 9;

  return (
    <View style={s.container}>
      {openings.map((o) => {
        const isMe = o.profileId === myProfileId;
        const initial = (o.displayName ?? '?').replace('@', '').charAt(0).toUpperCase();
        const borderColor = getBorderColor(o.status);
        const opacity = o.status === 'pending' && !isMe ? 0.35 : 1;

        let statusLabel = '';
        switch (o.status) {
          case 'opened': statusLabel = 'Opened'; break;
          case 'unlocking': statusLabel = formatTimeLeft(o.unlocksAt); break;
          case 'ready': statusLabel = 'Ready!'; break;
          case 'pending': statusLabel = isMe ? '' : 'Not tapped'; break;
          case 'expired': statusLabel = 'Expired'; break;
        }

        return (
          <View key={o.profileId} style={[s.item, { opacity }]}>
            <View style={[
              s.avatar,
              { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
              borderColor ? { borderWidth: 2, borderColor } : {},
            ]}>
              <Text style={[s.initial, { fontSize }]}>{initial}</Text>
              {(o.status === 'opened' || o.status === 'unlocking' || o.status === 'ready') && (
                <View style={[
                  s.badge,
                  { width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2 },
                  o.status === 'opened' ? { backgroundColor: GREEN } :
                  o.status === 'ready' ? { backgroundColor: LIME } :
                  { backgroundColor: GOLD },
                ]}>
                  <Text style={s.badgeIcon}>
                    {o.status === 'opened' ? '✓' : o.status === 'ready' ? '✓' : '⏱'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.name, { fontSize: nameSize }]} numberOfLines={1}>
              {o.displayName?.replace('@', '') ?? '?'}
            </Text>
            {statusLabel ? (
              <Text style={[
                s.status,
                { fontSize: nameSize },
                o.status === 'opened' ? { color: GREEN } :
                o.status === 'unlocking' ? { color: GOLD } :
                o.status === 'ready' ? { color: LIME } :
                {},
              ]}>
                {statusLabel}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function getBorderColor(status: string): string | null {
  switch (status) {
    case 'opened': return GREEN;
    case 'unlocking': return GOLD;
    case 'ready': return LIME;
    default: return null;
  }
}

function formatTimeLeft(unlocksAt: string | null): string {
  if (!unlocksAt) return '⏱';
  const diff = new Date(unlocksAt).getTime() - Date.now();
  if (diff <= 0) return 'Ready!';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  item: { alignItems: 'center', gap: 4 },
  avatar: {
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontWeight: '900', color: '#fff' },
  badge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0a0a0a',
  },
  badgeIcon: { fontSize: 8, color: '#000', fontWeight: '900' },
  name: { color: '#a1a1aa', fontWeight: '700', textAlign: 'center' },
  status: { color: '#52525b', fontWeight: '700' },
});
