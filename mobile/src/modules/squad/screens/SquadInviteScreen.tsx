import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Share, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../stores/authStore';
import { sendInvites, shareLink, getInviteStatus, resendInvite } from '../api';
import { SquadShareCard } from '../components/SquadShareCard';
import { SquadBackButton } from '../components/SquadBackButton';
import type { Squad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const LIME_DIM = 'rgba(163,230,53,0.13)';
const MAX_INVITES = 7;

type Tab = 'following' | 'search' | 'share';

interface PlayerRow {
  profileId: string | null;
  userId: string;
  displayName: string | null;
  dupr: number | null;
  imageUrl: string | null;
  sessions: number;
  source: 'reclub' | 'squadd';
  hasSquad: boolean;
  squadName: string | null;
  onApp: boolean;
}

type FollowApiRow = {
  userId: string;
  profileId?: string | null;
  hasSquad?: boolean;
  squadName?: string | null;
  displayName?: string | null;
  imageUrl?: string | null;
  duprDoubles?: number | null;
};

type SearchApiRow = FollowApiRow & { username?: string | null; squadName?: string | null };

function mapFollowRow(f: FollowApiRow): PlayerRow {
  return {
    userId: f.userId,
    profileId: f.profileId ?? null,
    displayName: f.displayName ?? null,
    dupr: f.duprDoubles != null ? Number(f.duprDoubles) : null,
    imageUrl: f.imageUrl ?? null,
    sessions: 0,
    source: 'reclub',
    hasSquad: f.hasSquad ?? false,
    squadName: f.squadName ?? null,
    onApp: !!f.profileId,
  };
}

function mapSearchRow(p: SearchApiRow): PlayerRow {
  return {
    userId: p.userId,
    profileId: p.profileId ?? null,
    displayName: p.displayName ?? p.username ?? null,
    dupr: p.duprDoubles != null ? Number(p.duprDoubles) : null,
    imageUrl: p.imageUrl ?? null,
    sessions: 0,
    source: p.profileId ? 'squadd' : 'reclub',
    hasSquad: p.hasSquad ?? false,
    squadName: p.squadName ?? null,
    onApp: !!p.profileId,
  };
}

/** Key used to identify a player in the selected set. On-app → profileId, not-on-app → userId. */
function playerKey(player: PlayerRow): string {
  return player.profileId ?? player.userId;
}

function isInvitable(player: PlayerRow, myProfileId: string | null): boolean {
  // Exclude yourself and players already in a squad
  if (player.profileId === myProfileId) return false;
  if (player.hasSquad) return false;
  return true;
}

interface InviteResultPlayer { name: string; }
interface Props {
  squad: Squad;
  onInvitesSent: (result: {
    invited: InviteResultPlayer[];
    notOnApp: InviteResultPlayer[];
  }) => void;
  onSkip: () => void;
  onBack: () => void;
}

export function SquadInviteScreen({ squad, onInvitesSent, onSkip, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('following');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [following, setFollowing] = useState<PlayerRow[]>([]);
  const [searchResults, setSearchResults] = useState<PlayerRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingFollows, setLoadingFollows] = useState(true);
  const [refreshingFollows, setRefreshingFollows] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingByProfileId, setPendingByProfileId] = useState<
    Map<string, { inviteId: number; displayName: string | null }>
  >(new Map());
  const [resendingProfileId, setResendingProfileId] = useState<string | null>(null);

  const profileId = useAuthStore((s) => s.profileId);
  const founderDupr = useAuthStore.getState().duprRating;
  const [founderNickname, setFounderNickname] = useState<string | null>(null);
  const founderDisplayName = useAuthStore.getState().displayName ?? '';
  const founderHandle = founderNickname ? `@${founderNickname}` : founderDisplayName;
  const [cachedJoinUrl, setCachedJoinUrl] = useState<string | null>(null);
  const [cachedCardUrl, setCachedCardUrl] = useState<string | null>(null);

  useEffect(() => {
    useAuthStore.getState().authedFetch('/api/squads/nickname').then(async (r) => {
      if (r.ok) { const d = await r.json(); if (d.current) setFounderNickname(d.current); }
    }).catch(() => {});
    shareLink(squad.id).then((d) => {
      setCachedJoinUrl(d.url);
      if (d.cardUrl) setCachedCardUrl(d.cardUrl);
    }).catch(() => {});
  }, [squad.id]);

  const loadPendingInvites = useCallback(async () => {
    try {
      const data = await getInviteStatus(squad.id);
      const map = new Map<string, { inviteId: number; displayName: string | null }>();
      for (const inv of data.invites ?? []) {
        if (inv.status === 'pending' && inv.inviteeId) {
          map.set(inv.inviteeId, { inviteId: inv.id, displayName: inv.displayName });
        }
      }
      setPendingByProfileId(map);
    } catch {}
  }, [squad.id]);

  useEffect(() => {
    void loadPendingInvites();
  }, [loadPendingInvites]);

  const fetchFollows = useCallback(async () => {
    try {
      const res = await useAuthStore.getState().authedFetch('/api/follows');
      if (!res.ok) return;
      const data = await res.json();
      const follows: FollowApiRow[] = Array.isArray(data) ? data : (data.follows ?? []);
      setFollowing(follows.map(mapFollowRow));
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      await fetchFollows();
      setLoadingFollows(false);
    })();
  }, [fetchFollows]);

  const handleRefreshFollows = useCallback(async () => {
    setRefreshingFollows(true);
    await fetchFollows();
    setRefreshingFollows(false);
  }, [fetchFollows]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await useAuthStore.getState().authedFetch(
          `/api/players/search?q=${encodeURIComponent(searchQuery)}`,
        );
        if (!res.ok) {
          setSearchResults([]);
          return;
        }
        const data = await res.json();
        const players: SearchApiRow[] = Array.isArray(data) ? data : (data.players ?? []);
        setSearchResults(players.map(mapSearchRow));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const remainingSlots = Math.max(0, MAX_INVITES - pendingByProfileId.size);

  const toggleSelect = (key: string) => {
    // Prevent re-selecting already-pending (on-app) invites
    if (pendingByProfileId.has(key)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < remainingSlots) next.add(key);
      return next;
    });
  };

  const handleResend = async (playerProfileId: string) => {
    const pending = pendingByProfileId.get(playerProfileId);
    if (!pending) return;
    setResendingProfileId(playerProfileId);
    try {
      await resendInvite(squad.id, pending.inviteId);
    } catch {}
    setResendingProfileId(null);
  };

  const handleSend = async () => {
    const allPlayers = [...following, ...searchResults];
    const keys = Array.from(selectedIds).filter((k) => !pendingByProfileId.has(k));
    if (keys.length === 0) return;

    // Split into on-app (profileId) and not-on-app (userId)
    const profileIds: string[] = [];
    const notOnAppUserIds: string[] = [];
    for (const key of keys) {
      const player = allPlayers.find((p) => playerKey(p) === key);
      if (player?.profileId) {
        profileIds.push(player.profileId);
      } else if (player) {
        notOnAppUserIds.push(player.userId);
      }
    }

    setSending(true);
    try {
      const result = await sendInvites(squad.id, profileIds, notOnAppUserIds);
      await loadPendingInvites();
      setSelectedIds(new Set());
      onInvitesSent({
        invited: [
          ...result.invited.map((i) => ({ name: i.displayName?.split(' ')[0] ?? 'Unknown' })),
          ...(result.resent ?? []).map((i) => ({ name: i.displayName?.split(' ')[0] ?? 'Unknown' })),
        ],
        notOnApp: (result.notOnApp ?? []).map((i) => ({ name: i.name })),
      });
    } catch {}
    setSending(false);
  };

  const handleShare = async () => {
    try {
      let url = cachedJoinUrl;
      let imgUrl = cachedCardUrl;
      if (!url) {
        const d = await shareLink(squad.id);
        url = d.url;
        imgUrl = d.cardUrl ?? null;
        setCachedJoinUrl(url);
        if (imgUrl) setCachedCardUrl(imgUrl);
      }
      await Share.share({
        message: `${squad.emoji} ${founderHandle} invites you to join ${squad.name} on SQUADD!\n${url}`,
        url: imgUrl ?? url!,
      });
    } catch {}
  };

  const founderInitial = useAuthStore.getState().displayName?.charAt(0).toUpperCase() ?? '?';
  const selectedArr = Array.from(selectedIds);
  // All players keyed by playerKey — used to resolve avatar initials in the slot row
  const allPlayersByKey = new Map<string, PlayerRow>(
    [...following, ...searchResults].map((p) => [playerKey(p), p])
  );

  const totalInvitedCount = pendingByProfileId.size + selectedIds.size;

  const renderPlayerRow = (player: PlayerRow) => {
    const key = playerKey(player);
    const canInvite = isInvitable(player, profileId);
    const isSelected = selectedIds.has(key);
    const alreadyInvited = player.profileId ? pendingByProfileId.has(player.profileId) : false;
    const isResending = player.profileId === resendingProfileId;
    return (
      <View key={key} style={s.playerRow}>
        <View style={s.playerAvatar}>
          <Text style={s.playerInitial}>{player.displayName?.charAt(0).toUpperCase() ?? '?'}</Text>
        </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.playerName}>{player.displayName}</Text>
              {player.onApp && (
                <View style={s.badgeSquaddOn}>
                  <Text style={s.badgeSquaddOnText}>SQUADD ✓</Text>
                </View>
              )}
            </View>
            <Text style={s.playerMeta}>
              {player.dupr ? `DUPR ${player.dupr}` : 'DUPR —'} ·{' '}
              {!player.onApp ? 'Not on SQUADD' : player.hasSquad ? 'In a squad' : 'No squad'}
            </Text>
          </View>
        {player.hasSquad ? (
          <View style={s.inSquadBlock}>
            <Text style={s.inSquadText}>In squad</Text>
            {player.squadName ? (
              <Text style={s.inSquadName} numberOfLines={1}>{player.squadName}</Text>
            ) : null}
          </View>
        ) : alreadyInvited ? (
          <TouchableOpacity
            style={s.resendBtn}
            onPress={() => player.profileId && handleResend(player.profileId)}
            disabled={isResending}
          >
            {isResending ? (
              <ActivityIndicator color={GOLD} size="small" />
            ) : (
              <Text style={s.resendBtnText}>Resend</Text>
            )}
          </TouchableOpacity>
        ) : canInvite ? (
          <TouchableOpacity
            style={[s.inviteBtn, isSelected && s.invitedBtn]}
            onPress={() => toggleSelect(key)}
          >
            <Text style={[s.inviteBtnText, isSelected && { color: LIME }]}>
              {isSelected ? 'Invited ✓' : 'Invite'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Invite your crew</Text>
        <TouchableOpacity onPress={onSkip}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Slot row */}
      <View style={s.slotSection}>
        <Text style={s.slotLabel}>{squad.emoji} {squad.name} · {totalInvitedCount} / {MAX_INVITES} invited</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.slotRow}>
          {/* Founder */}
          <View style={s.slot}>
            <View style={[s.slotAvatar, s.slotFounder]}>
              <Text style={s.slotInitial}>{founderInitial}</Text>
              <Text style={s.slotCrown}>👑</Text>
            </View>
            <Text style={s.slotName}>You</Text>
          </View>
          {/* Selected + empty */}
          {Array.from({ length: MAX_INVITES }).map((_, i) => {
            const key = selectedArr[i];
            const player = key ? allPlayersByKey.get(key) : null;
            if (player) {
              return (
                <View key={i} style={s.slot}>
                  <View style={[s.slotAvatar, s.slotInvited]}>
                    <Text style={s.slotInitial}>{player.displayName?.charAt(0).toUpperCase() ?? '?'}</Text>
                  </View>
                  <Text style={s.slotName} numberOfLines={1}>{player.displayName?.split(' ')[0]}</Text>
                </View>
              );
            }
            return (
              <View key={i} style={s.slot}>
                <View style={[s.slotAvatar, s.slotEmpty]}>
                  <Text style={{ color: '#52525b', fontSize: 14 }}>+</Text>
                </View>
                <Text style={[s.slotName, { color: '#52525b' }]}>open</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Tab pills */}
      <View style={s.tabContainer}>
        <View style={s.tabRow}>
          {(['following', 'search', 'share'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tabPill, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'following' ? 'Following' : t === 'search' ? 'Find player' : 'Share card'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tab content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tab === 'following' ? 96 : 20 }}
        refreshControl={
          tab === 'following' ? (
            <RefreshControl
              refreshing={refreshingFollows}
              onRefresh={handleRefreshFollows}
              tintColor={LIME}
            />
          ) : undefined
        }
      >
        {tab === 'following' && (
          <View>
            <Text style={s.tabHint}>Players you follow — select anyone to invite.</Text>
            {loadingFollows ? (
              <ActivityIndicator color={LIME} style={{ marginTop: 32 }} />
            ) : following.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>👥</Text>
                <Text style={s.emptyTitle}>No players to invite yet</Text>
                <Text style={s.emptyHint}>Follow players from the Circle tab first</Text>
              </View>
            ) : (
              following.map(renderPlayerRow)
            )}
          </View>
        )}

        {tab === 'search' && (
          <View style={{ paddingHorizontal: 20 }}>
            <TextInput
              style={s.searchInput}
              placeholder="🔍  Reclub or SQUADD name..."
              placeholderTextColor="#52525b"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length < 2 ? (
              <View style={s.emptyState}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>🔍</Text>
                <Text style={s.emptyTitle}>Search for a player</Text>
                <Text style={s.emptyHint}>Works for Reclub names, @squadd handles, or anyone</Text>
              </View>
            ) : searching ? (
              <ActivityIndicator color={LIME} style={{ marginTop: 32 }} />
            ) : searchResults.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={{ fontSize: 32, marginBottom: 10 }}>🤷</Text>
                <Text style={s.emptyTitle}>No players found</Text>
                <Text style={s.emptyHint}>Try another spelling or use Share card for friends not on SQUADD</Text>
              </View>
            ) : (
              searchResults.map(renderPlayerRow)
            )}
          </View>
        )}

        {tab === 'share' && (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={s.tabHint}>
              Not on SQUADD yet? Share this card. When they install, {squad.name} appears top of their squad suggestions.
            </Text>
            <SquadShareCard
              squad={squad}
              founderHandle={founderHandle}
              founderDupr={founderDupr}
              joinUrl={cachedJoinUrl}
            />
            <TouchableOpacity style={s.shareBtn} onPress={handleShare} activeOpacity={0.8}>
              <LinearGradient colors={[LIME, LIME_DARK]} style={s.shareBtnGrad}>
                <Text style={s.shareBtnText}>Share invite card →</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={s.shareLinkHint}>Deep-link survives install · auto-shows squad + suggested friends</Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      {(tab === 'following' || tab === 'search') && (
        <View style={[s.stickyCta, { paddingBottom: insets.bottom + 68 }]}>
          <TouchableOpacity
            onPress={handleSend}
            disabled={selectedIds.size === 0 || sending}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[LIME, LIME_DARK]}
              style={[s.stickyCtaGrad, selectedIds.size === 0 && { opacity: 0.4 }]}
            >
              {sending ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={s.stickyCtaText}>
                  {selectedIds.size > 0 ? `Send ${selectedIds.size} invite${selectedIds.size > 1 ? 's' : ''} →` : 'Send 0 invites →'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: { paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', flexDirection: 'row', alignItems: 'center' },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff' },
  skipText: { fontSize: 13, fontWeight: '700', color: LIME },
  slotSection: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  slotLabel: { fontSize: 11, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, paddingTop: 8, textAlign: 'center' },
  slotRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  slot: { alignItems: 'center', gap: 4, width: 48 },
  slotAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e1e1e' },
  slotFounder: { borderWidth: 2, borderColor: GOLD },
  slotInvited: { borderWidth: 2, borderColor: LIME },
  slotEmpty: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.07)', borderStyle: 'dashed', backgroundColor: 'transparent' },
  slotInitial: { fontSize: 16, fontWeight: '900', color: '#fff' },
  slotCrown: { position: 'absolute', top: -8, fontSize: 11 },
  slotName: { fontSize: 10, color: '#a1a1aa', fontWeight: '700', maxWidth: 48 },
  tabContainer: { paddingHorizontal: 20, paddingVertical: 12 },
  tabRow: { flexDirection: 'row', backgroundColor: '#1e1e1e', borderRadius: 10, padding: 3 },
  tabPill: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: '#141414' },
  tabText: { fontSize: 12, fontWeight: '800', color: '#52525b' },
  tabTextActive: { color: '#fff' },
  tabHint: { fontSize: 13, color: '#a1a1aa', lineHeight: 20, paddingHorizontal: 20, paddingTop: 14, marginBottom: 14 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  playerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  playerInitial: { fontSize: 20, fontWeight: '800', color: '#fff' },
  playerName: { fontSize: 14, fontWeight: '800', color: '#fff' },
  playerMeta: { fontSize: 12, color: '#a1a1aa', marginTop: 2 },
  badgeSquaddOn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100, backgroundColor: LIME_DIM, borderWidth: 1, borderColor: 'rgba(163,230,53,0.3)' },
  badgeSquaddOnText: { fontSize: 10, fontWeight: '800', color: LIME },
  inviteBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1.5, borderColor: LIME },
  invitedBtn: { backgroundColor: LIME_DIM },
  inviteBtnText: { fontSize: 12, fontWeight: '800', color: LIME },
  resendBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1.5, borderColor: GOLD },
  resendBtnText: { fontSize: 12, fontWeight: '800', color: GOLD },
  inSquadBlock: { alignItems: 'flex-end' },
  inSquadText: { fontSize: 12, fontWeight: '800', color: '#52525b' },
  inSquadName: { fontSize: 10, fontWeight: '600', color: '#3f3f46', maxWidth: 80, textAlign: 'right' },
  searchInput: { backgroundColor: '#1e1e1e', borderWidth: 2, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 14, color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  emptyState: { alignItems: 'center', paddingTop: 28 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#a1a1aa' },
  emptyHint: { fontSize: 12, color: '#52525b', marginTop: 4, textAlign: 'center', lineHeight: 18 },
  stickyCta: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 10, backgroundColor: '#0a0a0a' },
  stickyCtaGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
  stickyCtaText: { fontSize: 16, fontWeight: '900', color: '#000' },
  shareBtn: { marginBottom: 8 },
  shareBtnGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
  shareBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
  shareLinkHint: { fontSize: 11, color: '#52525b', textAlign: 'center', lineHeight: 18 },
});
