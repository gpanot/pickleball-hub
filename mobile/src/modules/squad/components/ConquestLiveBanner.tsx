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

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowModal(true)}
        activeOpacity={0.82}
        style={s.inactiveCard}
      >
        <View style={s.inactiveRow}>
          <View style={s.lockIcon}><Text style={s.lockEmoji}>🔒</Text></View>
          <View style={s.inactiveTextCol}>
            <Text style={s.inactiveTitle}>ON COURT BATTLE</Text>
            <Text style={s.inactiveSub}>Check in at a court to activate</Text>
          </View>
          <Text style={s.inactiveCaret}>›</Text>
        </View>
        <View style={s.inactiveVsRow}>
          <View style={s.squadAvatar}><Text style={s.squadAvatarEmoji}>🐯</Text></View>
          <Text style={s.vsText}>VS</Text>
          <View style={[s.squadAvatar, s.squadAvatarUnknown]}><Text style={s.unknownText}>?</Text></View>
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

// ─── Active banner — single unified card ────────────────────────────────────

interface BannerProps {
  session: ConquestSession;
  mySquadName: string;
  mySquadEmoji: string;
  onPress: () => void;
  onAutoInitiateBattle?: (rivalSquadId: string) => void;
  onWatchBattle?: () => void;
  onSeeResult?: (rivalSquadId: string) => void;
}

export function ConquestLiveBanner({
  session, mySquadName, mySquadEmoji, onPress, onAutoInitiateBattle,
  onWatchBattle, onSeeResult,
}: BannerProps) {
  const dotAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const [seconds, setSeconds] = useState(session.secondsRemaining);

  // Pulsing live dot
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

  // Scanning rotation (used when no rival yet)
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

  if (seconds === 0) return null;

  const rivals: ClashRival[] = session.clashRivals ?? (
    session.isClashActive && session.clashPartnerSquadId
      ? [{ squadId: session.clashPartnerSquadId, squadName: session.clashPartnerSquadName ?? 'Rival', squadEmoji: '🦅', battle: null }]
      : []
  );

  const scanRotate = scanAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Determine the dominant state for the card styling
  const hasAnyBattle = rivals.some(r => r.battle);
  const allRevealed = rivals.length > 0 && rivals.every(r => r.battle?.revealed || (r.battle && true));

  const cardBorderColor = hasAnyBattle
    ? 'rgba(239,68,68,0.5)'
    : rivals.length > 0
      ? 'rgba(239,68,68,0.3)'
      : 'rgba(163,230,53,0.3)';
  const cardBg = hasAnyBattle ? '#0f0000' : rivals.length > 0 ? '#0a0400' : '#071400';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={[s.activeCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
      {/* ── Header ── */}
      <View style={s.topRow}>
        <Animated.View style={[s.dot, { opacity: dotAnim, backgroundColor: hasAnyBattle ? RED : LIME }]} />
        <Text style={[s.statusLabel, { color: hasAnyBattle ? RED : rivals.length > 0 ? GOLD : LIME }]}>
          {hasAnyBattle ? '⚔️ BATTLE IN PROGRESS' : rivals.length > 0 ? '⚔️ RIVAL SPOTTED' : 'ON COURT NOW'}
        </Text>
        <Text style={s.venueName}>{session.venueName}</Text>
      </View>

      {/* ── Session timer pill ── */}
      <View style={s.timerPill}>
        <Text style={s.timerPillText}>⏱ {formatCountdown(seconds)}</Text>
      </View>

      {/* ── Main battle arena ── */}
      {rivals.length === 0 ? (
        // No rival yet — scanning state
        <View style={s.arenaRow}>
          <View style={s.arenaSquadCol}>
            <View style={s.arenaAvatar}><Text style={s.arenaEmoji}>{mySquadEmoji}</Text></View>
            <Text style={s.arenaName}>{mySquadName.toUpperCase().substring(0, 8)}</Text>
            <Text style={s.arenaSub}>You</Text>
          </View>
          <View style={s.arenaCenter}>
            <View style={s.scanningCircle}>
              <Animated.View style={[s.scanLine, { transform: [{ rotate: scanRotate }] }]} />
              <Text style={s.scanQ}>?</Text>
            </View>
            <Text style={s.scanningLabel}>Scanning...</Text>
          </View>
          <View style={s.arenaSquadCol}>
            <View style={[s.arenaAvatar, s.arenaAvatarUnknown]}><Text style={s.unknownText}>?</Text></View>
            <Text style={[s.arenaName, { color: '#52525b' }]}>UNKNOWN</Text>
            <Text style={s.arenaSub}>rival</Text>
          </View>
        </View>
      ) : (
        // Rival(s) detected — show battle arena for each rival
        rivals.map((rival, idx) => (
          <RivalBattleArena
            key={rival.squadId}
            rival={rival}
            mySquadName={mySquadName}
            mySquadEmoji={mySquadEmoji}
            isLast={idx === rivals.length - 1}
            onInitiateBattle={() => onAutoInitiateBattle?.(rival.squadId)}
            onWatchBattle={() => onWatchBattle?.()}
            onSeeResult={() => onSeeResult?.(rival.squadId)}
          />
        ))
      )}

      {/* ── Footer hint ── */}
      <Text style={s.footerHint}>
        {rivals.length === 0
          ? 'Watching for rival squads · tap for details'
          : hasAnyBattle
            ? 'Tap for full battle screen'
            : `${rivals.length} rival${rivals.length > 1 ? 's' : ''} · tap for details`}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Battle arena for one rival (inside the unified card) ────────────────────

const AUTO_BATTLE_DELAY = 20;

function RivalBattleArena({
  rival,
  mySquadName,
  mySquadEmoji,
  isLast,
  onInitiateBattle,
  onWatchBattle,
  onSeeResult,
}: {
  rival: ClashRival;
  mySquadName: string;
  mySquadEmoji: string;
  isLast: boolean;
  onInitiateBattle: () => void;
  onWatchBattle: () => void;
  onSeeResult: () => void;
}) {
  const hasBattle = !!rival.battle;

  // ── Auto-battle countdown ──
  const [autoCountdown, setAutoCountdown] = useState(AUTO_BATTLE_DELAY);
  const firedRef = useRef(false);
  useEffect(() => {
    if (hasBattle) return;
    firedRef.current = false;
    setAutoCountdown(AUTO_BATTLE_DELAY);
    const t = setInterval(() => {
      setAutoCountdown(prev => {
        const next = prev - 1;
        if (next <= 0 && !firedRef.current) {
          firedRef.current = true;
          setTimeout(() => onInitiateBattle(), 0);
          clearInterval(t);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBattle]);

  // ── Battle reveal countdown ──
  const [battleSecsLeft, setBattleSecsLeft] = useState(() =>
    rival.battle ? Math.max(0, Math.floor((new Date(rival.battle.revealAt).getTime() - Date.now()) / 1000)) : 0
  );
  useEffect(() => {
    if (!rival.battle) return;
    setBattleSecsLeft(Math.max(0, Math.floor((new Date(rival.battle.revealAt).getTime() - Date.now()) / 1000)));
    const t = setInterval(() => setBattleSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [rival.battle?.revealAt]);

  const battleRevealed = rival.battle?.revealed || (rival.battle && battleSecsLeft === 0);

  // ── Clash animation: emojis charge → collide → retreat → repeat ──
  const leftX = useRef(new Animated.Value(0)).current;
  const rightX = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!hasBattle || battleRevealed) return;

    // Each cycle: charge in → flash → shake → retreat → pause → repeat
    const CHARGE_DIST = 22; // px each emoji moves toward center
    const cycle = Animated.loop(
      Animated.sequence([
        // 1. Charge toward each other
        Animated.parallel([
          Animated.timing(leftX,  { toValue:  CHARGE_DIST, duration: 350, useNativeDriver: true }),
          Animated.timing(rightX, { toValue: -CHARGE_DIST, duration: 350, useNativeDriver: true }),
        ]),
        // 2. Impact flash
        Animated.timing(flashOpacity, { toValue: 1, duration: 60, useNativeDriver: true }),
        // 3. Shake center text
        Animated.sequence([
          Animated.timing(shakeX, { toValue: -4, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue:  4, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue: -3, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeX, { toValue:  0, duration: 50, useNativeDriver: true }),
        ]),
        // 4. Flash out
        Animated.timing(flashOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        // 5. Retreat to start
        Animated.parallel([
          Animated.timing(leftX,  { toValue: 0, duration: 280, useNativeDriver: true }),
          Animated.timing(rightX, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]),
        // 6. Pause before next clash
        Animated.delay(1400),
      ])
    );
    cycle.start();
    return () => cycle.stop();
  }, [hasBattle, battleRevealed, leftX, rightX, flashOpacity, shakeX]);

  return (
    <View style={[s.arenaWrapper, !isLast && s.arenaWrapperDivider]}>
      {/* Multi-rival divider label */}
      {/* VS / arena row */}
      <View style={s.arenaRow}>
        {/* My squad */}
        <View style={s.arenaSquadCol}>
          <Animated.View style={[s.arenaAvatar, { transform: [{ translateX: leftX }] }]}>
            <Text style={s.arenaEmoji}>{mySquadEmoji}</Text>
          </Animated.View>
          <Text style={s.arenaName}>{mySquadName.toUpperCase().substring(0, 8)}</Text>
          <Text style={s.arenaSub}>You</Text>
        </View>

        {/* Center: VS + state */}
        <View style={s.arenaCenter}>
          {hasBattle ? (
            <>
              {/* Impact flash overlay */}
              <Animated.View style={[s.impactFlash, { opacity: flashOpacity }]} />
              <Animated.Text style={[s.vsLabel, { color: RED, transform: [{ translateX: shakeX }] }]}>VS</Animated.Text>
              <Text style={s.battleStateLabel}>{battleRevealed ? 'RESULT IN!' : 'REVEALS IN'}</Text>
              <Animated.Text style={[s.battleCountdown, { color: battleRevealed ? GOLD : RED, transform: [{ translateX: shakeX }] }]}>
                {battleRevealed ? '🏆' : formatCountdown(battleSecsLeft)}
              </Animated.Text>
            </>
          ) : (
            <>
              <Text style={[s.vsLabel, { color: '#52525b' }]}>VS</Text>
              <Text style={s.clashText}>CLASH</Text>
              <Text style={s.autoStartLabel}>starts in {autoCountdown}s</Text>
            </>
          )}
        </View>

        {/* Rival squad */}
        <View style={s.arenaSquadCol}>
          <Animated.View style={[s.arenaAvatar, s.arenaAvatarRival, { transform: [{ translateX: rightX }] }]}>
            <Text style={s.arenaEmoji}>{rival.squadEmoji}</Text>
          </Animated.View>
          <Text style={[s.arenaName, { color: GOLD }]}>{rival.squadName.toUpperCase().substring(0, 8)}</Text>
          <Text style={s.arenaSub}>rival</Text>
        </View>
      </View>

      {/* CTA row */}
      {hasBattle ? (
        <TouchableOpacity
          style={[s.ctaBtn, battleRevealed ? s.ctaBtnGold : s.ctaBtnRed]}
          onPress={battleRevealed ? onSeeResult : onWatchBattle}
          activeOpacity={0.8}
        >
          <Text style={[s.ctaBtnText, battleRevealed ? s.ctaBtnTextGold : s.ctaBtnTextRed]}>
            {battleRevealed ? '🏆 See result →' : '⚡ Watch the battle →'}
          </Text>
        </TouchableOpacity>
      ) : (
        // Auto-start progress bar
        <View style={s.autoBar}>
          <View style={[s.autoBarFill, { width: `${(autoCountdown / AUTO_BATTLE_DELAY) * 100}%` as any }]} />
          <Text style={s.autoBarText}>⚔️ Battle is starting in {autoCountdown}s</Text>
        </View>
      )}
    </View>
  );
}

// ─── Explainer modal ──────────────────────────────────────────────────────────

function BattleExplainerModal({
  visible, onClose, onCheckin, sessionActive,
}: {
  visible: boolean; onClose: () => void; onCheckin: () => void; sessionActive: boolean;
}) {
  const steps = [
    { num: 1, title: 'Arrive at any court', body: 'Tap check in when you get to the venue. Your squad goes live on the radar.' },
    { num: 2, title: 'Watch for rival squads', body: 'If another squad checks in at the same court, the fog lifts and they are revealed.' },
    { num: 3, title: 'Battle starts automatically', body: 'When a rival is detected, a card battle kicks off instantly. The result reveals after 3 minutes.' },
    { num: 4, title: 'Every check-in earns a chest', body: 'Win or lose, showing up always creates a squad chest. Your whole squad benefits.' },
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
                  <View style={s.stepNumCircle}><Text style={s.stepNum}>{step.num}</Text></View>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Inactive ──
  inactiveCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#111', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)', borderRadius: 16, padding: 14,
  },
  inactiveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  lockIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  lockEmoji: { fontSize: 16 },
  inactiveTextCol: { flex: 1 },
  inactiveTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: '#52525b', textTransform: 'uppercase' },
  inactiveSub: { fontSize: 12, color: '#3f3f46', marginTop: 1 },
  inactiveCaret: { fontSize: 20, color: '#3f3f46' },
  inactiveVsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 14 },
  inactiveCta: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  inactiveCtaText: { fontSize: 13, color: '#52525b', fontWeight: '700' },

  // ── Active card (unified) ──
  activeCard: {
    marginHorizontal: 16, marginBottom: 12,
    borderWidth: 1.5, borderRadius: 18, padding: 14,
    overflow: 'hidden',
  },

  // ── Header ──
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', flex: 1 },
  venueName: { fontSize: 11, color: '#71717a', fontWeight: '600' },

  // ── Timer pill ──
  timerPill: {
    alignSelf: 'center', marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  timerPillText: { fontFamily: BANGERS, fontSize: 15, color: '#a1a1aa', letterSpacing: 0.5 },

  // ── Arena row ──
  arenaWrapper: { marginBottom: 10 },
  arenaWrapperDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', paddingBottom: 10, marginBottom: 10 },
  arenaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  arenaSquadCol: { alignItems: 'center', gap: 4, width: 70 },
  arenaAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  arenaAvatarUnknown: { backgroundColor: '#111', borderWidth: 1, borderStyle: 'dashed', borderColor: '#333' },
  arenaAvatarRival: { backgroundColor: '#1a0500' },
  arenaEmoji: { fontSize: 28 },
  arenaName: { fontFamily: BANGERS, fontSize: 13, color: LIME, letterSpacing: 0.5, textAlign: 'center' },
  arenaSub: { fontSize: 10, color: '#71717a' },

  // ── Arena center ──
  arenaCenter: { flex: 1, alignItems: 'center', gap: 2, position: 'relative' },
  impactFlash: {
    position: 'absolute', width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#fff', top: -4,
  },
  vsLabel: { fontFamily: BANGERS, fontSize: 24, letterSpacing: 1 },
  battleStateLabel: { fontSize: 9, fontWeight: '900', color: '#71717a', letterSpacing: 0.8 },
  battleCountdown: { fontFamily: BANGERS, fontSize: 20, letterSpacing: 0.5 },
  clashText: { fontSize: 10, fontWeight: '900', color: RED, letterSpacing: 1 },
  autoStartLabel: { fontSize: 10, color: '#f87171', fontWeight: '700' },

  // ── Scanning (no rival) ──
  scanningCircle: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.25)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(163,230,53,0.04)',
  },
  scanLine: { position: 'absolute', width: 1, height: 22, backgroundColor: LIME, top: 4, left: 25, opacity: 0.6, transformOrigin: 'bottom' },
  scanQ: { fontSize: 20, color: '#52525b', fontWeight: '900' },
  scanningLabel: { fontSize: 10, color: '#52525b', fontStyle: 'italic' },

  // ── CTAs ──
  ctaBtn: { borderRadius: 12, paddingVertical: 11, alignItems: 'center', borderWidth: 1 },
  ctaBtnRed: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.4)' },
  ctaBtnGold: { backgroundColor: 'rgba(250,204,21,0.12)', borderColor: 'rgba(250,204,21,0.45)' },
  ctaBtnText: { fontSize: 14, fontWeight: '800' },
  ctaBtnTextRed: { color: '#f87171' },
  ctaBtnTextGold: { color: GOLD },

  // ── Auto-start bar ──
  autoBar: { borderRadius: 10, overflow: 'hidden', backgroundColor: 'rgba(239,68,68,0.07)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', height: 40, justifyContent: 'center', alignItems: 'center' },
  autoBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(239,68,68,0.16)', borderRadius: 10 },
  autoBarText: { fontSize: 12, fontWeight: '800', color: '#f87171', zIndex: 1 },

  // ── Footer ──
  footerHint: { fontSize: 10, color: '#52525b', textAlign: 'center', marginTop: 4, fontStyle: 'italic' },

  // ── Shared avatars ──
  squadAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  squadAvatarUnknown: { backgroundColor: '#111', borderWidth: 1, borderStyle: 'dashed', borderColor: '#333' },
  squadAvatarEmoji: { fontSize: 26 },
  unknownText: { fontSize: 22, color: '#52525b', fontWeight: '900' },
  vsText: { fontFamily: BANGERS, fontSize: 22, color: '#3f3f46' },

  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '90%' },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 24 },
  modalIcon: { fontSize: 48, textAlign: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 10 },
  modalSubtitle: { fontSize: 14, color: '#a1a1aa', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  stepsList: { marginBottom: 28 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 14 },
  stepNumCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: LIME, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNum: { fontSize: 13, fontWeight: '900', color: LIME },
  stepTextCol: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '800', color: '#fff', marginBottom: 3 },
  stepBody: { fontSize: 13, color: '#a1a1aa', lineHeight: 19 },
  stepDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginLeft: 44 },
  modalCheckinBtn: { backgroundColor: LIME, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  modalCheckinBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
