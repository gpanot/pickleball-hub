import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadIdentityBar } from '../components/SquadIdentityBar';
import { SquadMembersRow } from '../components/SquadMembersRow';
import { SquadInviteStatusCard } from '../components/SquadInviteStatusCard';
import { SquadChestCard } from '../components/SquadChestCard';
import { SquadStreakTracker } from '../components/SquadStreakTracker';
import { SquadContributionCard } from '../components/SquadContributionCard';
import { SquadActivityFeed } from '../components/SquadActivityFeed';
import { SquadPlaceholderChest } from '../components/SquadPlaceholderChest';
import { ConquestRadarInactiveCard } from '../components/ConquestLiveBanner';
import type { Squad, SquadChest, FeedItem, SquadStreak, PlayerContribution } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const RED = '#ef4444';


interface Props {
  squad: Squad;
  myRole: string | null;
  myProfileId?: string | null;
  loading: boolean;
  activeChest: SquadChest | null;
  recentFeed: FeedItem[];
  streak: SquadStreak;
  myContribution: PlayerContribution;
  cityRank: number | null;
  onRefresh: () => Promise<void>;
  onCancelInvite: (inviteId: number) => Promise<void>;
  onResendInvite: (inviteId: number) => Promise<void>;
  onResendCard: () => void;
  onInviteMore: () => void;
  onExitSquad: () => Promise<void>;
  onRemoveMember: (profileId: string, name: string) => Promise<void>;
  onDisbandPress?: () => void;
  onLeavePress?: () => void;
  onChestPress: (chest: SquadChest) => void;
  onChestTap: (chest: SquadChest) => void;
  onChestOpen: (chest: SquadChest) => void;
  onChestNudge: (chest: SquadChest) => void;
  onCheckin: () => void;
  onLeaderboard: () => void;
  onManage?: () => void;
  // Phase 4 Conquest
  conquestBanner?: React.ReactNode;
  hasActiveSession?: boolean;
  alertBadgeCount?: number;
  onAlerts?: () => void;
  onDevReset?: () => Promise<void>;
}

export function SquadHomeScreen({
  squad, myRole, myProfileId, loading,
  activeChest, recentFeed, streak, myContribution, cityRank,
  onRefresh, onCancelInvite, onResendInvite, onResendCard, onInviteMore,
  onExitSquad, onRemoveMember, onDisbandPress, onLeavePress,
  onChestPress, onChestTap, onChestOpen, onChestNudge,
  onCheckin, onLeaderboard, onManage,
  conquestBanner, hasActiveSession,
  alertBadgeCount, onAlerts, onDevReset,
}: Props) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }, [onRefresh]);

  const handleRemoveInvite = useCallback(async (inviteId: number) => {
    try {
      await onCancelInvite(inviteId);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not remove invite');
    }
  }, [onCancelInvite]);

  const handleResendInvite = useCallback(async (inviteId: number) => {
    try {
      await onResendInvite(inviteId);
      Alert.alert('Sent', 'Invite resent.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not resend invite');
    }
  }, [onResendInvite]);

  const handleDevReset = useCallback(async () => {
    if (!onDevReset) return;
    setResetting(true);
    try {
      await onDevReset();
    } finally {
      setResetting(false);
    }
  }, [onDevReset]);

  const members = squad.members ?? [];
  const invites = squad.invites ?? [];
  const isFounder = myRole === 'founder';
  const showWelcomeCard = members.length === 1 && invites.length === 0;

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        {onDevReset && (
          <TouchableOpacity
            style={s.resetBtn}
            onPress={handleDevReset}
            disabled={resetting}
            activeOpacity={0.8}
          >
            {resetting ? (
              <Text style={s.resetBtnText}>…</Text>
            ) : (
              <Text style={s.resetBtnText}>↺ Reset</Text>
            )}
          </TouchableOpacity>
        )}
        <Text style={s.topTitle}>MY SQUADD</Text>
        {cityRank !== null && (
          <TouchableOpacity style={s.rankPill} onPress={onLeaderboard}>
            <Text style={s.rankText}>#{cityRank} City</Text>
          </TouchableOpacity>
        )}
        {/* Conquest bell icon */}
        {onAlerts && (
          <TouchableOpacity style={s.bellBtn} onPress={onAlerts}>
            <Text style={s.bellIcon}>🔔</Text>
            {(alertBadgeCount ?? 0) > 0 && (
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>
                  {(alertBadgeCount ?? 0) > 9 ? '9+' : alertBadgeCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        {onManage && (
          <TouchableOpacity style={s.manageBtn} onPress={onManage}>
            <Text style={s.manageBtnText}>⚙️</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIME} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <SquadIdentityBar squad={squad} cityRank={cityRank} />
        {/* Radar card: show inactive placeholder when no session, live banner when active */}
        {conquestBanner ?? (
          <ConquestRadarInactiveCard onCheckin={onCheckin} sessionActive={hasActiveSession} />
        )}
        <SquadMembersRow
          members={members}
          founderId={squad.founderId}
          myProfileId={myProfileId}
          isFounder={isFounder}
          onInviteMore={isFounder ? onInviteMore : undefined}
          onRemoveMember={isFounder ? onRemoveMember : undefined}
        />

        {isFounder && (
          <SquadInviteStatusCard
            squadId={squad.id}
            isFounder={isFounder}
            onResend={handleResendInvite}
            onResendCard={onResendCard}
          />
        )}

        {/* Squad Chests row — always visible, shows slots for all squad members */}
        {activeChest ? (
          <SquadChestCard
            chest={activeChest}
            myProfileId={myProfileId}
            squadMembers={(squad.members ?? []).map(m => ({
              profileId: m.profileId,
              displayName: m.profile?.squadNickname ?? m.profile?.displayName ?? null,
            }))}
            onPress={() => onChestPress(activeChest)}
            onTap={() => onChestTap(activeChest)}
            onOpen={() => onChestOpen(activeChest)}
            onNudge={() => onChestNudge(activeChest)}
          />
        ) : (
          <SquadPlaceholderChest />
        )}

        {/* Streak tracker */}
        <SquadStreakTracker streakDays={streak.days} />

        {/* Your contribution */}
        <SquadContributionCard contribution={myContribution} />

        {/* Welcome card for new squads */}
        {showWelcomeCard && (
          <View style={s.welcomeCard}>
            <Text style={s.welcomeTitle}>What happens next</Text>
            <View style={s.welcomeRow}>
              <Text style={s.welcomeEmoji}>👥</Text>
              <Text style={s.welcomeText}>Invite up to 7 more players to your squad</Text>
            </View>
            <View style={s.welcomeRow}>
              <Text style={s.welcomeEmoji}>🎮</Text>
              <Text style={s.welcomeText}>When anyone plays a session, the whole squad earns XP</Text>
            </View>
            <View style={s.welcomeRow}>
              <Text style={s.welcomeEmoji}>🏆</Text>
              <Text style={s.welcomeText}>Level up and climb the city leaderboard together</Text>
            </View>
          </View>
        )}

        {/* Activity feed */}
        <SquadActivityFeed feed={recentFeed} />

        {/* Bottom action row */}
        <View style={s.bottomActionsRow}>
          <TouchableOpacity style={s.bottomActionBtn} onPress={onLeaderboard} activeOpacity={0.7}>
            <Text style={s.bottomActionIcon}>🏆</Text>
            <Text style={s.bottomActionText}>City Leaderboard</Text>
          </TouchableOpacity>
          <View style={s.bottomActionDivider} />
          <TouchableOpacity style={s.bottomActionBtn} onPress={onInviteMore} activeOpacity={0.7}>
            <Text style={s.bottomActionIcon}>👥</Text>
            <Text style={s.bottomActionText}>Invite Players</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* FAB: Check in — hidden while a session is active */}
      {!hasActiveSession && <PulsingFab onPress={onCheckin} bottom={insets.bottom + 20} />}
    </View>
  );
}

function PulsingFab({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[s.fabContainer, { bottom }]}>
      <Animated.View style={[s.fabGlow, { transform: [{ scale: pulse }] }]} />
      <TouchableOpacity style={s.fab} onPress={onPress} activeOpacity={0.8}>
        <Text style={s.fabText}>📍 Check in</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  topTitle: { fontFamily: BANGERS, fontSize: 22, color: GOLD, letterSpacing: 1 },
  resetBtn: {
    position: 'absolute', left: 16, bottom: 10,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  resetBtnText: { fontSize: 11, fontWeight: '800', color: '#ef4444' },
  rankPill: {
    position: 'absolute', right: 20, bottom: 14,
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100,
  },
  rankText: { fontSize: 11, fontWeight: '800', color: GOLD },
  manageBtn: {
    position: 'absolute', right: 20, bottom: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  manageBtnText: { fontSize: 18 },
  noChest: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#111', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16,
    padding: 20, alignItems: 'center',
  },
  noChestTitle: { fontSize: 15, fontWeight: '800', color: '#52525b', marginBottom: 4 },
  noChestSub: { fontSize: 12, color: '#3f3f46', textAlign: 'center' },
  welcomeCard: { marginHorizontal: 16, marginTop: 8, backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 16 },
  welcomeTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 14 },
  welcomeRow: { flexDirection: 'row', gap: 12, paddingVertical: 8 },
  welcomeEmoji: { fontSize: 18 },
  welcomeText: { flex: 1, fontSize: 13, color: '#a1a1aa', lineHeight: 20 },
  bottomActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  bottomActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  bottomActionDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 10,
  },
  bottomActionIcon: { fontSize: 16 },
  bottomActionText: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
  fabContainer: {
    position: 'absolute', right: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  fabGlow: {
    position: 'absolute',
    width: '120%', height: '120%',
    borderRadius: 32,
    backgroundColor: 'rgba(163,230,53,0.25)',
  },
  fab: {
    backgroundColor: LIME,
    borderRadius: 28,
    paddingVertical: 14, paddingHorizontal: 22,
    elevation: 4,
    shadowColor: LIME, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12,
  },
  fabText: { fontSize: 16, fontWeight: '900', color: '#000' },
  bellBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 2,
  },
  bellIcon: { fontSize: 18 },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#ef4444', borderRadius: 100,
    minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  bellBadgeText: { fontSize: 9, fontWeight: '900', color: '#fff' },
});
