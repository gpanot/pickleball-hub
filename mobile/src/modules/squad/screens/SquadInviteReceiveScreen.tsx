import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { getSquadByCode, getSquadPreview, getPendingInvite } from '../api';
import { PlayerAvatar } from '../../../components/PlayerAvatar';
import { SquadBackButton } from '../components/SquadBackButton';
import type { SquadPreview, SquadInviteKnownMember } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface Props {
  code?: string | null;
  inviteId?: number | null;
  squadId?: string | null;
  onJoin: (code?: string, inviteId?: number, squadId?: string) => void;
  onMaybeLater: (preview: SquadPreview | null, inviteId?: number) => void;
  onBack: () => void;
}

function memberSubtitle(member: SquadInviteKnownMember): string {
  const duprPart = member.dupr != null ? `DUPR ${member.dupr}` : 'DUPR —';
  if (member.sessionsTogether > 0) {
    const sessions =
      member.isFollowing || member.isFounder
        ? `${member.sessionsTogether} session${member.sessionsTogether === 1 ? '' : 's'} together`
        : `you played ${member.sessionsTogether} time${member.sessionsTogether === 1 ? '' : 's'}`;
    return `${duprPart} · ${sessions}`;
  }
  if (member.isFollowing) return `${duprPart} · you follow`;
  return duprPart;
}

export function SquadInviteReceiveScreen({ code, inviteId, squadId, onJoin, onMaybeLater, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<SquadPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (code) {
          const data = await getSquadByCode(code);
          setPreview(data);
        } else if (squadId) {
          const data = await getSquadPreview(squadId);
          setPreview(data);
        } else if (inviteId) {
          // Only inviteId provided (e.g. push deeplink without squadId) — load via pending-invite
          const pending = await getPendingInvite();
          if (pending) setPreview(pending.preview);
        }
      } catch {
        setError('Could not load squad details');
      }
      setLoading(false);
    })();
  }, [code, squadId, inviteId]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      if (code) {
        await onJoin(code);
      } else if (inviteId && (preview || squadId)) {
        await onJoin(undefined, inviteId, preview?.id ?? squadId ?? undefined);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to join');
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={LIME} size="large" />
      </View>
    );
  }

  if (!preview && !inviteId) {
    return (
      <View style={s.container}>
        <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
          <SquadBackButton onPress={onBack} />
          <Text style={s.topTitle}>Squad invite</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🔍</Text>
          <Text style={{ color: '#a1a1aa', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>Squad not found</Text>
          <Text style={{ color: '#52525b', fontSize: 13, textAlign: 'center', marginTop: 6 }}>This invite link may have expired or the squad was disbanded.</Text>
        </View>
      </View>
    );
  }

  const isFull = preview ? preview.memberCount >= 8 : false;
  const knownMembers = preview?.knownMembers ?? [];
  const inviterMember =
    knownMembers.find((m) => m.isFounder) ??
    knownMembers[0] ??
    null;
  const district = preview?.district ?? 'D1';
  const joinLabel = preview
    ? `Join ${preview.name.split(' ').map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ')}`
    : 'Join squad';

  return (
    <View style={s.container}>
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Squad invite</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {preview && (
          <>
            <View style={s.hero}>
              {inviterMember?.userId ? (
                <View style={s.heroAvatarWrap}>
                  <PlayerAvatar
                    userId={inviterMember.userId}
                    displayName={inviterMember.displayName}
                    imageUrl={inviterMember.imageUrl}
                    size={72}
                  />
                </View>
              ) : (
                <Text style={s.heroEmoji}>{preview.emoji}</Text>
              )}
              <Text style={[s.squadName, { color: preview.color }]}>{preview.name}</Text>
              {preview.inviterName && (
                <Text style={s.inviterText}>
                  <Text style={s.inviterName}>{preview.inviterName}</Text>
                  {' invited you to join'}
                </Text>
              )}

              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Text style={s.statValue}>{preview.memberCount}</Text>
                  <Text style={s.statLabel}>MEMBERS</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.stat}>
                  <Text style={s.statValue}>{preview.avgDupr ?? '—'}</Text>
                  <Text style={s.statLabel}>AVG DUPR</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.stat}>
                  <Text style={s.statValue}>{district}</Text>
                  <Text style={s.statLabel}>DISTRICT</Text>
                </View>
              </View>
            </View>

            {knownMembers.length > 0 && (
              <View style={s.knownSection}>
                <Text style={s.knownTitle}>MEMBERS YOU KNOW</Text>
                <View style={s.knownCard}>
                  {knownMembers.map((member, index) => (
                    <View
                      key={member.profileId}
                      style={[s.memberRow, index < knownMembers.length - 1 && s.memberRowBorder]}
                    >
                      <View style={[s.memberAvatarWrap, member.isFounder && s.founderAvatarWrap]}>
                        {member.userId ? (
                          <PlayerAvatar
                            userId={member.userId}
                            displayName={member.displayName}
                            imageUrl={member.imageUrl}
                            size={44}
                          />
                        ) : (
                          <View style={s.memberAvatarFallback}>
                            <Text style={s.memberInitial}>
                              {member.displayName?.charAt(0).toUpperCase() ?? '?'}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={s.memberInfo}>
                        <View style={s.memberNameRow}>
                          <Text style={s.memberName}>{member.displayName ?? 'Player'}</Text>
                          {member.isFounder && (
                            <View style={s.founderBadge}>
                              <Text style={s.founderBadgeText}>Founder</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.memberMeta}>{memberSubtitle(member)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={s.infoBanner}>
              <Text style={s.infoText}>
                Joining means leaving any current squad · 7-day cooldown applies
              </Text>
            </View>

            {isFull && (
              <View style={s.errorBanner}>
                <Text style={s.errorBannerText}>This squad is full (8/8 members)</Text>
              </View>
            )}

            {error && (
              <View style={s.errorBanner}>
                <Text style={s.errorBannerText}>{error}</Text>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          onPress={handleJoin}
          disabled={joining || isFull}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[LIME, LIME_DARK]}
            style={[s.primaryGrad, (joining || isFull) && { opacity: 0.4 }]}
          >
            {joining ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.primaryText}>{isFull ? 'Squad is full' : joinLabel}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.laterBtn}
          onPress={() => onMaybeLater(preview, inviteId ?? undefined)}
          activeOpacity={0.7}
        >
          <Text style={s.laterText}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 100 },
  hero: { alignItems: 'center', marginBottom: 28 },
  heroEmoji: { fontSize: 64, marginBottom: 12 },
  heroAvatarWrap: {
    marginBottom: 16,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: GOLD,
    padding: 2,
  },
  squadName: {
    fontFamily: BANGERS,
    fontSize: 34,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  inviterText: { fontSize: 14, color: '#a1a1aa', marginBottom: 20, textAlign: 'center' },
  inviterName: { color: '#fff', fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 4,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 4 },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', letterSpacing: 1 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.07)' },
  knownSection: { marginBottom: 16 },
  knownTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52525b',
    letterSpacing: 1,
    marginBottom: 10,
  },
  knownCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  memberAvatarWrap: { borderRadius: 22, overflow: 'hidden' },
  founderAvatarWrap: { borderWidth: 2, borderColor: GOLD, borderRadius: 24, padding: 1 },
  memberAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { fontSize: 16, fontWeight: '900', color: '#fff' },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  memberName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  founderBadge: {
    backgroundColor: 'rgba(250,204,21,0.15)',
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  founderBadgeText: { fontSize: 10, fontWeight: '800', color: GOLD },
  memberMeta: { fontSize: 12, color: '#a1a1aa' },
  infoBanner: {
    backgroundColor: 'rgba(250,204,21,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  infoText: { fontSize: 12, color: GOLD, textAlign: 'center', lineHeight: 18 },
  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: { fontSize: 13, color: '#ef4444', fontWeight: '600', textAlign: 'center' },
  primaryGrad: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  primaryText: { fontSize: 16, fontWeight: '900', color: '#000' },
  laterBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  laterText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
});
