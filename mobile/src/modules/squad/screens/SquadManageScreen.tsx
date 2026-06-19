import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { Squad, SquadMemberWithProfile, SquadInviteEnriched } from '../types';
import { InviteMoreButton } from '../components/InviteMoreButton';
import { SquadBackButton } from '../components/SquadBackButton';
import * as api from '../api';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const RED = '#ef4444';

interface Props {
  squad: Squad;
  myRole: string | null;
  myProfileId?: string | null;
  onBack: () => void;
  onEditSquad: () => void;
  onInviteMore: () => void;
  onDisbandPress: () => void;
  onLeavePress: () => void;
  onRefresh: () => Promise<void>;
  onTransferDone: () => void;
}

export function SquadManageScreen({
  squad, myRole, myProfileId, onBack, onEditSquad, onInviteMore,
  onDisbandPress, onLeavePress, onRefresh, onTransferDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const isFounder = myRole === 'founder';

  const [transferTarget, setTransferTarget] = useState<SquadMemberWithProfile | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SquadMemberWithProfile | null>(null);
  const [nicknameVisible, setNicknameVisible] = useState(false);
  const [leaveVisible, setLeaveVisible] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [resendMap, setResendMap] = useState<Record<number, boolean>>({});

  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameStatus, setNicknameStatus] = useState<{ text: string; color: string } | null>(null);
  const [nicknameAvailable, setNicknameAvailable] = useState(false);
  const [nicknameChecking, setNicknameChecking] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }, [onRefresh]);

  const members = (squad.members ?? []).filter(m => !m.leftAt);
  const invites = (squad.invites ?? []).filter(i => i.status === 'pending' || i.status === 'not_on_app');
  const me = members.find(m => m.profileId === myProfileId);
  const otherMembers = members.filter(m => m.profileId !== myProfileId);

  const myHandle = me?.profile?.squadNickname ?? null;
  const myDisplayName = me?.profile?.displayName ?? 'You';
  const myDupr = me?.profile?.reclubPlayer?.duprDoubles;

  const currentNickname = myHandle;

  useEffect(() => {
    if (nicknameVisible && currentNickname) {
      setNicknameInput(currentNickname);
    }
  }, [nicknameVisible, currentNickname]);

  const handleNicknameChange = useCallback((text: string) => {
    const clean = text.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    setNicknameInput(clean);
    setNicknameAvailable(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!clean) {
      setNicknameStatus(null);
      return;
    }
    if (clean.length < 3) {
      setNicknameStatus({ text: 'Min 3 characters', color: RED });
      return;
    }
    if (clean === currentNickname?.toLowerCase()) {
      setNicknameStatus({ text: "That's your current handle", color: LIME });
      return;
    }

    setNicknameStatus({ text: 'Checking...', color: '#71717a' });
    setNicknameChecking(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.checkNickname(clean);
        if (res.available) {
          setNicknameStatus({ text: `@${clean} is available ✓`, color: LIME });
          setNicknameAvailable(true);
        } else {
          setNicknameStatus({ text: `@${clean} is already taken ✗`, color: RED });
          setNicknameAvailable(false);
        }
      } catch {
        setNicknameStatus({ text: 'Error checking', color: RED });
      } finally {
        setNicknameChecking(false);
      }
    }, 400);
  }, [currentNickname]);

  const handleSaveNickname = useCallback(async () => {
    if (!nicknameAvailable || actionLoading) return;
    setActionLoading(true);
    try {
      await api.updateHandle(nicknameInput);
      setNicknameVisible(false);
      Alert.alert('Done', `@${nicknameInput} set as your handle`);
      await onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save handle');
    } finally {
      setActionLoading(false);
    }
  }, [nicknameAvailable, nicknameInput, actionLoading, onRefresh]);

  const handleTransfer = useCallback(async () => {
    if (!transferTarget || actionLoading) return;
    setActionLoading(true);
    try {
      await api.transferFounder(squad.id, transferTarget.profileId);
      setTransferTarget(null);
      Alert.alert('Done', `Founder role transferred to ${getMemberName(transferTarget)}`);
      onTransferDone();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Transfer failed');
    } finally {
      setActionLoading(false);
    }
  }, [transferTarget, actionLoading, squad.id, onTransferDone]);

  const handleRemove = useCallback(async () => {
    if (!removeTarget || actionLoading) return;
    setActionLoading(true);
    try {
      await api.removeMember(squad.id, removeTarget.profileId);
      setRemoveTarget(null);
      Alert.alert('Done', `${getMemberName(removeTarget)} removed from squad`);
      await onRefresh();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not remove member');
    } finally {
      setActionLoading(false);
    }
  }, [removeTarget, actionLoading, squad.id, onRefresh]);

  const handleResend = useCallback(async (inviteId: number) => {
    try {
      await api.resendInvite(squad.id, inviteId);
      setResendMap(prev => ({ ...prev, [inviteId]: true }));
      setTimeout(() => {
        setResendMap(prev => ({ ...prev, [inviteId]: false }));
      }, 2000);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not resend');
    }
  }, [squad.id]);

  const nicknameSaveDisabled = !nicknameAvailable || nicknameChecking || actionLoading ||
    nicknameInput === currentNickname?.toLowerCase();

  return (
    <View style={s.container}>
      {/* Topbar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle} numberOfLines={1}>Manage {squad.name}</Text>
        {isFounder ? (
          <TouchableOpacity onPress={onEditSquad}>
            <Text style={s.editBtn}>Edit squad</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={LIME} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      >
        {/* Identity card */}
        <LinearGradient
          colors={isFounder ? ['#1a1a0a', '#111'] : ['#0a1a0a', '#111']}
          style={s.founderCard}
        >
          <View style={s.founderRow}>
            <View style={[s.founderAvatar, !isFounder && { borderColor: LIME }]}>
              <Text style={[s.founderInitial, !isFounder && { color: LIME }]}>
                {getInitial(myDisplayName)}
              </Text>
            </View>
            <View style={s.founderInfo}>
              <View style={s.founderNameRow}>
                <Text style={[s.founderHandle, !isFounder && { color: LIME }]}>
                  {myHandle ? `@${myHandle}` : myDisplayName}
                </Text>
                <View style={[s.founderPill, !isFounder && { backgroundColor: 'rgba(163,230,53,0.15)' }]}>
                  <Text style={[s.founderPillText, !isFounder && { color: LIME }]}>
                    {isFounder ? 'Founder' : 'Member'}
                  </Text>
                </View>
              </View>
              <Text style={s.founderSub}>
                {myDupr != null ? `DUPR ${Number(myDupr).toFixed(1)}` : 'No DUPR'}
                {squad.city ? ` · ${squad.city === 'hcm' ? 'Ho Chi Minh City' : squad.city}` : ''}
              </Text>
            </View>
            <TouchableOpacity style={s.editNickBtn} onPress={() => setNicknameVisible(true)}>
              <Text style={s.editNickText}>Edit nickname</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Squad stats 2x2 grid */}
        <Text style={s.sectionLabel}>SQUAD STATS</Text>
        <View style={s.statsGrid}>
          <View style={s.statCell}>
            <Text style={s.statValue}>Lv.{squad.level ?? 1}</Text>
            <Text style={s.statLabel}>LEVEL</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statValue}>{squad.totalXp ?? 0}</Text>
            <Text style={s.statLabel}>TOTAL XP</Text>
          </View>
          <View style={s.statCell}>
            <Text style={[s.statValue, { color: GOLD }]}>
              {squad.streakDays && squad.streakDays > 0 ? `${squad.streakDays}` : '—'}
            </Text>
            <Text style={s.statLabel}>SESSIONS</Text>
          </View>
          <View style={s.statCell}>
            <Text style={s.statValue}>
              {squad.cityRank ? `#${squad.cityRank}` : '—'}
            </Text>
            <Text style={s.statLabel}>DISTRICT RANK</Text>
          </View>
        </View>

        {/* Members section */}
        <Text style={s.sectionLabel}>MEMBERS ({members.length}/8)</Text>

        {/* Founder row */}
        {me && (
          <View style={s.memberRow}>
            <View style={s.memberAvatarFounder}>
              <Text style={s.memberInitial}>{getInitial(myDisplayName)}</Text>
              <Text style={s.crownIcon}>👑</Text>
            </View>
            <View style={s.memberInfo}>
              <View style={s.memberNameRow}>
                <Text style={s.memberName}>{myHandle ? `@${myHandle}` : myDisplayName}</Text>
                <View style={s.founderPill}>
                  <Text style={s.founderPillText}>Founder</Text>
                </View>
              </View>
              <Text style={s.memberSub}>
                {myDupr != null ? `DUPR ${Number(myDupr).toFixed(1)}` : 'No DUPR'}
                {' · '}0 sessions
              </Text>
            </View>
          </View>
        )}

        {/* Other member rows */}
        {otherMembers.map(member => {
          const name = getMemberName(member);
          const dupr = member.profile?.reclubPlayer?.duprDoubles;
          return (
            <View key={member.profileId} style={s.memberRow}>
              <View style={s.memberAvatar}>
                <Text style={s.memberInitial}>{getInitial(name)}</Text>
              </View>
              <View style={s.memberInfo}>
                <Text style={s.memberName}>{name}</Text>
                <Text style={s.memberSub}>
                  {dupr != null ? `DUPR ${Number(dupr).toFixed(1)}` : 'No DUPR'}
                  {' · '}0 sessions
                </Text>
              </View>
              {isFounder && (
                <View style={s.memberActions}>
                  <TouchableOpacity
                    style={s.transferPill}
                    onPress={() => setTransferTarget(member)}
                  >
                    <Text style={s.transferPillText}>Transfer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.removePill}
                    onPress={() => setRemoveTarget(member)}
                  >
                    <Text style={s.removePillText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Pending invites */}
        {invites.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 28 }]}>PENDING INVITES ({invites.length})</Text>
            {invites.map(invite => {
              const name = invite.displayName ?? 'Unknown';
              const isNotOnApp = invite.channel === 'link' || invite.status === 'not_on_app';
              const isSent = resendMap[invite.id];
              return (
                <View key={invite.id} style={s.memberRow}>
                  <View style={s.memberAvatar}>
                    <Text style={s.memberInitial}>{getInitial(name)}</Text>
                  </View>
                  <View style={s.memberInfo}>
                    <Text style={s.memberName}>{name}</Text>
                    <Text style={s.memberSub}>
                      {isNotOnApp ? 'Not on app · link shared' : `Invite sent · ${getRelativeTime(invite.createdAt)}`}
                    </Text>
                  </View>
                  {isNotOnApp || invite.status === 'pending' ? (
                    <TouchableOpacity
                      style={[s.statusPill, isNotOnApp ? s.resendPill : s.pendingPill]}
                      onPress={isNotOnApp ? () => handleResend(invite.id) : undefined}
                      disabled={!isNotOnApp}
                    >
                      <Text style={[s.statusPillText, isNotOnApp ? s.resendText : s.pendingText]}>
                        {isSent ? 'Sent ✓' : isNotOnApp ? 'Resend' : 'Pending'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </>
        )}

        {/* Bottom actions */}
        <View style={{ marginTop: 28 }}>
          <InviteMoreButton onPress={onInviteMore} label="+ Invite more members" />
        </View>

        {isFounder ? (
          <TouchableOpacity style={s.disbandBtn} onPress={onDisbandPress} activeOpacity={0.7}>
            <Text style={s.disbandText}>Disband squad</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.leaveBtn} onPress={() => setLeaveVisible(true)} activeOpacity={0.7}>
            <Text style={s.leaveText}>🚪 Leave this Squadd</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Transfer Sheet */}
      <Modal visible={!!transferTarget} animationType="slide" transparent>
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayTap} onPress={() => setTransferTarget(null)} />
          <View style={s.sheet}>
            <View style={s.dragHandle} />
            <Text style={s.sheetEmoji}>👑</Text>
            <Text style={s.sheetTitle}>Transfer to {transferTarget ? getMemberName(transferTarget) : ''}?</Text>
            <Text style={s.sheetDesc}>
              {transferTarget ? getMemberName(transferTarget) : ''} becomes the new Founder with full management powers.
            </Text>
            <View style={s.sheetRows}>
              <Text style={s.sheetRow}>⚠️  You become a regular member — no management permissions.</Text>
              <Text style={s.sheetRow}>✅  Squad XP, history, and stats are fully preserved.</Text>
              <Text style={s.sheetRow}>⏱  7-day lock: {transferTarget ? getMemberName(transferTarget) : ''} cannot transfer again for 7 days.</Text>
            </View>
            <TouchableOpacity
              style={[s.primaryBtn, actionLoading && { opacity: 0.6 }]}
              onPress={handleTransfer}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color="#000" /> : (
                <Text style={s.primaryBtnText}>Confirm transfer</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setTransferTarget(null)} disabled={actionLoading}>
              <Text style={s.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Remove Sheet */}
      <Modal visible={!!removeTarget} animationType="slide" transparent>
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayTap} onPress={() => setRemoveTarget(null)} />
          <View style={s.sheet}>
            <View style={s.dragHandle} />
            <Text style={s.sheetEmoji}>🚫</Text>
            <Text style={[s.sheetTitle, { color: RED }]}>Remove {removeTarget ? getMemberName(removeTarget) : ''}?</Text>
            <View style={s.sheetRows}>
              <Text style={s.sheetRow}>📊  Session history and XP stay on {removeTarget ? getMemberName(removeTarget) : ''}'s profile.</Text>
              <Text style={s.sheetRow}>⏱  {removeTarget ? getMemberName(removeTarget) : ''} has a 7-day cooldown before joining another squad.</Text>
              <Text style={s.sheetRow}>🔔  {removeTarget ? getMemberName(removeTarget) : ''} will be notified they were removed.</Text>
            </View>
            <TouchableOpacity
              style={[s.removeCta, actionLoading && { opacity: 0.6 }]}
              onPress={handleRemove}
              disabled={actionLoading}
            >
              {actionLoading ? <ActivityIndicator color={RED} /> : (
                <Text style={s.removeCtaText}>Remove from {squad.name}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setRemoveTarget(null)} disabled={actionLoading}>
              <Text style={s.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Leave Squad Sheet */}
      <Modal visible={leaveVisible} animationType="slide" transparent onRequestClose={() => setLeaveVisible(false)}>
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayTap} onPress={() => setLeaveVisible(false)} />
          <View style={s.sheet}>
            <View style={s.dragHandle} />
            <Text style={s.sheetEmoji}>🚪</Text>
            <Text style={[s.sheetTitle, { color: RED }]}>Leave {squad.name}?</Text>
            <Text style={s.sheetDesc}>
              You'll lose access to the squad chest and leaderboard. Your personal XP and history stay on your profile.
            </Text>
            <View style={s.sheetRows}>
              <Text style={s.sheetRow}>⏱  7-day cooldown before joining another squad.</Text>
              <Text style={s.sheetRow}>📊  Your sessions and XP stay on your profile.</Text>
              <Text style={s.sheetRow}>🔔  Squad members will be notified.</Text>
            </View>
            <TouchableOpacity
              style={[s.removeCta, actionLoading && { opacity: 0.6 }]}
              onPress={() => { setLeaveVisible(false); onLeavePress(); }}
              disabled={actionLoading}
            >
              <Text style={s.removeCtaText}>Leave {squad.name}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setLeaveVisible(false)} disabled={actionLoading}>
              <Text style={s.secondaryBtnText}>Stay in squad</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Nickname Sheet */}
      <Modal visible={nicknameVisible} animationType="slide" transparent>
        <View style={s.overlay}>
          <TouchableOpacity style={s.overlayTap} onPress={() => setNicknameVisible(false)} />
          <View style={s.sheet}>
            <View style={s.dragHandle} />
            <Text style={s.nickAt}>@</Text>
            <Text style={s.sheetTitle}>Edit your nickname</Text>
            <Text style={s.sheetDesc}>Your Squadd handle. Can be changed once every 30 days.</Text>

            <View style={s.nickInputRow}>
              <Text style={s.nickPrefix}>@</Text>
              <TextInput
                style={s.nickInput}
                value={nicknameInput}
                onChangeText={handleNicknameChange}
                placeholder="username"
                placeholderTextColor="#52525b"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
            </View>

            {nicknameStatus && (
              <Text style={[s.nickStatus, { color: nicknameStatus.color }]}>
                {nicknameStatus.text}
              </Text>
            )}

            {me?.profile?.squadNicknameSetAt ? (
              <Text style={s.nickCooldown}>
                ⏱  Next change available after 30 days.
              </Text>
            ) : (
              <Text style={s.nickCooldown}>
                You can change your nickname anytime.
              </Text>
            )}

            <TouchableOpacity
              style={[s.primaryBtn, nicknameSaveDisabled && { opacity: 0.5 }]}
              onPress={handleSaveNickname}
              disabled={nicknameSaveDisabled}
            >
              {actionLoading ? <ActivityIndicator color="#000" /> : (
                <Text style={s.primaryBtnText}>Save nickname</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setNicknameVisible(false)} disabled={actionLoading}>
              <Text style={s.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getInitial(name: string | null): string {
  if (!name) return '?';
  const clean = name.replace(/^@/, '');
  return clean.charAt(0).toUpperCase();
}

function getMemberName(member: SquadMemberWithProfile): string {
  if (member.profile?.squadNickname) return `@${member.profile.squadNickname}`;
  const dn = member.profile?.displayName;
  if (dn) return dn.split(' ')[0];
  return 'Unknown';
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row', alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  editBtn: { fontSize: 13, fontWeight: '700', color: GOLD, borderWidth: 1, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  founderCard: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)',
  },
  founderRow: { flexDirection: 'row', alignItems: 'center' },
  founderAvatar: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: GOLD,
    backgroundColor: '#222', alignItems: 'center', justifyContent: 'center',
  },
  founderInitial: { fontSize: 18, fontWeight: '800', color: GOLD },
  founderInfo: { flex: 1, marginLeft: 12 },
  founderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  founderHandle: { fontSize: 15, fontWeight: '800', color: GOLD },
  founderPill: {
    backgroundColor: 'rgba(250,204,21,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  founderPillText: { fontSize: 10, fontWeight: '800', color: GOLD },
  founderSub: { fontSize: 12, color: '#71717a', marginTop: 2 },
  editNickBtn: {
    backgroundColor: 'rgba(96,165,250,0.12)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.3)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5,
  },
  editNickText: { fontSize: 11, fontWeight: '700', color: '#60a5fa' },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2,
    color: '#52525b', marginTop: 24, marginBottom: 12, marginHorizontal: 20,
  },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, gap: 8,
  },
  statCell: {
    width: '48%' as any, backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', flexGrow: 1,
  },
  statValue: { fontFamily: BANGERS, fontSize: 28, color: LIME, marginBottom: 2 },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', letterSpacing: 1 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingVertical: 12, gap: 12,
  },
  memberAvatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#222',
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarFounder: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#222',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: GOLD, position: 'relative' as any,
  },
  memberInitial: { fontSize: 16, fontWeight: '800', color: '#fff' },
  crownIcon: { position: 'absolute', top: -8, fontSize: 11 },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  memberSub: { fontSize: 12, color: '#71717a', marginTop: 1 },
  memberActions: { flexDirection: 'row', gap: 6 },
  transferPill: {
    backgroundColor: 'rgba(250,204,21,0.12)', borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.3)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  transferPillText: { fontSize: 11, fontWeight: '700', color: GOLD },
  removePill: {
    backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 1,
    borderColor: RED, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  removePillText: { fontSize: 11, fontWeight: '700', color: RED },

  statusPill: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  pendingPill: { backgroundColor: 'rgba(250,204,21,0.12)' },
  pendingText: { fontSize: 11, fontWeight: '700', color: GOLD },
  resendPill: { backgroundColor: 'rgba(96,165,250,0.12)', borderWidth: 1, borderColor: 'rgba(96,165,250,0.3)' },
  resendText: { fontSize: 11, fontWeight: '700', color: '#60a5fa' },
  statusPillText: {},

  disbandBtn: {
    marginHorizontal: 16, marginTop: 14,
    borderWidth: 1.5, borderColor: RED,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  disbandText: { fontSize: 15, fontWeight: '800', color: RED },
  leaveBtn: {
    marginHorizontal: 16, marginTop: 14,
    borderWidth: 1.5, borderColor: RED,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  leaveText: { fontSize: 15, fontWeight: '800', color: RED },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 36, paddingTop: 12,
  },
  dragHandle: {
    width: 40, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2,
    alignSelf: 'center', marginBottom: 20,
  },
  sheetEmoji: { fontSize: 32, textAlign: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  sheetDesc: { fontSize: 14, color: '#a1a1aa', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  sheetRows: { marginBottom: 24 },
  sheetRow: { fontSize: 14, color: '#d4d4d8', lineHeight: 22, marginBottom: 8 },

  primaryBtn: {
    backgroundColor: LIME, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
  secondaryBtn: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  removeCta: {
    borderWidth: 1.5, borderColor: RED,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 16, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
  },
  removeCtaText: { fontSize: 16, fontWeight: '800', color: RED },

  nickAt: { fontSize: 36, fontWeight: '800', color: GOLD, textAlign: 'center', marginBottom: 8 },
  nickInputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#222',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12,
    paddingHorizontal: 14, marginBottom: 8,
  },
  nickPrefix: { fontSize: 16, fontWeight: '700', color: '#71717a', marginRight: 4 },
  nickInput: { flex: 1, fontSize: 16, fontWeight: '700', color: '#fff', paddingVertical: 14 },
  nickStatus: { fontSize: 13, marginBottom: 8, marginLeft: 4 },
  nickCooldown: { fontSize: 12, color: '#52525b', marginBottom: 20, marginLeft: 4 },
});
