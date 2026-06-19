/**
 * SquadShareCard — client-side React Native card.
 * Rendered locally so it works identically on iOS and Android,
 * uses the actual emoji string (no server font substitution),
 * and uses the Bangers font loaded globally in App.tsx.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Squad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface Props {
  squad: Squad;
  founderHandle: string;    // "@guigui" or display name
  founderDupr?: number | null;
  founderQuote?: string | null;
  /** joinUrl resolved by the parent after calling shareLink */
  joinUrl?: string | null;
}

export function SquadShareCard({
  squad,
  founderHandle,
  founderDupr,
  founderQuote,
  joinUrl,
}: Props) {
  const code = squad.code?.code ?? '';
  const members = squad.members ?? [];
  const memberCount = members.length;
  const openSpots = Math.max(0, 8 - memberCount);

  const duprValues = members
    .map((m) => m.profile?.reclubPlayer?.duprDoubles)
    .filter((v) => v != null)
    .map((v) => Number(v))
    .filter((v) => v > 0);
  const avgDupr =
    duprValues.length > 0
      ? (duprValues.reduce((a, b) => a + b, 0) / duprValues.length).toFixed(1)
      : null;

  const visibleMembers = members.slice(0, 5);
  const overflow = memberCount - visibleMembers.length;
  const emptySlots = Math.min(openSpots, Math.max(0, 5 - visibleMembers.length - (overflow > 0 ? 1 : 0)));

  // Display URL: always the clean join URL
  const url = code ? `hub.thecourtflow.com/join/${code}` : (joinUrl ?? '');

  return (
    <LinearGradient
      colors={['#071507', '#050f05', '#030803']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[s.card, { borderColor: `${squad.color ?? GOLD}40` }]}
    >
      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.brandRow}>
          <Text style={s.pingPong}>🏓</Text>
          <Text style={s.brand}>SQUADD</Text>
        </View>
        <View style={s.inviteBadge}>
          <Text style={s.inviteBadgeText}>SQUAD INVITE</Text>
        </View>
      </View>

      {/* Squad emoji — use Text so it renders as the actual Unicode emoji */}
      <Text style={s.emoji}>{squad.emoji}</Text>

      {/* Squad name in Bangers */}
      <Text style={[s.squadName, { color: squad.color ?? GOLD }]} numberOfLines={1}>
        {squad.name.toUpperCase()}
      </Text>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.statCell}>
          <Text style={s.statValue}>
            {memberCount}<Text style={s.statDenom}>/8</Text>
          </Text>
          <Text style={s.statLabel}>MEMBERS</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statCell}>
          <Text style={s.statValue}>{avgDupr ?? '—'}</Text>
          <Text style={s.statLabel}>AVG DUPR</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statCell}>
          <Text style={s.statValue}>Lv.{squad.level}</Text>
          <Text style={s.statLabel}>LEVEL</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statCell}>
          <Text style={s.statValue}>{openSpots}</Text>
          <Text style={s.statLabel}>OPEN SPOTS</Text>
        </View>
      </View>

      {/* Crew so far */}
      {memberCount > 0 && (
        <View style={s.crewSection}>
          <Text style={s.crewLabel}>CREW SO FAR</Text>
          <View style={s.avatarRow}>
            {visibleMembers.map((m) => {
              const isFounder = m.profileId === squad.founderId;
              const initial = (m.profile?.squadNickname ?? m.profile?.displayName ?? '?')
                .charAt(0).toUpperCase();
              return (
                <View key={m.id} style={[s.crewAvatar, isFounder && s.crewAvatarFounder]}>
                  {isFounder && <Text style={s.crewCrown}>👑</Text>}
                  <Text style={s.crewInitial}>{initial}</Text>
                </View>
              );
            })}
            {overflow > 0 && (
              <View style={[s.crewAvatar, s.crewAvatarOverflow]}>
                <Text style={s.crewOverflowText}>+{overflow}</Text>
              </View>
            )}
            {Array.from({ length: emptySlots }).map((_, i) => (
              <View key={`e-${i}`} style={[s.crewAvatar, s.crewAvatarEmpty]}>
                <Text style={s.crewPlus}>+</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Founder card */}
      <View style={s.founderCard}>
        <View style={s.founderAvatar}>
          <Text style={s.founderCrown}>👑</Text>
          <Text style={s.founderInitial}>
            {founderHandle.replace('@', '').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.founderName}>
            {founderHandle}
            <Text style={s.founderRole}> · Founder</Text>
          </Text>
          {founderDupr != null && (
            <Text style={s.founderMeta}>DUPR {Number(founderDupr).toFixed(1)}</Text>
          )}
          <Text style={s.founderQuote}>
            "{founderQuote ?? `Join ${squad.name} — every session earns chest rewards 💪`}"
          </Text>
        </View>
      </View>

      {/* Download CTA */}
      <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGrad}>
        <Text style={s.ctaText}>📱 Download SQUADD & join {squad.name}</Text>
        <Text style={s.ctaSub}>Free · auto-joins your squad on install</Text>
      </LinearGradient>

      {/* Footer */}
      {!!url && (
        <View style={s.footer}>
          <View style={s.footerRow}>
            <Text style={s.footerIcon}>🔗</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.footerUrl} numberOfLines={1}>{url}</Text>
              {!!code && <Text style={s.footerCode}>Squad code : {code}</Text>}
            </View>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: 20,
    overflow: 'hidden',
    marginVertical: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pingPong: { fontSize: 16 },
  brand: {
    fontFamily: BANGERS,
    fontSize: 20,
    color: LIME,
    letterSpacing: 1,
  },
  inviteBadge: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  inviteBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.5,
  },
  emoji: {
    fontSize: 54,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 2,
  },
  squadName: {
    fontFamily: BANGERS,
    fontSize: 40,
    textAlign: 'center',
    letterSpacing: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '900', color: '#fff' },
  statDenom: { fontSize: 14, fontWeight: '700', color: '#52525b' },
  statLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#52525b',
    marginTop: 2,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 4,
  },
  crewSection: { paddingHorizontal: 14, marginBottom: 12 },
  crewLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#52525b',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  avatarRow: { flexDirection: 'row', gap: 6 },
  crewAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1a2a1a',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(163,230,53,0.18)',
  },
  crewAvatarFounder: { borderColor: GOLD, borderWidth: 2 },
  crewAvatarOverflow: {
    backgroundColor: '#1e1e1e',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  crewAvatarEmpty: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  crewCrown: { position: 'absolute', top: -9, fontSize: 10 },
  crewInitial: { fontSize: 13, fontWeight: '900', color: '#fff' },
  crewOverflowText: { fontSize: 11, fontWeight: '800', color: '#71717a' },
  crewPlus: { fontSize: 14, color: '#3f3f46' },
  founderCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  founderAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1a2a1a',
    borderWidth: 2, borderColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  founderCrown: { position: 'absolute', top: -10, fontSize: 12 },
  founderInitial: { fontSize: 18, fontWeight: '900', color: '#fff' },
  founderName: { fontSize: 13, fontWeight: '800', color: GOLD },
  founderRole: { fontSize: 12, fontWeight: '600', color: '#a1a1aa' },
  founderMeta: { fontSize: 11, color: '#71717a', marginTop: 1 },
  founderQuote: {
    fontSize: 12, color: '#a1a1aa',
    fontStyle: 'italic', marginTop: 5, lineHeight: 18,
  },
  ctaGrad: {
    marginHorizontal: 14,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
  },
  ctaText: { fontSize: 14, fontWeight: '900', color: '#000' },
  ctaSub: { fontSize: 11, fontWeight: '600', color: 'rgba(0,0,0,0.55)', marginTop: 2 },
  footer: { paddingHorizontal: 14, paddingBottom: 14 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  footerIcon: { fontSize: 14 },
  footerUrl: { fontSize: 11, fontWeight: '700', color: LIME },
  footerCode: { fontSize: 10, color: '#52525b', marginTop: 1 },
});
