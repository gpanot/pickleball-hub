import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Modal,
  ScrollView, Pressable,
} from 'react-native';
import type { ConquestSession, ClashRival } from '../types';
import { formatCountdown } from '../hooks/useConquest';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const GOLD = '#facc15';
const RED = '#ef4444';

// ─── Inactive card (no session) ──────────────────────────────────────────────

export function ConquestRadarInactiveCard({
  onCheckin,
  sessionActive = false,
}: {
  onCheckin: () => void;
  sessionActive?: boolean;
}) {
  const [showModal, setShowModal] = useState(false);

  // When a session is active, the live banner is shown instead — this component
  // is only rendered when there is genuinely no session. But pass sessionActive
  // so the explainer modal hides the check-in button.
  return (
    <>
      <TouchableOpacity
        onPress={() => setShowModal(true)}
        activeOpacity={0.82}
        style={s.inactiveCard}
      >
        <View style={s.inactiveRow}>
          <View style={s.lockIcon}>
            <Text style={s.lockEmoji}>🔒</Text>
          </View>
          <View style={s.inactiveTextCol}>
            <Text style={s.inactiveTitle}>ON COURT BATTLE</Text>
            <Text style={s.inactiveSub}>Check in at a court to activate</Text>
          </View>
          <Text style={s.inactiveCaret}>›</Text>
        </View>

        <View style={s.inactiveVsRow}>
          <View style={s.squadAvatar}>
            <Text style={s.squadAvatarEmoji}>🐯</Text>
          </View>
          <Text style={s.vsText}>VS</Text>
          <View style={[s.squadAvatar, s.squadAvatarUnknown]}>
            <Text style={s.unknownText}>?</Text>
          </View>
        </View>

        <View style={s.inactiveCta}>
          <Text style={s.inactiveCtaText}>📍 Tap to see how it works</Text>
        </View>
      </TouchableOpacity>

      <BattleExplainerModal
        visible={showModal}
        sessionActive={sessionActive}
        onClose={() => setShowModal(false)}
        onCheckin={() => { setShowModal(false); onCheckin(); }}
      />
    </>
  );
}

// ─── Active + scanning state ──────────────────────────────────────────────────

interface BannerProps {
  session: ConquestSession;
  mySquadName: string;
  mySquadEmoji: string;
  onPress: () => void;
  onAutoInitiateBattle?: (rivalSquadId: string) => void;
}

export function ConquestLiveBanner({
  session, mySquadName, mySquadEmoji, onPress, onAutoInitiateBattle,
}: BannerProps) {
  const dotAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const [seconds, setSeconds] = useState(session.secondsRemaining);

  // Pulsing dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 0.2, duration: 750, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dotAnim]);

  // Scanning rotation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  // Local countdown ticker
  useEffect(() => {
    setSeconds(session.secondsRemaining);
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [session.secondsRemaining]);

  // Dismiss when timer expires
  if (seconds === 0) return null;

  const rivals: ClashRival[] = session.clashRivals ?? (
    session.isClashActive && session.clashPartnerSquadId
      ? [{
          squadId: session.clashPartnerSquadId,
          squadName: session.clashPartnerSquadName ?? 'Rival',
          squadEmoji: '🦅',
          battle: null,
        }]
      : []
  );

  const scanRotate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View>
      {/* Main scanning radar card */}
      <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={s.activeCard}>
        <View style={s.topRow}>
          <Animated.View style={[s.dot, { opacity: dotAnim }]} />
          <Text style={s.statusLabel}>ON COURT NOW</Text>
          <Text style={s.venueName}>{session.venueName}</Text>
        </View>

        <View style={s.vsRow}>
          <View style={s.vsSquadCol}>
            <View style={s.squadAvatar}>
              <Text style={s.squadAvatarEmoji}>{mySquadEmoji}</Text>
            </View>
            <Text style={s.vsSquadName}>{mySquadName.toUpperCase().substring(0, 6)}</Text>
            <Text style={s.vsSquadSub}>You</Text>
          </View>

          <View style={s.vsCenter}>
            <Text style={s.vsLabel}>VS</Text>
            <Text style={s.countdownSmall}>{formatCountdown(seconds)}</Text>
          </View>

          <View style={s.vsSquadCol}>
            {rivals.length === 0 ? (
              <>
                <View style={s.scanningCircle}>
                  <Animated.View style={[s.scanLine, { transform: [{ rotate: scanRotate }] }]} />
                  <Text style={s.scanQ}>?</Text>
                </View>
                <Text style={s.scanningLabel}>Scanning...</Text>
              </>
            ) : (
              <>
                <View style={s.squadAvatar}>
                  <Text style={s.squadAvatarEmoji}>{rivals[0].squadEmoji}</Text>
                </View>
                <Text style={[s.vsSquadName, { color: RED }]}>
                  {rivals[0].squadName.toUpperCase().substring(0, 6)}
                </Text>
                {rivals.length > 1 && (
                  <Text style={s.moreRivals}>+{rivals.length - 1} more</Text>
                )}
              </>
            )}
          </View>
        </View>

        <Text style={s.watchText}>
          {rivals.length === 0
            ? 'Watching the radar for rival squads'
            : `${rivals.length} rival${rivals.length > 1 ? 's' : ''} detected at ${session.venueName}`}
        </Text>
      </TouchableOpacity>

      {/* One rival card per detected rival — each embeds its battle state */}
      {rivals.map((rival) => (
        <RivalCard
          key={rival.squadId}
          rival={rival}
          session={session}
          mySquadName={mySquadName}
          mySquadEmoji={mySquadEmoji}
          dotAnim={dotAnim}
          onInitiateBattle={() => onAutoInitiateBattle?.(rival.squadId)}
          onViewBattle={onPress}
        />
      ))}
    </View>
  );
}

// ─── Per-rival card with embedded battle countdown ────────────────────────────

function RivalCard({
  rival,
  session,
  mySquadName,
  mySquadEmoji,
  dotAnim,
  onInitiateBattle,
  onViewBattle,
}: {
  rival: ClashRival;
  session: ConquestSession;
  mySquadName: string;
  mySquadEmoji: string;
  dotAnim: Animated.Value;
  onInitiateBattle: () => void;
  onViewBattle: () => void;
}) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const hasBattle = !!rival.battle;

  // Pulse the card border if no battle yet
  useEffect(() => {
    if (hasBattle) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.01, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasBattle, pulseScale]);

  // Battle countdown state
  const [battleSecsLeft, setBattleSecsLeft] = useState(() =>
    rival.battle
      ? Math.max(0, Math.floor((new Date(rival.battle.revealAt).getTime() - Date.now()) / 1000))
      : 0
  );
  useEffect(() => {
    if (!rival.battle) return;
    setBattleSecsLeft(Math.max(0, Math.floor((new Date(rival.battle.revealAt).getTime() - Date.now()) / 1000)));
    const t = setInterval(() => setBattleSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [rival.battle?.revealAt]);

  const battleRevealed = rival.battle?.revealed || (rival.battle && battleSecsLeft === 0);

  return (
    <Animated.View style={[s.rivalCard, { transform: hasBattle ? [] : [{ scale: pulseScale }] }]}>
      {/* Header */}
      <View style={s.topRow}>
        <Animated.View style={[s.dotRed, { opacity: dotAnim }]} />
        <Text style={s.rivalLabel}>
          {hasBattle ? '⚔️ BATTLE IN PROGRESS' : '⚔️ RIVAL SPOTTED'}
        </Text>
        <Text style={s.venueName}>{session.venueName}</Text>
      </View>

      {/* VS row */}
      <View style={s.vsRow}>
        <View style={s.vsSquadCol}>
          <View style={s.squadAvatar}>
            <Text style={s.squadAvatarEmoji}>{mySquadEmoji}</Text>
          </View>
          <Text style={s.vsSquadName}>{mySquadName.toUpperCase().substring(0, 6)}</Text>
          <Text style={s.vsSquadSub}>You</Text>
        </View>

        <View style={s.vsCenter}>
          <Text style={[s.vsLabel, { color: RED }]}>VS</Text>
          {hasBattle ? (
            <>
              <Text style={s.battleInProgressLabel}>
                {battleRevealed ? 'RESULT IN!' : 'REVEALS IN'}
              </Text>
              <Text style={[s.countdownSmall, { color: battleRevealed ? GOLD : RED }]}>
                {battleRevealed ? '🏆' : formatCountdown(battleSecsLeft)}
              </Text>
            </>
          ) : (
            <Text style={[s.clashText, { color: RED }]}>CLASH</Text>
          )}
        </View>

        <View style={s.vsSquadCol}>
          <View style={[s.squadAvatar, { backgroundColor: '#1a0500' }]}>
            <Text style={s.squadAvatarEmoji}>{rival.squadEmoji}</Text>
          </View>
          <Text style={[s.vsSquadName, { color: GOLD }]}>
            {rival.squadName.toUpperCase().substring(0, 6)}
          </Text>
          <Text style={s.vsSquadSub}>just arrived</Text>
        </View>
      </View>

      {/* Action row */}
      {hasBattle ? (
        // Battle in progress — show tap to watch CTA
        <TouchableOpacity style={s.watchBattleBtn} onPress={onViewBattle} activeOpacity={0.8}>
          <Text style={s.watchBattleBtnText}>
            {battleRevealed ? '🏆 See result →' : '⚡ Watch the battle →'}
          </Text>
        </TouchableOpacity>
      ) : (
        // No battle yet — single auto-start button
        <TouchableOpacity style={s.challengeBtn} onPress={onInitiateBattle} activeOpacity={0.85}>
          <Text style={s.challengeBtnText}>⚔️ Start Battle Now</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Explainer modal ──────────────────────────────────────────────────────────

function BattleExplainerModal({
  visible,
  onClose,
  onCheckin,
  sessionActive,
}: {
  visible: boolean;
  onClose: () => void;
  onCheckin: () => void;
  sessionActive: boolean;
}) {
  const steps = [
    {
      num: 1,
      title: 'Arrive at any court',
      body: 'Tap check in when you get to the venue. Your squad goes live on the radar.',
    },
    {
      num: 2,
      title: 'Watch for rival squads',
      body: 'If another squad checks in at the same court, the fog lifts and they are revealed.',
    },
    {
      num: 3,
      title: 'Battle starts automatically',
      body: 'When a rival is detected, a card battle kicks off instantly. The result reveals after 3 minutes.',
    },
    {
      num: 4,
      title: 'Every check-in earns a chest',
      body: 'Win or lose, showing up always creates a squad chest. Your whole squad benefits.',
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.modalHandle} />

          <Text style={s.modalIcon}>⚔️</Text>
          <Text style={s.modalTitle}>Battle squads on court</Text>
          <Text style={s.modalSubtitle}>
            Check in when you arrive at a pickleball court. If a rival squad is there too, the battle begins.
          </Text>

          <ScrollView style={s.stepsList} showsVerticalScrollIndicator={false}>
            {steps.map((step, i) => (
              <View key={step.num}>
                <View style={s.stepRow}>
                  <View style={s.stepNumCircle}>
                    <Text style={s.stepNum}>{step.num}</Text>
                  </View>
                  <View style={s.stepTextCol}>
                    <Text style={s.stepTitle}>{step.title}</Text>
                    <Text style={s.stepBody}>{step.body}</Text>
                  </View>
                </View>
                {i < steps.length - 1 && <View style={s.stepDivider} />}
              </View>
            ))}
          </ScrollView>

          {!sessionActive && (
            <TouchableOpacity style={s.modalCheckinBtn} onPress={onCheckin} activeOpacity={0.85}>
              <Text style={s.modalCheckinBtnText}>📍 Check in now</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  // ── Inactive card ──
  inactiveCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 16,
    padding: 14,
  },
  inactiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  lockIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockEmoji: { fontSize: 16 },
  inactiveTextCol: { flex: 1 },
  inactiveTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#52525b',
    textTransform: 'uppercase',
  },
  inactiveSub: { fontSize: 12, color: '#3f3f46', marginTop: 1 },
  inactiveCaret: { fontSize: 20, color: '#3f3f46' },
  inactiveVsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 14,
  },
  inactiveCta: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  inactiveCtaText: { fontSize: 13, color: '#52525b', fontWeight: '700' },

  // ── Active card ──
  activeCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#071400',
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.3)',
    borderRadius: 16,
    padding: 14,
  },

  // ── Rival card ──
  rivalCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#140000',
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.5)',
    borderRadius: 16,
    padding: 14,
  },

  // ── Shared ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: LIME,
  },
  dotRed: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: RED,
  },
  statusLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', color: LIME, flex: 1,
  },
  rivalLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1, color: RED, flex: 1,
  },
  venueName: { fontSize: 11, color: '#71717a', fontWeight: '600' },

  // ── VS row ──
  vsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 12, paddingHorizontal: 4,
  },
  vsSquadCol: { alignItems: 'center', gap: 4, minWidth: 70 },
  vsCenter: { alignItems: 'center', gap: 2 },
  vsLabel: { fontFamily: BANGERS, fontSize: 22, color: '#52525b', letterSpacing: 1 },
  clashText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  battleInProgressLabel: { fontSize: 9, fontWeight: '900', color: '#71717a', letterSpacing: 0.8 },
  vsSquadName: { fontFamily: BANGERS, fontSize: 14, color: LIME, letterSpacing: 0.5 },
  vsSquadSub: { fontSize: 10, color: '#71717a' },
  moreRivals: { fontSize: 10, color: RED, fontWeight: '700' },
  countdownSmall: { fontFamily: BANGERS, fontSize: 18, color: LIME, letterSpacing: 0.5 },
  watchText: { fontSize: 11, color: '#52525b', textAlign: 'center', fontStyle: 'italic' },

  // ── Squad avatar ──
  squadAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  squadAvatarUnknown: {
    backgroundColor: '#111', borderWidth: 1, borderStyle: 'dashed', borderColor: '#333',
  },
  squadAvatarEmoji: { fontSize: 26 },
  unknownText: { fontSize: 22, color: '#52525b', fontWeight: '900' },

  // ── Scanning circle ──
  scanningCircle: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.25)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#071400',
  },
  scanLine: {
    position: 'absolute', width: 1, height: 22,
    backgroundColor: LIME, top: 4, left: 25,
    opacity: 0.6, transformOrigin: 'bottom',
  },
  scanQ: { fontSize: 18, color: '#52525b', fontWeight: '900' },
  scanningLabel: { fontSize: 10, color: '#52525b', fontStyle: 'italic' },

  // ── Battle CTA buttons ──
  challengeBtn: {
    backgroundColor: RED, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  challengeBtnText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  watchBattleBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
  },
  watchBattleBtnText: { fontSize: 14, fontWeight: '800', color: '#f87171' },

  // ── Modal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '90%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 24,
  },
  modalIcon: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  modalTitle: {
    fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 14, color: '#a1a1aa', textAlign: 'center', lineHeight: 20, marginBottom: 28,
  },
  stepsList: { marginBottom: 28 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  stepNumCircle: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: LIME,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepNum: { fontSize: 13, fontWeight: '900', color: LIME },
  stepTextCol: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 3 },
  stepBody: { fontSize: 13, color: '#a1a1aa', lineHeight: 19 },
  stepDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginLeft: 44 },
  modalCheckinBtn: {
    backgroundColor: LIME, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  modalCheckinBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },

  // ── vsText for inactive placeholder ──
  vsText: { fontFamily: BANGERS, fontSize: 22, color: '#3f3f46' },
});
