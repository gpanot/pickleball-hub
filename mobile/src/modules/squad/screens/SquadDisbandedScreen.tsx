import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SquadDisbandedShieldIcon } from '../components/SquadDisbandedShieldIcon';
import type { SquadDisbandedNotice } from '../types';

const BANGERS = 'Bangers_400Regular';
const RED = '#ef4444';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface Props {
  notice: SquadDisbandedNotice;
  onCreateSquad: () => void;
  onBrowseSquads: () => void;
}

const KEEP_ITEMS = [
  { emoji: '⚡', text: 'All XP earned — stays on your lifetime profile' },
  { emoji: '🏓', text: 'All sessions recorded — still count toward your stats' },
  { emoji: '👥', text: 'Your crew — they\'re still in your Circle' },
];

export function SquadDisbandedScreen({ notice, onCreateSquad, onBrowseSquads }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.headerTitle}>SQUAD DISBANDED</Text>

        <View style={s.iconWrap}>
          <SquadDisbandedShieldIcon size={88} />
        </View>

        <Text style={s.headline}>{notice.squadName} IS GONE.</Text>
        <Text style={s.subtext}>
          <Text style={s.founderName}>{notice.founderName}</Text>
          {' disbanded the squad. Your XP and sessions are safe — they stay on your profile.'}
        </Text>

        <View style={s.keepSection}>
          <Text style={s.keepTitle}>WHAT YOU KEEP</Text>
          <View style={s.keepCard}>
            {KEEP_ITEMS.map((item, index) => (
              <View
                key={item.text}
                style={[s.keepRow, index < KEEP_ITEMS.length - 1 && s.keepRowBorder]}
              >
                <Text style={s.keepEmoji}>{item.emoji}</Text>
                <Text style={s.keepText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.cooldownBanner}>
          <Text style={s.cooldownText}>
            7-day cooldown before you can join or create a new squad. You can still browse squads.
          </Text>
        </View>

        <TouchableOpacity onPress={onCreateSquad} activeOpacity={0.8}>
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.primaryGrad}>
            <Text style={s.primaryText}>Create your own squad →</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={s.secondaryBtn} onPress={onBrowseSquads} activeOpacity={0.7}>
          <Text style={s.secondaryText}>Browse squads near me</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingHorizontal: 24 },
  headerTitle: {
    fontFamily: BANGERS,
    fontSize: 28,
    color: RED,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 20,
  },
  iconWrap: { alignItems: 'center', marginBottom: 24 },
  headline: {
    fontSize: 26,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtext: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  founderName: { color: '#fff', fontWeight: '700' },
  keepSection: { marginBottom: 16 },
  keepTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52525b',
    letterSpacing: 1,
    marginBottom: 10,
  },
  keepCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  keepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  keepRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  keepEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  keepText: { flex: 1, fontSize: 13, color: '#d4d4d8', lineHeight: 20 },
  cooldownBanner: {
    backgroundColor: 'rgba(250,204,21,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.25)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  cooldownText: { fontSize: 12, color: GOLD, textAlign: 'center', lineHeight: 18 },
  primaryGrad: { paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 10 },
  primaryText: { fontSize: 16, fontWeight: '900', color: '#000' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
