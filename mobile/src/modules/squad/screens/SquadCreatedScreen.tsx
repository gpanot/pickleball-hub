import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SquadShareCard } from '../components/SquadShareCard';
import { SquadBackButton } from '../components/SquadBackButton';
import { useAuthStore } from '../../../stores/authStore';
import { shareLink } from '../api';
import type { Squad } from '../types';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface InviteResultPlayer { name: string; }

interface Props {
  squad: Squad;
  inviteResult: { invited: InviteResultPlayer[]; notOnApp: InviteResultPlayer[] } | null;
  onGoToSquad: () => void;
  onInviteMore: () => void;
  onBack: () => void;
}

/** "Sarah, John and Mai" — Oxford-style list join */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function SquadCreatedScreen({ squad, inviteResult, onGoToSquad, onInviteMore, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(0.3)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const founderName = useAuthStore.getState().displayName ?? 'You';
  const founderDupr = useAuthStore.getState().duprRating;
  const [founderNickname, setFounderNickname] = useState<string | null>(null);
  const founderHandle = founderNickname ? `@${founderNickname}` : founderName;
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 50, friction: 5 }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    // Load founder nickname
    useAuthStore.getState().authedFetch('/api/squads/nickname').then(async (r) => {
      if (r.ok) { const d = await r.json(); if (d.current) setFounderNickname(d.current); }
    }).catch(() => {});
    // Pre-fetch the share link so it's ready when user taps share
    shareLink(squad.id).then((d) => {
      setJoinUrl(d.url);
      if (d.cardUrl) setCardUrl(d.cardUrl);
    }).catch(() => {});
  }, [scale, opacity, squad.id]);

  const invitedNames = inviteResult?.invited.map((i) => i.name) ?? [];
  const notOnAppNames = inviteResult?.notOnApp.map((i) => i.name) ?? [];
  const hasInvited = invitedNames.length > 0;
  const hasNotOnApp = notOnAppNames.length > 0;

  const handleShare = async () => {
    const code = squad.code?.code ?? '';
    const url = joinUrl ?? `https://hub.thecourtflow.com/join/${code}`;
    // cardUrl is the server-generated OG image — iOS Share sheet renders it
    // as a rich image preview; Android ignores the url field so the message
    // text carries the link.
    const shareUrl = cardUrl ?? url;
    try {
      await Share.share({
        message: `${squad.emoji} ${founderHandle} invites you to join ${squad.name} on SQUADD!\n${url}`,
        url: shareUrl,
      });
    } catch {}
  };

  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Squad created</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Celebration */}
        <Animated.View style={[s.celebrationWrap, { opacity, transform: [{ scale }] }]}>
          <Text style={{ fontSize: 56, textAlign: 'center' }}>{squad.emoji}</Text>
        </Animated.View>

        <Animated.Text style={[s.headline, { opacity }]}>
          {squad.name.toUpperCase()} IS LIVE
        </Animated.Text>

        <Animated.Text style={[s.subtitle, { opacity }]}>
          {hasInvited
            ? `Invites sent to ${joinNames(invitedNames)}.\nNow get the rest of your crew in.`
            : 'Your squad is live. Invite your crew to start earning together.'}
        </Animated.Text>

        {/* Not-on-app card */}
        {hasNotOnApp && (
          <View style={s.notOnAppCard}>
            <Text style={s.notOnAppTitle}>
              {joinNames(notOnAppNames)} aren't on Squadd yet
            </Text>
            <View style={s.pillRow}>
              {notOnAppNames.map((name) => (
                <View key={name} style={s.pill}>
                  <View style={s.pillDot} />
                  <Text style={s.pillText}>{name}</Text>
                </View>
              ))}
            </View>
            <Text style={s.notOnAppHint}>
              Ask them to join your squad by sharing this card. It's free.
            </Text>
          </View>
        )}

        {/* Invite card — client-side rendered, works on iOS & Android */}
        <SquadShareCard
          squad={squad}
          founderHandle={founderHandle}
          founderDupr={founderDupr}
          joinUrl={joinUrl}
        />

        {/* Share invite CTA — prominent when there are not-on-app players */}
        <TouchableOpacity
          style={s.primaryWrap}
          onPress={handleShare}
          activeOpacity={0.8}
        >
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.primaryGrad}>
            <Text style={s.primaryText}>Share invite card →</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={s.shareLinkHint}>
          Deep-link survives install · auto-shows squad on first open
        </Text>

        {/* WHEN THEY INSTALL section */}
        <View style={s.whenCard}>
          <Text style={s.whenTitle}>WHEN THEY INSTALL SQUADD</Text>
          <View style={s.whenRow}>
            <Text style={s.whenEmoji}>🔔</Text>
            <Text style={s.whenText}>
              They get notified:{' '}
              <Text style={s.whenQuote}>"{founderHandle} invited you to {squad.name}"</Text>
            </Text>
          </View>
          <View style={s.whenRow}>
            <Text style={s.whenEmoji}>👥</Text>
            <Text style={s.whenText}>You appear first in their Players you may know</Text>
          </View>
          <View style={s.whenRow}>
            <Text style={s.whenEmoji}>{squad.emoji}</Text>
            <Text style={s.whenText}>
              {squad.name} pinned top of squad suggestions — one tap to join
            </Text>
          </View>
        </View>

        {/* Go to squad */}
        <TouchableOpacity style={s.goToSquadBtn} onPress={onGoToSquad} activeOpacity={0.8}>
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.primaryGrad}>
            <Text style={s.primaryText}>Go to my squad →</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={onInviteMore} activeOpacity={0.7}>
          <Text style={s.secondaryText}>Invite more players</Text>
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
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  content: { padding: 24 },
  celebrationWrap: { alignItems: 'center', marginBottom: 12 },
  headline: {
    fontFamily: BANGERS,
    fontSize: 30,
    color: GOLD,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  // Not-on-app card
  notOnAppCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  notOnAppTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d4d4d8',
    marginBottom: 10,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e1e1e',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ef4444' },
  pillText: { fontSize: 13, fontWeight: '700', color: '#d4d4d8' },
  notOnAppHint: { fontSize: 12, color: '#71717a', lineHeight: 18 },
  // Share link hint
  shareLinkHint: {
    fontSize: 11,
    color: '#52525b',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 16,
  },
  // WHEN THEY INSTALL card
  whenCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  whenTitle: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#52525b',
    marginBottom: 14,
  },
  whenRow: { flexDirection: 'row', gap: 12, paddingVertical: 7 },
  whenEmoji: { fontSize: 18 },
  whenText: { flex: 1, fontSize: 13, color: '#a1a1aa', lineHeight: 20 },
  whenQuote: { fontStyle: 'italic', color: '#d4d4d8' },
  // CTAs
  primaryWrap: { marginBottom: 4 },
  goToSquadBtn: { marginBottom: 10 },
  primaryGrad: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
  },
  primaryText: { fontSize: 16, fontWeight: '900', color: '#000' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
});
