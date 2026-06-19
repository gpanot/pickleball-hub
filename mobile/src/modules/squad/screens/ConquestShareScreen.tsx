import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SquadBackButton } from '../components/SquadBackButton';
import type { ConquestImpactBreakdown } from '../types';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const GOLD = '#facc15';
const RED = '#ef4444';

interface Props {
  data: ConquestImpactBreakdown;
  mySquadName: string;
  mySquadEmoji: string;
  mySquadId: string;
  onBack: () => void;
}

export function ConquestShareScreen({
  data, mySquadName, mySquadEmoji, mySquadId, onBack,
}: Props) {
  const insets = useSafeAreaInsets();

  const battleWins = data.battles.filter(b => b.winnerSquadId === mySquadId).length;
  const battleTotal = data.battles.length;

  const shareText = [
    `${mySquadEmoji} ${mySquadName} just dominated ${data.venueName}`,
    `+${data.totalInf} INF earned`,
    battleTotal > 0 ? `Battle record: ${battleWins}/${battleTotal}` : null,
    data.rivalSquadName ? `Took down ${data.rivalSquadEmoji ?? ''} ${data.rivalSquadName}` : null,
    data.venueRank ? `Venue rank: #${data.venueRank}` : null,
    '',
    '🏓 SQUADD app — compete for venue dominance',
  ].filter(Boolean).join('\n');

  const handleShare = async () => {
    try {
      await Share.share({ message: shareText });
    } catch {
      // dismissed
    }
  };

  const handleInstagram = () => handleShare();
  const handleWhatsApp = () => handleShare();
  const handleCopy = async () => {
    // Clipboard.setStringAsync(shareText); — if expo-clipboard is available
    await handleShare();
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <SquadBackButton onPress={onBack} />
        <View style={s.headerCenter}>
          <Text style={s.headerSub}>📤 CONQUEST RESULTS</Text>
          <Text style={s.headerTitle}>Share your win</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* The share card */}
        <View style={s.cardWrap}>
          <ConquestShareCard
            squadEmoji={mySquadEmoji}
            squadName={mySquadName}
            venueName={data.venueName}
            totalInf={data.totalInf}
            xpAwarded={data.xpAwarded}
            venueRank={data.venueRank}
            battleWins={battleWins}
            battleTotal={battleTotal}
            rivalName={data.rivalSquadName}
            rivalEmoji={data.rivalSquadEmoji}
          />
        </View>

        {/* Share buttons */}
        <View style={s.shareButtons}>
          <TouchableOpacity style={s.mainShareBtn} onPress={handleShare} activeOpacity={0.82}>
            <Text style={s.mainShareBtnText}>📤 Share Results</Text>
          </TouchableOpacity>
          <View style={s.socialRow}>
            <TouchableOpacity style={s.socialBtn} onPress={handleInstagram} activeOpacity={0.82}>
              <Text style={s.socialBtnText}>📷 Story</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.socialBtn, s.waBtn]} onPress={handleWhatsApp} activeOpacity={0.82}>
              <Text style={s.socialBtnText}>💬 WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.socialBtn} onPress={handleCopy} activeOpacity={0.82}>
              <Text style={s.socialBtnText}>📋 Copy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── The visual share card ──────────────────────────────────────────

interface CardProps {
  squadEmoji: string;
  squadName: string;
  venueName: string;
  totalInf: number;
  xpAwarded: number;
  venueRank: number | null;
  battleWins: number;
  battleTotal: number;
  rivalName: string | null;
  rivalEmoji: string | null;
}

function ConquestShareCard({
  squadEmoji, squadName, venueName, totalInf, xpAwarded,
  venueRank, battleWins, battleTotal, rivalName, rivalEmoji,
}: CardProps) {
  return (
    <LinearGradient
      colors={['#071507', '#050f05', '#030a03']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={c.card}
    >
      {/* Top branding */}
      <View style={c.topBar}>
        <View style={c.brandRow}>
          <Text style={c.ping}>🏓</Text>
          <Text style={c.brand}>SQUADD</Text>
        </View>
        <View style={c.conquestBadge}>
          <Text style={c.conquestBadgeText}>SQUAD CONQUEST</Text>
        </View>
      </View>

      {/* Squad hero */}
      <Text style={c.emoji}>{squadEmoji}</Text>
      <Text style={c.squadName}>{squadName.toUpperCase()}</Text>

      {/* INF big number */}
      <View style={c.infRow}>
        <View style={c.infBox}>
          <Text style={c.infNumber}>+{totalInf}</Text>
          <Text style={c.infLabel}>INF</Text>
        </View>
        {xpAwarded > 0 && (
          <View style={c.xpBox}>
            <Text style={c.xpNumber}>+{xpAwarded}</Text>
            <Text style={c.xpLabel}>XP</Text>
          </View>
        )}
      </View>

      {/* Venue & Rank */}
      <View style={c.venueRow}>
        <Text style={c.venueIcon}>🏟️</Text>
        <Text style={c.venueName}>{venueName}</Text>
        {venueRank && <Text style={c.rankBadge}>#{venueRank}</Text>}
      </View>

      {/* Battle record */}
      {battleTotal > 0 && (
        <View style={c.battleRow}>
          <Text style={c.battleIcon}>⚔️</Text>
          <Text style={c.battleText}>
            {battleWins}/{battleTotal} battles won
            {rivalName ? ` · vs ${rivalEmoji ?? ''} ${rivalName}` : ''}
          </Text>
        </View>
      )}

      {/* Footer */}
      <LinearGradient
        colors={[LIME, LIME_DARK]}
        style={c.footer}
      >
        <Text style={c.footerText}>🏓 Join SQUADD · Compete for venue dominance</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

const c = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderColor: 'rgba(163,230,53,0.3)',
    borderRadius: 20,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ping: { fontSize: 16 },
  brand: { fontFamily: BANGERS, fontSize: 20, color: LIME, letterSpacing: 1 },
  conquestBadge: {
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.3)',
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 3,
  },
  conquestBadgeText: { fontSize: 9, fontWeight: '800', color: LIME, letterSpacing: 1.2 },
  emoji: { fontSize: 52, textAlign: 'center', marginTop: 12, marginBottom: 2 },
  squadName: {
    fontFamily: BANGERS, fontSize: 36, textAlign: 'center',
    color: LIME, letterSpacing: 2, marginBottom: 16, paddingHorizontal: 16,
  },
  infRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 12,
  },
  infBox: {
    flex: 1, alignItems: 'center', backgroundColor: 'rgba(163,230,53,0.08)',
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.25)', borderRadius: 14, padding: 10,
  },
  infNumber: { fontFamily: BANGERS, fontSize: 42, color: LIME, letterSpacing: 1 },
  infLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: LIME, letterSpacing: 1 },
  xpBox: {
    alignItems: 'center', backgroundColor: 'rgba(250,204,21,0.06)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)', borderRadius: 14, padding: 10,
    minWidth: 70,
  },
  xpNumber: { fontFamily: BANGERS, fontSize: 32, color: GOLD },
  xpLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', color: GOLD, letterSpacing: 1 },
  venueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 8,
  },
  venueIcon: { fontSize: 14 },
  venueName: { fontSize: 12, fontWeight: '700', color: '#a1a1aa', flex: 1 },
  rankBadge: {
    fontFamily: BANGERS, fontSize: 16, color: GOLD, marginLeft: 4,
  },
  battleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 16, marginBottom: 12,
  },
  battleIcon: { fontSize: 12 },
  battleText: { fontSize: 12, color: '#a1a1aa', flex: 1 },
  footer: {
    paddingVertical: 12, paddingHorizontal: 16,
    alignItems: 'center', marginTop: 4,
  },
  footerText: { fontSize: 12, fontWeight: '800', color: '#000' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerSub: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', color: LIME,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  scroll: { paddingBottom: 100, paddingTop: 8 },
  cardWrap: { paddingHorizontal: 16, marginBottom: 16 },
  shareButtons: { paddingHorizontal: 16, gap: 10 },
  mainShareBtn: {
    backgroundColor: LIME, borderRadius: 16, padding: 15, alignItems: 'center',
  },
  mainShareBtnText: { fontSize: 15, fontWeight: '900', color: '#000' },
  socialRow: { flexDirection: 'row', gap: 8 },
  socialBtn: {
    flex: 1, backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14,
    padding: 12, alignItems: 'center',
  },
  waBtn: {},
  socialBtnText: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
});
