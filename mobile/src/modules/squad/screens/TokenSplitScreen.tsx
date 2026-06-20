import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { ClubTokenIcon, BrandTokenIcon } from '../components/TokenIcons';

const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan small.png');
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../stores/authStore';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const GOLD = '#facc15';
const PURPLE = '#a78bfa';
const BLUE = '#60a5fa';

// 5 discrete steps: 0, 25, 50, 75, 100%
const STEPS = [0, 0.25, 0.5, 0.75, 1];

const SQUAD_LEVEL_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];
const BRAND_LEVEL_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500, 11500];

function getSquadTokensToNextLevel(totalXp: number, level: number): number {
  const next = SQUAD_LEVEL_THRESHOLDS[level] ?? (SQUAD_LEVEL_THRESHOLDS[level - 1] ?? 0) + 4000;
  return Math.max(0, next - totalXp);
}

function getBrandTokensToNextLevel(brandXp: number, supportLevel: number): number {
  const next = BRAND_LEVEL_THRESHOLDS[supportLevel] ?? BRAND_LEVEL_THRESHOLDS[BRAND_LEVEL_THRESHOLDS.length - 1] + 3000;
  return Math.max(0, next - brandXp);
}

export interface NextLevelInfo {
  paddleLevel: number;
  paddleTokensToNext: number;
  clubhouseTokensToNext: number;
  teamXpToNext: number;
}

interface Props {
  squadId: string;
  squadName: string;
  squadEmoji: string;
  totalClubTokens: number;
  brandTokensAwarded?: number;
  xpAwarded?: number;
  brandName?: string | null;
  nextLevel?: NextLevelInfo | null;
  onConfirmExtra?: () => Promise<void>;
  onDone: () => void;
}

export function TokenSplitScreen({ squadId, squadName, squadEmoji, totalClubTokens, brandTokensAwarded, xpAwarded, brandName, nextLevel, onConfirmExtra, onDone }: Props) {
  const insets = useSafeAreaInsets();
  // Default: 50% donate (step index 2)
  const [stepIdx, setStepIdx] = useState(2);
  const [confirming, setConfirming] = useState(false);

  const donateRatio = STEPS[stepIdx] ?? 0.5;
  const donateAmount = Math.floor(totalClubTokens * donateRatio);
  const keepAmount = totalClubTokens - donateAmount;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      if (donateAmount > 0) {
        await useAuthStore.getState().authedFetch('/api/wallet/donate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ squadId, clubTokens: donateAmount }),
        });
      }
      if (onConfirmExtra) await onConfirmExtra();
      onDone();
    } catch {
      // Silent — tokens stay in wallet, player can donate later
      onDone();
    }
    setConfirming(false);
  };

  const pct = Math.round(donateRatio * 100);

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        <View style={[s.header, { paddingTop: insets.top + 20 }]}>
          <Text style={s.title}>Split your Club Tokens</Text>
          <Text style={s.sub}>Donate some to boost {squadEmoji} {squadName}'s XP, or keep them for yourself.</Text>
        </View>

        <View style={s.body}>
          {/* Token type info cards */}
          <View style={s.tokenInfoRow}>
            {/* Club Tokens card */}
            <View style={[s.tokenInfoCard, { borderColor: 'rgba(96,165,250,0.25)' }]}>
              <View style={s.tokenInfoHeader}>
                <ClubTokenIcon size={22} />
                <Text style={[s.tokenInfoTitle, { color: BLUE }]}>CLUB TOKENS</Text>
              </View>
              <Text style={s.tokenInfoDesc}>Upgrade and level up your Clubhouse</Text>
              <View style={s.tokenInfoDivider} />
              <Text style={[s.tokenInfoSectionLabel, { color: BLUE }]}>YOU CAN:</Text>
              <Text style={s.tokenInfoBullet}>🏛 Donate to Clubhouse</Text>
              <Text style={s.tokenInfoBullet}>🎯 Keep for boosts</Text>
              <Text style={s.tokenInfoBullet}>⏩ Skip chest timers</Text>
            </View>

            {/* Brand Tokens card */}
            <View style={[s.tokenInfoCard, { borderColor: 'rgba(167,139,250,0.25)' }]}>
              <View style={s.tokenInfoHeader}>
                <BrandTokenIcon size={22} />
                <Text style={[s.tokenInfoTitle, { color: PURPLE }]}>BRAND{'\n'}TOKENS</Text>
              </View>
              <Text style={s.tokenInfoDesc}>Level up your paddle brand</Text>
              <View style={s.tokenInfoDivider} />
              <Text style={[s.tokenInfoSectionLabel, { color: PURPLE }]}>ALWAYS PERSONAL:</Text>
              <Text style={s.tokenInfoBullet}>⚡ Stronger battles</Text>
              <Text style={s.tokenInfoBullet}>🏆 Unlock bonuses</Text>
              <Text style={s.tokenInfoBullet}>🎨 Cosmetics</Text>
            </View>
          </View>

          {/* Chest summary */}
          <View style={s.chestSummary}>
            <Image source={CHEST_IMAGE} style={s.chestSummaryImg} resizeMode="contain" />
            <Text style={s.chestSummaryText}>This chest gave you</Text>
            <View style={s.chestSummaryTokens}>
              <ClubTokenIcon size={18} />
              <Text style={[s.chestSummaryAmount, { color: BLUE }]}>{totalClubTokens}</Text>
              {(brandTokensAwarded ?? 0) > 0 && (
                <>
                  <BrandTokenIcon size={18} />
                  <Text style={[s.chestSummaryAmount, { color: PURPLE }]}>{brandTokensAwarded}</Text>
                </>
              )}
              {(xpAwarded ?? 0) > 0 && (
                <>
                  <Text style={s.chestSummaryXpStar}>⭐</Text>
                  <Text style={[s.chestSummaryAmount, { color: GOLD }]}>{xpAwarded} XP</Text>
                </>
              )}
            </View>
          </View>

          {/* Visual split */}
          <View style={s.splitCard}>
            <View style={s.splitRow}>
              <View style={s.splitCol}>
                <ClubTokenIcon size={32} />
                <Text style={s.splitAmount}>{keepAmount}</Text>
                <Text style={s.splitLabel}>You keep</Text>
              </View>
              <View style={s.divider} />
              <View style={s.splitCol}>
                <Text style={{ fontSize: 28, marginBottom: 4 }}>{squadEmoji}</Text>
                <Text style={[s.splitAmount, { color: LIME }]}>{donateAmount}</Text>
                <Text style={s.splitLabel}>Donate to Squad</Text>
              </View>
            </View>

            <Text style={s.splitPct}>{pct}% donated</Text>

            {/* 5-step dot selector instead of continuous slider */}
            <View style={s.stepsRow}>
              {STEPS.map((step, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[s.stepBtn, idx === stepIdx && s.stepBtnActive]}
                  onPress={() => setStepIdx(idx)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.stepLabel, idx === stepIdx && s.stepLabelActive]}>
                    {Math.round(step * 100)}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.sliderLabels}>
              <Text style={s.sliderLabel}>Keep all</Text>
              <Text style={s.sliderLabel}>Donate all</Text>
            </View>
          </View>

          {/* Brand token auto-award strip */}
          {(brandTokensAwarded ?? 0) > 0 && (
            <View style={s.brandAutoStrip}>
              <BrandTokenIcon size={22} />
              <View style={{ flex: 1 }}>
                <Text style={s.brandAutoTitle}>
                  +{brandTokensAwarded} Brand Tokens
                  {brandName ? ` → ${brandName.toUpperCase()}` : ''}
                </Text>
                <Text style={s.brandAutoSub}>Automatically applied · Always personal</Text>
              </View>
              <View style={s.brandAutoBadge}>
                <Text style={s.brandAutoBadgeText}>AUTO</Text>
              </View>
            </View>
          )}

          {/* Next Level section */}
          {nextLevel && (
            <View style={s.nextLevelCard}>
              <Text style={s.nextLevelTitle}>🎯 NEXT LEVEL</Text>
              <View style={s.nextLevelRows}>
                <View style={s.nextLevelRow}>
                  <Text style={s.nextLevelIcon}>🏓</Text>
                  <Text style={s.nextLevelLabel}>Lvl {nextLevel.paddleLevel + 1} Paddle in</Text>
                  <Text style={[s.nextLevelValue, { color: PURPLE }]}>{nextLevel.paddleTokensToNext} tokens</Text>
                </View>
                <View style={[s.nextLevelRow, s.nextLevelRowBorder]}>
                  <Text style={s.nextLevelIcon}>🏛</Text>
                  <Text style={s.nextLevelLabel}>Next Clubhouse in</Text>
                  <Text style={[s.nextLevelValue, { color: BLUE }]}>{nextLevel.clubhouseTokensToNext} tokens</Text>
                </View>
                <View style={[s.nextLevelRow, s.nextLevelRowBorder]}>
                  <Text style={s.nextLevelIcon}>⚡</Text>
                  <Text style={s.nextLevelLabel}>Next Team in</Text>
                  <Text style={[s.nextLevelValue, { color: GOLD }]}>{nextLevel.teamXpToNext} XP</Text>
                </View>
              </View>
              <Text style={s.nextLevelHint}>
                Donating {donateAmount} tokens = +{donateAmount} Squad XP
              </Text>
            </View>
          )}

        </View>
      </ScrollView>

      <View style={s.bottom}>
        <TouchableOpacity onPress={handleConfirm} disabled={confirming} activeOpacity={0.8}>
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.confirmGrad}>
            {confirming ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.confirmText}>
                {donateAmount > 0
                  ? `Donate ${donateAmount} · Keep ${keepAmount} →`
                  : `Keep all ${totalClubTokens} tokens →`}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { paddingHorizontal: 24, marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 6 },
  sub: { fontSize: 14, color: '#71717a', lineHeight: 20 },
  body: { paddingHorizontal: 24, gap: 12 },
  splitCard: {
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18, padding: 20,
  },
  splitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  splitCol: { flex: 1, alignItems: 'center', gap: 4 },
  divider: { width: 1, height: 60, backgroundColor: 'rgba(255,255,255,0.07)' },
  splitAmount: { fontSize: 28, fontWeight: '900', color: '#fff' },
  splitLabel: { fontSize: 12, color: '#71717a', fontWeight: '600' },
  splitPct: { fontSize: 13, fontWeight: '800', color: '#a1a1aa', textAlign: 'center', marginBottom: 16 },
  // 5-step selector
  stepsRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginBottom: 8,
  },
  stepBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: '#1e1e1e',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  stepBtnActive: {
    backgroundColor: 'rgba(163,230,53,0.15)',
    borderColor: LIME,
  },
  stepLabel: { fontSize: 12, fontWeight: '800', color: '#52525b' },
  stepLabelActive: { color: LIME },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sliderLabel: { fontSize: 11, color: '#52525b', fontWeight: '600' },
  // Next level card
  nextLevelCard: {
    backgroundColor: '#111',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 16,
  },
  nextLevelTitle: {
    fontSize: 11, fontWeight: '900', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
  },
  nextLevelRows: { gap: 0 },
  nextLevelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  nextLevelRowBorder: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)',
  },
  nextLevelIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  nextLevelLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#a1a1aa' },
  nextLevelValue: { fontSize: 14, fontWeight: '900' },
  nextLevelHint: {
    fontSize: 11, color: '#52525b', marginTop: 12,
    fontWeight: '600', textAlign: 'center',
  },
  bottom: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 0 },
  confirmGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#365314' },
  confirmText: { fontSize: 16, fontWeight: '900', color: '#000' },

  // Token type info cards
  tokenInfoRow: { flexDirection: 'row', gap: 10 },
  tokenInfoCard: {
    flex: 1, backgroundColor: '#111',
    borderWidth: 1, borderRadius: 16, padding: 14, gap: 6,
  },
  tokenInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  tokenInfoTitle: {
    fontSize: 12, fontWeight: '900', letterSpacing: 0.3, lineHeight: 15,
  },
  tokenInfoDesc: { fontSize: 12, color: '#71717a', lineHeight: 16 },
  tokenInfoDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 4 },
  tokenInfoSectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  tokenInfoBullet: { fontSize: 12, color: '#a1a1aa', lineHeight: 20 },

  // Chest summary bar
  chestSummary: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  chestSummaryText: { fontSize: 13, color: '#a1a1aa', fontWeight: '600', flex: 1 },
  chestSummaryTokens: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chestSummaryImg: { width: 32, height: 32 },
  chestSummaryAmount: { fontSize: 16, fontWeight: '900' },
  chestSummaryXpStar: { fontSize: 15 },

  // Brand auto-award strip
  brandAutoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(107,33,168,0.15)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
  },
  brandAutoTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  brandAutoSub: { fontSize: 11, color: '#71717a', marginTop: 2 },
  brandAutoBadge: {
    backgroundColor: 'rgba(167,139,250,0.2)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
  },
  brandAutoBadgeText: { fontSize: 11, fontWeight: '900', color: PURPLE },
});
