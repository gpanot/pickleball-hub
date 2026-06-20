import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import { SquadBackButton } from '../components/SquadBackButton';
import type { Squad, PodSummary, PlayerWalletData, PlayerBrandData } from '../types';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const BLUE = '#60a5fa';
const PURPLE = '#a78bfa';
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';

// XP level thresholds — identical to SquadIdentityBar
const LEVEL_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];

function getXpProgress(totalXp: number, level: number): { current: number; threshold: number } {
  let prev = 0;
  let next = 300;
  if (level <= LEVEL_THRESHOLDS.length) {
    prev = LEVEL_THRESHOLDS[level - 1] ?? 0;
    next = LEVEL_THRESHOLDS[level] ?? (prev + 4000);
  } else {
    prev = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1] + (level - LEVEL_THRESHOLDS.length) * 4000;
    next = prev + 4000;
  }
  return { current: totalXp - prev, threshold: next - prev };
}

// Hex token icon (inline — avoids extra import)
const HEX = '14,2 24,7.5 24,20.5 14,26 4,20.5 4,7.5';

function HexIcon({ fill, stroke, label, color, size = 26 }: {
  fill: string; stroke: string; label: string; color: string; size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Polygon points={HEX} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <SvgText
        x={14} y={19} textAnchor="middle"
        fontWeight="900" fontSize={13} fill={color}
      >
        {label}
      </SvgText>
    </Svg>
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

// ── Level thresholds ──────────────────────────────────────────────────────────
const SQUAD_THRESHOLDS = [0, 300, 700, 1400, 2500, 4000, 6000, 8500, 11500, 15000];
const BRAND_THRESHOLDS = [0, 150, 400, 800, 1400, 2200, 3200, 4500, 6200, 8500, 11500];
const BATTLE_MILESTONES = [1, 5, 10, 25, 50, 100, 200, 500];

type ModalType = 'xp' | 'tokens' | 'brand-tokens' | 'battles' | null;

// ── KPI levels modal ──────────────────────────────────────────────────────────
function KpiModal({
  type,
  squad,
  wallet,
  onClose,
}: {
  type: ModalType;
  squad: Squad;
  wallet: PlayerWalletData | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!type) return null;

  const renderContent = () => {
    if (type === 'xp') {
      return (
        <>
          <Text style={m.modalTitle}>⭐ Squad XP Levels</Text>
          <Text style={m.modalSub}>Each level unlocks stronger squad bonuses</Text>
          {SQUAD_THRESHOLDS.map((xp, idx) => {
            const lvl = idx + 1;
            const isUnlocked = squad.totalXp >= xp;
            const isCurrent = squad.level === lvl || (idx === SQUAD_THRESHOLDS.length - 1 && squad.level > SQUAD_THRESHOLDS.length);
            return (
              <View key={idx} style={[m.levelRow, isCurrent && m.levelRowCurrent]}>
                <View style={[m.levelBadge, isUnlocked ? m.levelBadgeUnlocked : m.levelBadgeLocked]}>
                  <Text style={[m.levelBadgeText, isUnlocked ? m.levelBadgeTextUnlocked : m.levelBadgeTextLocked]}>
                    {isUnlocked ? '✓' : lvl}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[m.levelName, isUnlocked && { color: GOLD }]}>Level {lvl}</Text>
                  <Text style={m.levelXp}>{xp.toLocaleString()} XP required</Text>
                </View>
                {isCurrent && <View style={m.currentPill}><Text style={m.currentPillText}>NOW</Text></View>}
              </View>
            );
          })}
        </>
      );
    }

    if (type === 'tokens') {
      const tokens = wallet?.clubTokens ?? 0;
      return (
        <>
          <Text style={m.modalTitle}>🔵 Club Tokens</Text>
          <Text style={m.modalSub}>Use tokens to boost your squad's XP and unlock rewards</Text>
          <View style={m.statBlock}>
            <HexIcon fill="#1d4ed8" stroke="#60a5fa" label="C" color="#93c5fd" size={36} />
            <Text style={[m.statBlockValue, { color: BLUE }]}>{tokens.toLocaleString()}</Text>
            <Text style={m.statBlockLabel}>Your Club Token balance</Text>
          </View>
          <Text style={m.infoText}>💡 Every 1 Club Token donated to your squad = +1 Squad XP</Text>
          {SQUAD_THRESHOLDS.slice(0, squad.level + 2).map((xp, idx) => {
            const lvl = idx + 1;
            const xpNeeded = Math.max(0, xp - squad.totalXp);
            const canReach = tokens >= xpNeeded;
            if (lvl <= squad.level) return null;
            return (
              <View key={idx} style={[m.levelRow, canReach && { borderColor: 'rgba(96,165,250,0.3)' }]}>
                <View style={[m.levelBadge, canReach ? { backgroundColor: 'rgba(96,165,250,0.15)', borderColor: BLUE } : m.levelBadgeLocked]}>
                  <Text style={[m.levelBadgeText, canReach ? { color: BLUE } : m.levelBadgeTextLocked]}>{lvl}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[m.levelName, canReach && { color: BLUE }]}>Level {lvl}</Text>
                  <Text style={m.levelXp}>{xpNeeded.toLocaleString()} more tokens needed</Text>
                </View>
                {canReach && <Text style={{ fontSize: 14, color: BLUE }}>✓</Text>}
              </View>
            );
          })}
        </>
      );
    }

    if (type === 'brand-tokens') {
      const tokens = wallet?.brandTokens ?? 0;
      return (
        <>
          <Text style={m.modalTitle}>🟣 Brand Tokens</Text>
          <Text style={m.modalSub}>Invest in a paddle brand to earn exclusive bonuses</Text>
          <View style={m.statBlock}>
            <HexIcon fill="#6b21a8" stroke="#a855f7" label="★" color="#d8b4fe" size={36} />
            <Text style={[m.statBlockValue, { color: PURPLE }]}>{tokens.toLocaleString()}</Text>
            <Text style={m.statBlockLabel}>Your Brand Token balance</Text>
          </View>
          {BRAND_THRESHOLDS.map((xp, idx) => {
            const lvl = idx + 1;
            const isUnlocked = tokens >= xp;
            return (
              <View key={idx} style={[m.levelRow, isUnlocked && { borderColor: 'rgba(167,139,250,0.3)' }]}>
                <View style={[m.levelBadge, isUnlocked ? { backgroundColor: 'rgba(167,139,250,0.15)', borderColor: PURPLE } : m.levelBadgeLocked]}>
                  <Text style={[m.levelBadgeText, isUnlocked ? { color: PURPLE } : m.levelBadgeTextLocked]}>{isUnlocked ? '✓' : lvl}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[m.levelName, isUnlocked && { color: PURPLE }]}>Support Level {lvl}</Text>
                  <Text style={m.levelXp}>{xp.toLocaleString()} brand tokens</Text>
                </View>
              </View>
            );
          })}
        </>
      );
    }

    if (type === 'battles') {
      const won = squad.battlesWon ?? 0;
      return (
        <>
          <Text style={m.modalTitle}>⚔️ Battle Milestones</Text>
          <Text style={m.modalSub}>Win battles to earn territory and squad bonuses</Text>
          <View style={m.statBlock}>
            <Text style={{ fontSize: 36 }}>⚔️</Text>
            <Text style={[m.statBlockValue, { color: '#f87171' }]}>{won.toLocaleString()}</Text>
            <Text style={m.statBlockLabel}>Battles won so far</Text>
          </View>
          {BATTLE_MILESTONES.map((milestone, idx) => {
            const reached = won >= milestone;
            return (
              <View key={idx} style={[m.levelRow, reached && { borderColor: 'rgba(248,113,113,0.3)' }]}>
                <View style={[m.levelBadge, reached ? { backgroundColor: 'rgba(248,113,113,0.15)', borderColor: '#f87171' } : m.levelBadgeLocked]}>
                  <Text style={[m.levelBadgeText, reached ? { color: '#f87171' } : m.levelBadgeTextLocked]}>{reached ? '✓' : idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[m.levelName, reached && { color: '#f87171' }]}>{milestone} Wins</Text>
                  <Text style={m.levelXp}>{reached ? 'Achieved!' : `${milestone - won} more wins needed`}</Text>
                </View>
                {reached && <View style={[m.currentPill, { backgroundColor: 'rgba(248,113,113,0.15)' }]}><Text style={[m.currentPillText, { color: '#f87171' }]}>✓</Text></View>}
              </View>
            );
          })}
        </>
      );
    }
    return null;
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onClose} activeOpacity={1} />
        <View style={[m.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={m.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={m.content}>
            {renderContent()}
          </ScrollView>
          <TouchableOpacity style={m.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={m.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

interface Props {
  squad: Squad;
  myPod: PodSummary | null;
  wallet: PlayerWalletData | null;
  brandData?: PlayerBrandData | null;
  onBack: () => void;
  onPodCreate: () => void;
  onPodInvite: () => void;
  onPodEdit: () => void;
  onBrandDetail?: () => void;
}

export function ClubhouseDetailScreen({ squad, myPod, wallet, brandData, onBack, onPodCreate, onPodInvite, onPodEdit, onBrandDetail }: Props) {
  const insets = useSafeAreaInsets();
  const { current: xpCurrent, threshold: xpThreshold } = getXpProgress(squad.totalXp, squad.level);
  const xpPct = Math.min(100, (xpCurrent / xpThreshold) * 100);
  const cityLabel = squad.city === 'hcm' ? 'Ho Chi Minh City' : squad.city ?? 'City';
  const [kpiModal, setKpiModal] = useState<ModalType>(null);
  const [imageFullscreen, setImageFullscreen] = useState(false);

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* KPI level-progression modal */}
      {kpiModal && (
        <KpiModal type={kpiModal} squad={squad} wallet={wallet} onClose={() => setKpiModal(null)} />
      )}

      {/* Fullscreen clubhouse image modal */}
      {imageFullscreen && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setImageFullscreen(false)}>
          <View style={s.fsOverlay}>
            <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setImageFullscreen(false)} activeOpacity={1} />
            <Image
              source={require('../../../../assets/images/clubhouse.png')}
              style={s.fsImage}
              resizeMode="contain"
            />
            <TouchableOpacity style={s.fsClose} onPress={() => setImageFullscreen(false)}>
              <Text style={s.fsCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
      {/* Top bar */}
      <View style={s.topBar}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>{squad.emoji} Clubhouse</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Identity card with XP progress ──────────────────────── */}
        <View style={s.identityCard}>
          <View style={s.identityTop}>
            <Text style={s.squadEmoji}>{squad.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.squadName}>{squad.name}</Text>
              <Text style={s.squadCity}>{cityLabel}</Text>
            </View>
            <View style={s.lvlBadge}>
              <Text style={s.lvlText}>LVL {squad.level}</Text>
            </View>
          </View>

          {/* XP progress bar */}
          <View style={s.xpRow}>
            <View style={s.xpTrack}>
              <View style={[s.xpFill, { width: `${xpPct}%` as any }]} />
            </View>
            <Text style={s.xpLabel}>{xpCurrent} / {xpThreshold} XP</Text>
          </View>
        </View>

        {/* ── 4 KPI cards ─────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>STATS · tap to see levels</Text>
        <View style={s.kpiGrid}>
          {/* XP */}
          <TouchableOpacity style={s.kpiCard} onPress={() => setKpiModal('xp')} activeOpacity={0.75}>
            <Text style={s.kpiIcon}>⭐</Text>
            <Text style={[s.kpiValue, { color: GOLD }]}>
              {squad.totalXp.toLocaleString()}
            </Text>
            <Text style={s.kpiLabel}>XP / {xpThreshold}</Text>
          </TouchableOpacity>

          {/* Club Tokens */}
          <TouchableOpacity style={s.kpiCard} onPress={() => setKpiModal('tokens')} activeOpacity={0.75}>
            <View style={s.kpiIconWrap}>
              <HexIcon fill="#1d4ed8" stroke="#60a5fa" label="C" color="#93c5fd" />
            </View>
            <Text style={[s.kpiValue, { color: BLUE }]}>
              {(wallet?.clubTokens ?? 0).toLocaleString()}
            </Text>
            <Text style={s.kpiLabel}>CLUB TOKENS</Text>
          </TouchableOpacity>

          {/* Brand Tokens */}
          <TouchableOpacity style={s.kpiCard} onPress={() => setKpiModal('brand-tokens')} activeOpacity={0.75}>
            <View style={s.kpiIconWrap}>
              <HexIcon fill="#6b21a8" stroke="#a855f7" label="★" color="#d8b4fe" />
            </View>
            <Text style={[s.kpiValue, { color: PURPLE }]}>
              {(wallet?.brandTokens ?? 0).toLocaleString()}
            </Text>
            <Text style={s.kpiLabel}>BRAND{'\n'}TOKENS</Text>
          </TouchableOpacity>

          {/* Battles Won */}
          <TouchableOpacity style={s.kpiCard} onPress={() => setKpiModal('battles')} activeOpacity={0.75}>
            <Text style={s.kpiIcon}>⚔️</Text>
            <Text style={[s.kpiValue, { color: '#f87171' }]}>
              {(squad.battlesWon ?? 0).toLocaleString()}
            </Text>
            <Text style={s.kpiLabel}>BATTLES WON</Text>
          </TouchableOpacity>
        </View>

        {/* ── Clubhouse image — tap for fullscreen ─────────────────── */}
        <TouchableOpacity onPress={() => setImageFullscreen(true)} activeOpacity={0.9}>
          <Image
            source={require('../../../../assets/images/clubhouse.png')}
            style={s.clubhouseImage}
            resizeMode="cover"
          />
        </TouchableOpacity>

        {/* ── Paddle Brand ─────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>PADDLE BRAND</Text>
        {brandData ? (
          <TouchableOpacity style={s.brandCard} onPress={onBrandDetail} activeOpacity={0.75}>
            <View style={s.brandIconWrap}>
              <Text style={s.brandEmoji}>{BRAND_EMOJIS[brandData.brand] ?? '🏓'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.brandName}>{BRAND_NAMES[brandData.brand] ?? brandData.brand}</Text>
              <Text style={s.brandLevel}>Support Level {brandData.supportLevel}</Text>
            </View>
            <View style={s.brandBadge}>
              <Text style={s.brandBadgeText}>Lvl {brandData.supportLevel}</Text>
            </View>
            <Text style={s.brandCaret}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.brandCardEmpty} onPress={onBrandDetail} activeOpacity={0.75}>
            <Text style={{ fontSize: 28 }}>🏓</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.brandCardEmptyTitle}>No Paddle Brand</Text>
              <Text style={s.brandCardEmptySub}>Select a brand to earn bonuses</Text>
            </View>
            <Text style={s.brandCaret}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── Members ──────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>MEMBERS ({squad.members?.length ?? 0})</Text>
        <View style={s.membersCard}>
          {(squad.members ?? []).map((m, idx) => (
            <View
              key={m.profileId}
              style={[
                s.memberRow,
                idx === (squad.members?.length ?? 0) - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <View style={s.memberAvatar}>
                <Text style={s.memberInitial}>
                  {(m.profile?.squadNickname ?? m.profile?.displayName ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.memberName}>
                  {m.profile?.squadNickname ? `@${m.profile.squadNickname}` : m.profile?.displayName ?? '?'}
                </Text>
                {m.podName ? <Text style={s.memberPod}>{m.podName}</Text> : null}
              </View>
              {m.role === 'founder' && (
                <View style={s.founderBadgeWrap}>
                  <Text style={s.founderBadge}>Founder</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* ── Pod ──────────────────────────────────────────────────── */}
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
  topTitle: {
    flex: 1, fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center',
  },

  content: { padding: 20, gap: 16, paddingBottom: 60 },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#52525b',
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // Identity card
  identityCard: {
    backgroundColor: 'rgba(26,26,10,1)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)',
    borderRadius: 16, padding: 16,
  },
  identityTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14,
  },
  squadEmoji: { fontSize: 40 },
  squadName: {
    fontFamily: BANGERS, fontSize: 24, color: GOLD,
    letterSpacing: 0.5, lineHeight: 26,
  },
  squadCity: { fontSize: 12, color: '#a1a1aa', fontWeight: '600', marginTop: 2 },
  lvlBadge: {
    backgroundColor: 'rgba(250,204,21,0.15)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100,
  },
  lvlText: { fontSize: 11, fontWeight: '900', color: GOLD },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  xpTrack: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: LIME },
  xpLabel: { fontSize: 11, fontWeight: '800', color: '#52525b' },

  // KPI row — 4 in one line
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#141414',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 6,
    alignItems: 'center', gap: 4,
  },
  kpiIcon: { fontSize: 22, marginBottom: 2 },
  kpiIconWrap: { marginBottom: 2 },
  kpiValue: { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  kpiLabel: {
    fontSize: 10, color: '#71717a', fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center',
  },

  // Clubhouse image
  clubhouseImage: {
    width: '100%', height: 200, borderRadius: 16,
    overflow: 'hidden',
  },
  imageTapHint: {
    position: 'absolute', bottom: 8, right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 100,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  imageTapHintText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },

  // Fullscreen image overlay
  fsOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  fsImage: { width: '100%', height: '80%' },
  fsClose: {
    position: 'absolute', top: 52, right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  fsCloseText: { fontSize: 16, color: '#fff', fontWeight: '700' },

  // Members
  membersCard: {
    backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  memberAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { fontSize: 16, fontWeight: '800', color: '#fff' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  memberPod: { fontSize: 11, color: '#52525b', fontWeight: '600', marginTop: 1 },
  founderBadgeWrap: {
    backgroundColor: 'rgba(250,204,21,0.1)',
    borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3,
  },
  founderBadge: { fontSize: 11, color: GOLD, fontWeight: '700' },

  // Pod
  podCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(163,230,53,0.2)',
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  podEmoji: { fontSize: 28 },
  podName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  podMembers: { fontSize: 12, color: '#71717a', marginTop: 2 },
  podInviteBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 100, borderWidth: 1.5, borderColor: LIME,
  },
  podInviteBtnText: { fontSize: 12, fontWeight: '800', color: LIME },
  createPodCard: {
    backgroundColor: '#141414', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 20, alignItems: 'center',
  },
  createPodTitle: { fontSize: 16, fontWeight: '800', color: '#fff', marginBottom: 4 },
  createPodSub: {
    fontSize: 13, color: '#71717a', textAlign: 'center', lineHeight: 18, marginBottom: 14,
  },
  createPodCta: {
    backgroundColor: 'rgba(163,230,53,0.12)', borderWidth: 1,
    borderColor: LIME, borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8,
  },
  createPodCtaText: { fontSize: 13, fontWeight: '800', color: LIME },

  // Paddle Brand card
  brandCard: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(167,139,250,0.2)',
    borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  brandIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandEmoji: { fontSize: 24 },
  brandName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  brandLevel: { fontSize: 12, color: PURPLE, fontWeight: '600', marginTop: 1 },
  brandBadge: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
  },
  brandBadgeText: { fontSize: 11, fontWeight: '900', color: PURPLE },
  brandCaret: { fontSize: 18, color: '#52525b', marginLeft: 2 },
  brandCardEmpty: {
    backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  brandCardEmptyTitle: { fontSize: 14, fontWeight: '700', color: '#a1a1aa' },
  brandCardEmptySub: { fontSize: 11, color: '#52525b', marginTop: 1 },
});

// ── KPI modal styles ──────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '82%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#2a2a2a',
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10 },
  modalTitle: {
    fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 2,
  },
  modalSub: { fontSize: 13, color: '#71717a', lineHeight: 18, marginBottom: 4 },
  statBlock: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 6, marginBottom: 4,
  },
  statBlockValue: { fontSize: 36, fontWeight: '900', color: '#fff' },
  statBlockLabel: { fontSize: 12, color: '#71717a', fontWeight: '600' },
  infoText: {
    fontSize: 12, color: '#52525b', backgroundColor: '#1a1a1a',
    borderRadius: 10, padding: 12, lineHeight: 18, marginBottom: 4,
  },
  levelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14, padding: 14,
  },
  levelRowCurrent: { borderColor: GOLD, backgroundColor: 'rgba(250,204,21,0.06)' },
  levelBadge: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  levelBadgeUnlocked: { backgroundColor: 'rgba(250,204,21,0.15)', borderColor: GOLD },
  levelBadgeLocked: { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' },
  levelBadgeText: { fontSize: 13, fontWeight: '900' },
  levelBadgeTextUnlocked: { color: GOLD },
  levelBadgeTextLocked: { color: '#52525b' },
  levelName: { fontSize: 14, fontWeight: '800', color: '#a1a1aa' },
  levelXp: { fontSize: 12, color: '#52525b', marginTop: 2 },
  currentPill: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100,
  },
  currentPillText: { fontSize: 10, fontWeight: '900', color: GOLD },
  closeBtn: {
    marginHorizontal: 20, marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, alignItems: 'center',
  },
  closeBtnText: { fontSize: 14, fontWeight: '800', color: '#a1a1aa' },
});
