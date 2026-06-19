import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getInviteStatus } from '../api';
import type { SquadInviteEnriched } from '../types';

const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const LIME_DIM = 'rgba(163,230,53,0.13)';
const GOLD_DIM = 'rgba(245,158,11,0.13)';

interface Props {
  squadId: string;
  isFounder: boolean;
  onResend?: (inviteId: number) => void;
  onResendCard?: () => void;
}

export function SquadInviteStatusCard({ squadId, isFounder, onResend, onResendCard }: Props) {
  const [invites, setInvites] = useState<SquadInviteEnriched[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!isFounder) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await getInviteStatus(squadId);
      setInvites(data.invites ?? []);
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, [squadId, isFounder]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  if (!isFounder) return null;
  if (loading) return <ActivityIndicator color={LIME} style={{ marginVertical: 16 }} />;
  // Hide accepted invites — player is already visible as a member in the avatar row
  const namedInvites = invites.filter(
    (inv) => !!inv.displayName && inv.status !== 'accepted'
  );
  if (namedInvites.length === 0) return null;

  return (
    <View style={s.container}>
      <Text style={s.title}>Invites status</Text>
      {namedInvites.map((inv, index) => {
        const isLast = index === namedInvites.length - 1;
        const isNotOnApp = inv.status === 'not_on_app';
        const isPending = inv.status === 'pending';
        const isAccepted = inv.status === 'accepted';
        const isDeclined = inv.status === 'declined';

        const statusLabel = isNotOnApp ? 'Not on SQUADD'
          : isPending ? 'Invite pending'
          : isAccepted ? 'Joined'
          : isDeclined ? 'Declined'
          : inv.status;

        const statusColor = isNotOnApp ? '#52525b'
          : isPending ? '#f59e0b'
          : isAccepted ? '#22c55e'
          : isDeclined ? '#ef4444'
          : '#52525b';

        return (
          <View key={inv.id} style={[s.row, isLast && s.rowLast]}>
            <View style={s.avatar}>
              <Text style={s.initial}>{inv.displayName?.charAt(0).toUpperCase() ?? '?'}</Text>
            </View>

            <View style={s.nameWrap}>
              <View style={s.nameRow}>
                <Text style={s.name} numberOfLines={1}>{inv.displayName}</Text>
                {isNotOnApp && (
                  <View style={s.notOnAppTag}>
                    <Text style={s.notOnAppText}>NOT ON APP</Text>
                  </View>
                )}
              </View>
              <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>

            {/* Right-side CTA pill */}
            {isPending && onResend ? (
              <TouchableOpacity
                style={s.resendPill}
                onPress={() => onResend(inv.id)}
                activeOpacity={0.7}
              >
                <Text style={s.resendPillText}>Resend</Text>
              </TouchableOpacity>
            ) : isNotOnApp && onResendCard ? (
              <TouchableOpacity
                style={s.resendCardPill}
                onPress={onResendCard}
                activeOpacity={0.7}
              >
                <Text style={s.resendCardPillText}>Resend card</Text>
              </TouchableOpacity>
            ) : isAccepted ? (
              <View style={s.joinedPill}>
                <Text style={s.joinedPillText}>Joined ✓</Text>
              </View>
            ) : isDeclined ? (
              <View style={s.declinedPill}>
                <Text style={s.declinedPillText}>Declined</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#52525b',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  initial: { fontSize: 14, fontWeight: '900', color: '#fff' },
  nameWrap: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 13, fontWeight: '700', color: '#fff' },
  statusText: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  // "NOT ON APP" inline tag
  notOnAppTag: {
    backgroundColor: 'rgba(161,161,170,0.12)',
    borderRadius: 100,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  notOnAppText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Resend pill — gold outline, matches invite screen style
  resendPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: GOLD,
    backgroundColor: GOLD_DIM,
    flexShrink: 0,
  },
  resendPillText: { fontSize: 12, fontWeight: '800', color: GOLD },
  // Joined pill — lime, non-tappable
  joinedPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: LIME,
    backgroundColor: LIME_DIM,
    flexShrink: 0,
  },
  joinedPillText: { fontSize: 12, fontWeight: '800', color: LIME },
  // Declined pill — red, non-tappable
  declinedPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    flexShrink: 0,
  },
  declinedPillText: { fontSize: 12, fontWeight: '800', color: '#ef4444' },
  // Resend card pill — lime outline for not-on-app
  resendCardPill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: LIME,
    backgroundColor: LIME_DIM,
    flexShrink: 0,
  },
  resendCardPillText: { fontSize: 12, fontWeight: '800', color: LIME },
});
