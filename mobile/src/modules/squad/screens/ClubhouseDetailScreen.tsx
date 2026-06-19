import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';
import type { Squad, PodSummary, PlayerWalletData } from '../types';

const LIME = '#a3e635';
const BLUE = '#60a5fa';
const PURPLE = '#a78bfa';
const GOLD = '#facc15';

interface Props {
  squad: Squad;
  myPod: PodSummary | null;
  wallet: PlayerWalletData | null;
  onBack: () => void;
  onPodCreate: () => void;
  onPodInvite: () => void;
  onPodEdit: () => void;
}

export function ClubhouseDetailScreen({ squad, myPod, wallet, onBack, onPodCreate, onPodInvite, onPodEdit }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>{squad.emoji} Clubhouse</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Squad identity */}
        <View style={s.identityCard}>
          <Text style={s.squadEmoji}>{squad.emoji}</Text>
          <Text style={s.squadName}>{squad.name}</Text>
          <Text style={s.squadLevel}>Level {squad.level}</Text>
        </View>

        {/* KPI row */}
        <Text style={s.sectionLabel}>STATS</Text>
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: GOLD }]}>{squad.totalXp.toLocaleString()}</Text>
            <Text style={s.kpiLabel}>Total XP</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: BLUE }]}>{wallet?.clubTokens ?? 0}</Text>
            <Text style={s.kpiLabel}>Club Tokens</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, { color: PURPLE }]}>{wallet?.brandTokens ?? 0}</Text>
            <Text style={s.kpiLabel}>Brand Tokens</Text>
          </View>
        </View>

        {/* Members */}
        <Text style={s.sectionLabel}>MEMBERS ({squad.members?.length ?? 0})</Text>
        <View style={s.membersCard}>
          {(squad.members ?? []).map((m) => (
            <View key={m.profileId} style={s.memberRow}>
              <View style={s.memberAvatar}>
                <Text style={s.memberInitial}>
                  {(m.profile?.squadNickname ?? m.profile?.displayName ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>
                  {m.profile?.squadNickname ? `@${m.profile.squadNickname}` : m.profile?.displayName ?? '?'}
                </Text>
                {m.podName ? (
                  <Text style={s.memberPod}>{m.podName}</Text>
                ) : null}
              </View>
              {m.role === 'founder' && <Text style={s.founderBadge}>Founder</Text>}
            </View>
          ))}
        </View>

        {/* Pods */}
        <Text style={s.sectionLabel}>YOUR POD</Text>
        {myPod ? (
          <TouchableOpacity style={s.podCard} onPress={onPodEdit} activeOpacity={0.75}>
            <Text style={s.podEmoji}>{myPod.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.podName}>{myPod.name}</Text>
              <Text style={s.podMembers}>{myPod.members.length} members</Text>
            </View>
            <TouchableOpacity onPress={onPodInvite} style={s.podInviteBtn}>
              <Text style={s.podInviteBtnText}>+ Invite</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.createPodCard} onPress={onPodCreate} activeOpacity={0.75}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>👥</Text>
            <Text style={s.createPodTitle}>No Pod yet</Text>
            <Text style={s.createPodSub}>Create a Pod to play together as a tight crew</Text>
            <View style={s.createPodCta}>
              <Text style={s.createPodCtaText}>Create Pod →</Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  content: { padding: 20, gap: 16, paddingBottom: 60 },
  identityCard: {
    alignItems: 'center', paddingVertical: 20,
    backgroundColor: '#141414', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  squadEmoji: { fontSize: 48, marginBottom: 4 },
  squadName: { fontSize: 22, fontWeight: '900', color: '#fff' },
  squadLevel: { fontSize: 14, color: LIME, fontWeight: '700', marginTop: 2 },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: {
    flex: 1, backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, alignItems: 'center',
  },
  kpiValue: { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  kpiLabel: { fontSize: 10, color: '#71717a', fontWeight: '700', textTransform: 'uppercase' },
  membersCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  memberInitial: { fontSize: 16, fontWeight: '800', color: '#fff' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  memberPod: { fontSize: 11, color: '#52525b', fontWeight: '600', marginTop: 1 },
  founderBadge: { fontSize: 11, color: GOLD, fontWeight: '700' },
  podCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(163,230,53,0.2)',
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  podEmoji: { fontSize: 28 },
  podName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  podMembers: { fontSize: 12, color: '#71717a', marginTop: 2 },
  podInviteBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, borderWidth: 1.5, borderColor: LIME },
  podInviteBtnText: { fontSize: 12, fontWeight: '800', color: LIME },
  createPodCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 20, alignItems: 'center',
  },
  createPodTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 4 },
  createPodSub: { fontSize: 13, color: '#71717a', textAlign: 'center', lineHeight: 18, marginBottom: 14 },
  createPodCta: {
    backgroundColor: 'rgba(163,230,53,0.12)', borderWidth: 1, borderColor: LIME,
    borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8,
  },
  createPodCtaText: { fontSize: 13, fontWeight: '800', color: LIME },
});
