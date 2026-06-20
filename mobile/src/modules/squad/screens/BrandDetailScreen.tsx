import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadBackButton } from '../components/SquadBackButton';
import { BrandTokenIcon } from '../components/TokenIcons';
import type { PlayerBrandData } from '../types';

const PURPLE = '#a78bfa';
const BLUE = '#60a5fa';
const LIME = '#a3e635';
const GOLD = '#facc15';

const BRAND_LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500, 11500];

function getXpProgress(xp: number, level: number) {
  const prev = BRAND_LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = BRAND_LEVEL_THRESHOLDS[level] ?? prev + 3000;
  const progress = Math.min(1, (xp - prev) / Math.max(1, next - prev));
  return { prev, next, progress, toNext: Math.max(0, next - xp) };
}

const LEVEL_BONUSES: Array<{ pvp: number; territory: number; label: string }> = [
  { pvp: 0, territory: 0, label: 'Beginner' },
  { pvp: 5, territory: 5, label: 'Rookie' },
  { pvp: 10, territory: 10, label: 'Amateur' },
  { pvp: 15, territory: 15, label: 'Semi-Pro' },
  { pvp: 20, territory: 20, label: 'Pro' },
  { pvp: 25, territory: 28, label: 'Elite' },
  { pvp: 30, territory: 35, label: 'Expert' },
  { pvp: 38, territory: 42, label: 'Master' },
  { pvp: 45, territory: 50, label: 'Grand Master' },
  { pvp: 55, territory: 60, label: 'Legend' },
  { pvp: 65, territory: 75, label: 'GOAT' },
];

function PaddleLevelsModal({ visible, currentLevel, currentXp, onClose }: {
  visible: boolean;
  currentLevel: number;
  currentXp: number;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ms.overlay}>
        <TouchableOpacity style={ms.overlayBg} onPress={onClose} activeOpacity={1} />
        <View style={ms.sheet}>
          <View style={ms.handle} />
          <View style={ms.header}>
            <Text style={ms.headerTitle}>🏓 Paddle Levels</Text>
            <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
              <Text style={ms.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={ms.headerSub}>Your progression & unlockable bonuses</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ms.content}>
            {BRAND_LEVEL_THRESHOLDS.map((xpRequired, idx) => {
              const level = idx + 1;
              const bonus = LEVEL_BONUSES[idx] ?? LEVEL_BONUSES[LEVEL_BONUSES.length - 1];
              const isCurrent = level === currentLevel;
              const isUnlocked = currentLevel >= level;
              const nextXp = BRAND_LEVEL_THRESHOLDS[idx + 1] ?? xpRequired + 3000;
              const progress = isCurrent
                ? Math.min(1, (currentXp - xpRequired) / Math.max(1, nextXp - xpRequired))
                : 0;

              return (
                <View key={level} style={[ms.levelRow, isCurrent && ms.levelRowCurrent]}>
                  <View style={[ms.levelBadge, isUnlocked ? ms.levelBadgeUnlocked : ms.levelBadgeLocked]}>
                    <Text style={[ms.levelBadgeText, isUnlocked && ms.levelBadgeTextUnlocked]}>
                      {isUnlocked ? level : '🔒'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={ms.levelTopRow}>
                      <Text style={[ms.levelName, isUnlocked && ms.levelNameUnlocked]}>{bonus.label}</Text>
                      {isCurrent && <View style={ms.currentBadge}><Text style={ms.currentBadgeText}>YOU</Text></View>}
                    </View>
                    <Text style={ms.levelXp}>{xpRequired.toLocaleString()} XP</Text>
                    {isCurrent && (
                      <View style={ms.progressTrack}>
                        <View style={[ms.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
                      </View>
                    )}
                    <View style={ms.bonusRow}>
                      <Text style={ms.bonusText}>⚔️ +{bonus.pvp}% PvP</Text>
                      <Text style={ms.bonusText}>🗺 +{bonus.territory}% INF</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const BRAND_NAMES: Record<string, string> = {
  joola: 'JOOLA', selkirk: 'Selkirk', gearbox: 'Gearbox',
  six_zero: 'Six Zero', crbn: 'CRBN', vatic_pro: 'Vatic Pro',
};

const BRAND_EMOJIS: Record<string, string> = {
  joola: '⚡', selkirk: '🛡', gearbox: '🔁',
  six_zero: '🤝', crbn: '💥', vatic_pro: '🌱',
};

interface Props {
  brandData: PlayerBrandData;
  brandTokens: number;
  onSwitchBrand: () => void;
  onBack: () => void;
}

export function BrandDetailScreen({ brandData, brandTokens, onSwitchBrand, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [showLevels, setShowLevels] = useState(false);
  const { prev, next, progress, toNext } = getXpProgress(brandData.brandXp, brandData.supportLevel);
  const brandName = BRAND_NAMES[brandData.brand] ?? brandData.brand;
  const brandEmoji = BRAND_EMOJIS[brandData.brand] ?? '🏓';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <View style={s.topBar}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Paddle Brand</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroCard}>
          <Text style={s.heroEmoji}>{brandEmoji}</Text>
          <Text style={s.heroName}>{brandName}</Text>
          <Text style={s.heroLevel}>Support Level {brandData.supportLevel}</Text>

          {/* XP bar */}
          <View style={s.xpBarWrap}>
            <View style={[s.xpBarFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={s.xpText}>
            {brandData.brandXp.toLocaleString()} XP · {toNext} to Level {brandData.supportLevel + 1}
          </Text>
        </View>

        {/* Bonus rows */}
        <Text style={s.sectionLabel}>ACTIVE BONUSES</Text>
        <View style={s.bonusCard}>
          <View style={s.bonusRow}>
            <Text style={s.bonusIcon}>⚔️</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bonusTitle}>PvP Reward</Text>
              <Text style={s.bonusSub}>Extra loot from battles</Text>
            </View>
            <Text style={[s.bonusValue, { color: BLUE }]}>+{brandData.bonuses.pvpRewardPct}%</Text>
          </View>
          <View style={[s.bonusRow, { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }]}>
            <Text style={s.bonusIcon}>🗺</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.bonusTitle}>Territory INF</Text>
              <Text style={s.bonusSub}>Influence at captured venues</Text>
            </View>
            <Text style={[s.bonusValue, { color: PURPLE }]}>+{brandData.bonuses.territoryInfPct}%</Text>
          </View>
        </View>

        {/* Wallet */}
        <Text style={s.sectionLabel}>BRAND TOKENS</Text>
        <View style={s.walletCard}>
          <BrandTokenIcon size={36} />
          <View style={{ flex: 1 }}>
            <Text style={s.walletAmount}>{brandTokens.toLocaleString()}</Text>
            <Text style={s.walletSub}>Tokens auto-apply as Brand XP when you open chests</Text>
          </View>
        </View>

        {/* See Levels */}
        <Text style={s.sectionLabel}>MY PROGRESSION</Text>
        <TouchableOpacity style={s.seeLevelsCard} onPress={() => setShowLevels(true)} activeOpacity={0.75}>
          <View style={s.seeLevelsLeft}>
            <Text style={s.seeLevelsTitle}>See all {BRAND_LEVEL_THRESHOLDS.length} Levels</Text>
            <Text style={s.seeLevelsSub}>Track your paddle journey & upcoming bonuses</Text>
          </View>
          <View style={s.seeLevelsBadge}>
            <Text style={s.seeLevelsBadgeText}>Lvl {brandData.supportLevel} / {BRAND_LEVEL_THRESHOLDS.length}</Text>
          </View>
          <Text style={s.seeLevelsCaret}>›</Text>
        </TouchableOpacity>

        {/* Switch */}
        <TouchableOpacity style={s.switchBtn} onPress={onSwitchBrand} activeOpacity={0.7}>
          <Text style={s.switchText}>Switch Paddle Brand</Text>
          <Text style={s.switchSub}>Resets Level + XP, tokens carry over</Text>
        </TouchableOpacity>
      </ScrollView>

      <PaddleLevelsModal
        visible={showLevels}
        currentLevel={brandData.supportLevel}
        currentXp={brandData.brandXp}
        onClose={() => setShowLevels(false)}
      />
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
  heroCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 18, padding: 24, alignItems: 'center',
  },
  heroEmoji: { fontSize: 48, marginBottom: 8 },
  heroName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 2 },
  heroLevel: { fontSize: 14, color: PURPLE, fontWeight: '700', marginBottom: 16 },
  xpBarWrap: {
    width: '100%', height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden', marginBottom: 8,
  },
  xpBarFill: { height: 6, backgroundColor: PURPLE, borderRadius: 3 },
  xpText: { fontSize: 12, color: '#71717a', fontWeight: '600' },
  sectionLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1 },
  bonusCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden',
  },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  bonusIcon: { fontSize: 20 },
  bonusTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  bonusSub: { fontSize: 11, color: '#71717a', marginTop: 1 },
  bonusValue: { fontSize: 18, fontWeight: '900' },
  walletCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(167,139,250,0.15)',
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  walletAmount: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 2 },
  walletSub: { fontSize: 11, color: '#71717a', lineHeight: 16 },
  switchBtn: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 14, padding: 16, alignItems: 'center',
  },
  switchText: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  switchSub: { fontSize: 11, color: '#71717a', marginTop: 2 },

  // See Levels card
  seeLevelsCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  seeLevelsLeft: { flex: 1 },
  seeLevelsTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  seeLevelsSub: { fontSize: 11, color: '#71717a', marginTop: 2, lineHeight: 16 },
  seeLevelsBadge: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100,
  },
  seeLevelsBadgeText: { fontSize: 11, fontWeight: '900', color: PURPLE },
  seeLevelsCaret: { fontSize: 18, color: '#52525b' },
});

// Modal styles
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  overlayBg: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: '#0d0d0d',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%', paddingBottom: 32,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#2a2a2a',
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 6, marginBottom: 4,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: '#fff' },
  headerSub: { fontSize: 13, color: '#71717a', paddingHorizontal: 20, marginBottom: 16 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: '#a1a1aa', fontWeight: '700' },
  content: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  levelRow: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 14,
  },
  levelRowCurrent: {
    borderColor: 'rgba(167,139,250,0.4)',
    backgroundColor: 'rgba(167,139,250,0.07)',
  },
  levelBadge: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
  },
  levelBadgeUnlocked: { backgroundColor: 'rgba(167,139,250,0.2)' },
  levelBadgeLocked: { backgroundColor: '#1a1a1a' },
  levelBadgeText: { fontSize: 15, fontWeight: '900', color: '#52525b' },
  levelBadgeTextUnlocked: { color: PURPLE },
  levelTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  levelName: { fontSize: 14, fontWeight: '800', color: '#52525b' },
  levelNameUnlocked: { color: '#fff' },
  currentBadge: {
    backgroundColor: PURPLE, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 100,
  },
  currentBadgeText: { fontSize: 10, fontWeight: '900', color: '#000' },
  levelXp: { fontSize: 11, color: '#52525b', marginBottom: 6 },
  progressTrack: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2, overflow: 'hidden', marginBottom: 6,
  },
  progressFill: { height: '100%', backgroundColor: PURPLE, borderRadius: 2 },
  bonusRow: { flexDirection: 'row', gap: 12 },
  bonusText: { fontSize: 11, fontWeight: '700', color: '#71717a' },
});
