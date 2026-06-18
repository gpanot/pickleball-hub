import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConquestBattle } from '../types';
import { formatCountdown } from '../hooks/useConquest';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';
const RED = '#ef4444';

const FINALE_THRESHOLD = 10; // seconds at which finale begins

interface BattleProps {
  battle: ConquestBattle;
  mySquadId: string;
  mySquadName: string;
  mySquadEmoji: string;
  rivalSquadName: string;
  rivalSquadEmoji: string;
  onRevealResult: () => void;
  onBack?: () => void;
}

/**
 * Shown while waiting for revealAt — animated countdown, clash animation,
 * and a dramatic finale in the last 10 seconds.
 */
export function ConquestBattleScreen({
  battle,
  mySquadId,
  mySquadName,
  mySquadEmoji,
  rivalSquadName,
  rivalSquadEmoji,
  onRevealResult,
  onBack,
}: BattleProps) {
  const insets = useSafeAreaInsets();
  const [revealSecs, setRevealSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(battle.revealAt).getTime() - Date.now()) / 1000))
  );
  const isFinale = revealSecs <= FINALE_THRESHOLD && revealSecs > 0;

  // ── Shared animations ──────────────────────────────────────────────────────
  const shakeAnim  = useRef(new Animated.Value(0)).current;
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const flashAnim  = useRef(new Animated.Value(0)).current;  // full-screen flash
  const scaleAnim  = useRef(new Animated.Value(1)).current;  // countdown scale pump
  // Clash: emojis charge toward center
  const leftX      = useRef(new Animated.Value(0)).current;
  const rightX     = useRef(new Animated.Value(0)).current;
  const impactFlash = useRef(new Animated.Value(0)).current;
  const vsShake    = useRef(new Animated.Value(0)).current;

  // Countdown ticker
  useEffect(() => {
    const t = setInterval(() => {
      setRevealSecs(s => {
        const next = Math.max(0, s - 1);
        if (next === 0) onRevealResult();
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onRevealResult]);

  useEffect(() => {
    if (battle.revealed) onRevealResult();
  }, [battle.revealed, onRevealResult]);

  // Steady VS glow pulse
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  // Clash animation loop (emoji charge/bounce) — faster during finale
  useEffect(() => {
    const DIST = isFinale ? 28 : 20;
    const SPEED = isFinale ? 220 : 350;
    const PAUSE = isFinale ? 400 : 1200;

    const cycle = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(leftX,  { toValue:  DIST, duration: SPEED, useNativeDriver: true }),
          Animated.timing(rightX, { toValue: -DIST, duration: SPEED, useNativeDriver: true }),
        ]),
        Animated.timing(impactFlash, { toValue: 1, duration: 50, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(vsShake, { toValue: -5, duration: 40, useNativeDriver: true }),
          Animated.timing(vsShake, { toValue:  5, duration: 40, useNativeDriver: true }),
          Animated.timing(vsShake, { toValue: -3, duration: 40, useNativeDriver: true }),
          Animated.timing(vsShake, { toValue:  0, duration: 40, useNativeDriver: true }),
        ]),
        Animated.timing(impactFlash, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(leftX,  { toValue: 0, duration: SPEED * 0.8, useNativeDriver: true }),
          Animated.timing(rightX, { toValue: 0, duration: SPEED * 0.8, useNativeDriver: true }),
        ]),
        Animated.delay(PAUSE),
      ])
    );
    cycle.start();
    return () => cycle.stop();
  }, [isFinale, leftX, rightX, impactFlash, vsShake]);

  // Finale: full-screen red flash bursts + countdown scale pumps on each second
  useEffect(() => {
    if (!isFinale) return;

    // Screen flash every second
    const flashLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.18, duration: 100, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(500),
      ])
    );
    flashLoop.start();

    // Countdown number pumps on each tick
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(580),
      ])
    );
    scaleLoop.start();

    return () => { flashLoop.stop(); scaleLoop.stop(); };
  }, [isFinale, flashAnim, scaleAnim]);

  // Header shake every 2s (always)
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(isFinale ? 600 : 1800),
        Animated.timing(shakeAnim, { toValue: 1,   duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1,  duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0.5, duration: 60, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0,   duration: 60, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isFinale, shakeAnim]);

  const translateX  = shakeAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [-4, 0, 4] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const vsTranslateX = vsShake.interpolate({ inputRange: [-5, 0, 5], outputRange: [-5, 0, 5] });

  const myPower    = battle.initiatingSquadId === mySquadId ? battle.initiatingCardPower : (battle.rivalCardPower ?? null);
  const rivalPower = battle.initiatingSquadId === mySquadId ? (battle.rivalCardPower ?? null) : battle.initiatingCardPower;

  const countdownColor = revealSecs <= 5 ? RED : revealSecs <= FINALE_THRESHOLD ? '#fb923c' : LIME;

  return (
    <View style={[b.container, { paddingTop: insets.top, backgroundColor: isFinale ? '#110000' : '#0a0a0a' }]}>
      {/* Full-screen red flash overlay */}
      <Animated.View style={[b.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

      {onBack && (
        <TouchableOpacity style={b.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={b.backBtnText}>← Keep playing</Text>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={b.header}>
        <Text style={[b.headerLabel, isFinale && b.headerLabelFinale]}>
          {isFinale ? '🔥 DECIDING NOW' : '⚔️ BATTLE IN PROGRESS'}
        </Text>
        {isFinale && (
          <Text style={b.finaleSubtitle}>Cards are being locked in…</Text>
        )}
      </View>

      {/* VS / emoji clash banner */}
      <Animated.View style={[b.vsBanner, { transform: [{ translateX }], borderColor: isFinale ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)' }]}>
        {/* Impact flash */}
        <Animated.View style={[b.impactFlash, { opacity: impactFlash }]} pointerEvents="none" />

        <View style={b.vsSquad}>
          <Animated.Text style={[b.vsEmoji, { transform: [{ translateX: leftX }] }]}>{mySquadEmoji}</Animated.Text>
          <Text style={[b.vsName, { color: LIME }]}>{mySquadName}</Text>
          <View style={b.powerBadge}>
            <Text style={b.powerValue}>{myPower ?? '?'}</Text>
            <Text style={b.powerLabel}>POWER</Text>
          </View>
        </View>

        <Animated.View style={[b.vsCenter, { opacity: glowOpacity }]}>
          <Animated.Text style={[b.vsText, { transform: [{ translateX: vsTranslateX }], color: isFinale ? RED : RED }]}>VS</Animated.Text>
        </Animated.View>

        <View style={b.vsSquad}>
          <Animated.Text style={[b.vsEmoji, { transform: [{ translateX: rightX }] }]}>{rivalSquadEmoji}</Animated.Text>
          <Text style={[b.vsName, { color: GOLD }]}>{rivalSquadName}</Text>
          <View style={[b.powerBadge, { borderColor: 'rgba(250,204,21,0.3)', backgroundColor: 'rgba(250,204,21,0.1)' }]}>
            <Text style={[b.powerValue, { color: rivalPower !== null ? GOLD : '#52525b' }]}>
              {rivalPower !== null ? rivalPower : '???'}
            </Text>
            <Text style={[b.powerLabel, { color: '#52525b' }]}>POWER</Text>
          </View>
        </View>
      </Animated.View>

      {/* Countdown */}
      <View style={b.revealSection}>
        <Text style={[b.revealLabel, isFinale && { color: RED }]}>
          {isFinale ? '⚠️ REVEALS IN' : 'REVEAL IN'}
        </Text>
        <Animated.Text style={[b.revealValue, { color: countdownColor, transform: [{ scale: scaleAnim }] }]}>
          {formatCountdown(revealSecs)}
        </Animated.Text>
        {!isFinale && <Text style={b.revealSub}>Cards being locked in…</Text>}
      </View>

      {/* Battle badge */}
      <View style={[b.battleBadge, isFinale && { borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)' }]}>
        <Text style={b.battleBadgeText}>
          {battle.isCounterAttack ? '↩️ COUNTER-ATTACK' : `BATTLE #${battle.battleNumber}`}
        </Text>
      </View>

      <Text style={b.hint}>
        {isFinale ? 'Almost there — result drops in seconds 🔥' : 'Keep playing while the battle resolves 🏓'}
      </Text>
    </View>
  );
}

// ── Win Screen ──────────────────────────────────────────────────────

interface WinProps {
  battle: ConquestBattle;
  mySquadName: string;
  mySquadEmoji: string;
  rivalSquadName: string;
  rivalSquadEmoji: string;
  mySquadId: string;
  counterAttackWindowEndsAt: string;
  onViewResults: () => void;
  onBack?: () => void;
}

export function ConquestBattleWinScreen({
  battle,
  mySquadName,
  mySquadEmoji,
  rivalSquadName,
  rivalSquadEmoji,
  mySquadId,
  counterAttackWindowEndsAt,
  onViewResults,
  onBack,
}: WinProps) {
  const insets = useSafeAreaInsets();
  const [counterSecs, setCounterSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(counterAttackWindowEndsAt).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => setCounterSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const myPower = battle.initiatingSquadId === mySquadId
    ? battle.initiatingCardPower
    : (battle.rivalCardPower ?? 0);
  const rivalPower = battle.initiatingSquadId === mySquadId
    ? (battle.rivalCardPower ?? 0)
    : battle.initiatingCardPower;

  return (
    <View style={[w.container, { paddingTop: insets.top }]}>
      {onBack && (
        <TouchableOpacity style={w.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={w.backBtnText}>← Back to session</Text>
        </TouchableOpacity>
      )}
      <View style={w.header}>
        <Text style={w.winBadge}>⚡ VICTORY</Text>
        <Text style={w.winTitle}>You won the battle</Text>
      </View>

      {/* Score reveal */}
      <View style={w.scoreCard}>
        <View style={w.scoreRow}>
          <View style={w.scoreTeam}>
            <Text style={w.scoreEmoji}>{mySquadEmoji}</Text>
            <Text style={[w.scorePower, { color: LIME }]}>{myPower}</Text>
            <Text style={w.scoreLabel}>You</Text>
          </View>
          <View style={w.scoreDivider} />
          <View style={w.scoreTeam}>
            <Text style={w.scoreEmoji}>{rivalSquadEmoji}</Text>
            <Text style={[w.scorePower, { color: '#52525b' }]}>{rivalPower}</Text>
            <Text style={[w.scoreLabel, { color: '#52525b' }]}>{rivalSquadName}</Text>
          </View>
        </View>
        <View style={w.bonusRow}>
          <Text style={w.bonusText}>+INF card bonus applied to your session</Text>
        </View>
      </View>

      {/* Rival intel (counter-attack info) */}
      <View style={w.intelCard}>
        <Text style={w.intelTitle}>Rival Intel Unlocked</Text>
        <Text style={w.intelSub}>
          <Text style={{ color: GOLD, fontWeight: '700' }}>{rivalSquadName}</Text>
          {' '}can counter-attack within <Text style={{ color: RED, fontWeight: '700' }}>
            {formatCountdown(counterSecs)}
          </Text>
        </Text>
        <View style={w.intelBar}>
          <View style={[w.intelBarFill, { width: `${(counterSecs / 300) * 100}%` }]} />
        </View>
      </View>

      {/* View results */}
      <TouchableOpacity style={w.viewResultsBtn} onPress={onViewResults} activeOpacity={0.82}>
        <Text style={w.viewResultsText}>See Full Impact →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Lose Screen ─────────────────────────────────────────────────────

interface LoseProps {
  battle: ConquestBattle;
  mySquadName: string;
  mySquadEmoji: string;
  rivalSquadName: string;
  rivalSquadEmoji: string;
  mySquadId: string;
  counterAttackWindowEndsAt: string;
  onCounterAttack: () => Promise<void>;
  onViewResults: () => void;
  onBack?: () => void;
}

export function ConquestBattleLoseScreen({
  battle,
  mySquadName,
  mySquadEmoji,
  rivalSquadName,
  rivalSquadEmoji,
  mySquadId,
  counterAttackWindowEndsAt,
  onCounterAttack,
  onViewResults,
  onBack,
}: LoseProps) {
  const insets = useSafeAreaInsets();
  const [counterSecs, setCounterSecs] = useState(() =>
    Math.max(0, Math.floor((new Date(counterAttackWindowEndsAt).getTime() - Date.now()) / 1000))
  );
  const [countering, setCountering] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setCounterSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const myPower = battle.initiatingSquadId === mySquadId
    ? battle.initiatingCardPower
    : (battle.rivalCardPower ?? 0);
  const rivalPower = battle.initiatingSquadId === mySquadId
    ? (battle.rivalCardPower ?? 0)
    : battle.initiatingCardPower;

  const handleCounter = async () => {
    setCountering(true);
    try {
      await onCounterAttack();
    } finally {
      setCountering(false);
    }
  };

  const counterWindowOpen = counterSecs > 0;

  return (
    <View style={[l.container, { paddingTop: insets.top }]}>
      {onBack && (
        <TouchableOpacity style={l.backBtn} onPress={onBack} activeOpacity={0.7}>
          <Text style={l.backBtnText}>← Back to session</Text>
        </TouchableOpacity>
      )}
      <View style={l.header}>
        <Text style={l.loseBadge}>💀 DEFEAT</Text>
        <Text style={l.loseTitle}>You lost the battle</Text>
        <Text style={l.loseSub}>But you can still hit back</Text>
      </View>

      {/* Score reveal */}
      <View style={l.scoreCard}>
        <View style={l.scoreRow}>
          <View style={l.scoreTeam}>
            <Text style={l.scoreEmoji}>{mySquadEmoji}</Text>
            <Text style={[l.scorePower, { color: '#52525b' }]}>{myPower}</Text>
            <Text style={[l.scoreLabel, { color: '#52525b' }]}>You</Text>
          </View>
          <View style={l.scoreDivider} />
          <View style={l.scoreTeam}>
            <Text style={l.scoreEmoji}>{rivalSquadEmoji}</Text>
            <Text style={[l.scorePower, { color: GOLD }]}>{rivalPower}</Text>
            <Text style={l.scoreLabel}>{rivalSquadName}</Text>
          </View>
        </View>
      </View>

      {/* Counter-attack window */}
      {counterWindowOpen && (
        <View style={l.counterCard}>
          <View style={l.counterHeader}>
            <Text style={l.counterTitle}>🔁 Counter-Attack Window</Text>
            <Text style={l.counterTimer}>{formatCountdown(counterSecs)}</Text>
          </View>
          <Text style={l.counterDesc}>
            Fire a counter-attack against <Text style={{ color: GOLD, fontWeight: '700' }}>{rivalSquadName}</Text>.
            {' '}Winner gets the venue INF bonus. Each session allows one counter.
          </Text>
          <TouchableOpacity
            style={l.counterBtn}
            onPress={handleCounter}
            disabled={countering}
            activeOpacity={0.82}
          >
            {countering ? (
              <ActivityIndicator color={RED} />
            ) : (
              <Text style={l.counterBtnText}>↩️ Fire Counter-Attack</Text>
            )}
          </TouchableOpacity>
          <View style={l.counterBar}>
            <View style={[l.counterBarFill, { width: `${(counterSecs / 300) * 100}%` }]} />
          </View>
        </View>
      )}

      {!counterWindowOpen && (
        <View style={l.windowClosed}>
          <Text style={l.windowClosedText}>Counter-attack window has closed</Text>
        </View>
      )}

      {/* Rival intel */}
      <View style={l.intelCard}>
        <Text style={l.intelTitle}>Rival Intel</Text>
        <View style={l.intelRow}>
          <Text style={l.intelEmoji}>{rivalSquadEmoji}</Text>
          <View>
            <Text style={l.intelName}>{rivalSquadName}</Text>
            <Text style={l.intelPowerText}>Card power: {rivalPower}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={l.viewResultsBtn} onPress={onViewResults} activeOpacity={0.82}>
        <Text style={l.viewResultsText}>See Full Impact →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const b = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: RED,
    zIndex: 10,
  },
  backBtn: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
  backBtnText: { fontSize: 13, color: '#52525b', fontWeight: '600' },
  header: { alignItems: 'center', paddingVertical: 20 },
  headerLabel: { fontFamily: BANGERS, fontSize: 18, color: RED, letterSpacing: 1 },
  headerLabelFinale: { fontSize: 22, color: '#ff6b35' },
  finaleSubtitle: { fontSize: 12, color: '#ff6b35', marginTop: 4, fontWeight: '700', letterSpacing: 0.5 },
  vsBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111',
    borderWidth: 1.5,
    borderRadius: 20, padding: 16, marginBottom: 20,
    overflow: 'hidden',
  },
  impactFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  vsSquad: { flex: 1, alignItems: 'center', gap: 6 },
  vsEmoji: { fontSize: 44 },
  vsName: { fontFamily: BANGERS, fontSize: 16, letterSpacing: 0.5 },
  powerBadge: {
    backgroundColor: 'rgba(163,230,53,0.1)',
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.3)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
    alignItems: 'center',
  },
  powerValue: { fontFamily: BANGERS, fontSize: 22, color: LIME },
  powerLabel: { fontSize: 8, fontWeight: '800', textTransform: 'uppercase', color: '#52525b', letterSpacing: 0.5 },
  vsCenter: { flexShrink: 0, width: 50, alignItems: 'center' },
  vsText: { fontFamily: BANGERS, fontSize: 40, color: RED },
  revealSection: { alignItems: 'center', marginBottom: 20 },
  revealLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 4 },
  revealValue: { fontFamily: BANGERS, fontSize: 72, letterSpacing: 1 },
  revealSub: { fontSize: 12, color: '#52525b' },
  battleBadge: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 100, paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'center', marginBottom: 16,
  },
  battleBadgeText: { fontSize: 12, fontWeight: '800', color: RED },
  hint: { fontSize: 11, color: '#52525b', textAlign: 'center' },
});

const w = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#071a07', padding: 16 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
  backBtnText: { fontSize: 13, color: '#52525b', fontWeight: '600' },
  header: { alignItems: 'center', paddingVertical: 24 },
  winBadge: { fontFamily: BANGERS, fontSize: 16, letterSpacing: 2, color: LIME },
  winTitle: { fontFamily: BANGERS, fontSize: 38, color: '#fff', letterSpacing: 0.5 },
  scoreCard: {
    backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, padding: 16, marginBottom: 12,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreTeam: { flex: 1, alignItems: 'center', gap: 4 },
  scoreEmoji: { fontSize: 36 },
  scorePower: { fontFamily: BANGERS, fontSize: 32 },
  scoreLabel: { fontSize: 11, color: '#a1a1aa' },
  scoreDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 10 },
  bonusRow: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  bonusText: { fontSize: 12, color: LIME, fontWeight: '700' },
  intelCard: {
    backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(250,204,21,0.15)',
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  intelTitle: { fontSize: 12, fontWeight: '800', color: GOLD, marginBottom: 4 },
  intelSub: { fontSize: 12, color: '#a1a1aa', lineHeight: 18 },
  intelBar: {
    width: '100%', height: 3, backgroundColor: '#2a2a2a',
    borderRadius: 2, marginTop: 8, overflow: 'hidden',
  },
  intelBarFill: { height: '100%', borderRadius: 2, backgroundColor: RED },
  viewResultsBtn: {
    backgroundColor: LIME, borderRadius: 16, padding: 15, alignItems: 'center',
  },
  viewResultsText: { fontSize: 15, fontWeight: '900', color: '#000' },
});

const l = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a0707', padding: 16 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
  backBtnText: { fontSize: 13, color: '#52525b', fontWeight: '600' },
  header: { alignItems: 'center', paddingVertical: 20 },
  loseBadge: { fontFamily: BANGERS, fontSize: 16, letterSpacing: 2, color: RED },
  loseTitle: { fontFamily: BANGERS, fontSize: 38, color: '#fff', letterSpacing: 0.5 },
  loseSub: { fontSize: 13, color: '#a1a1aa', marginTop: 2 },
  scoreCard: {
    backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, padding: 16, marginBottom: 12,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  scoreTeam: { flex: 1, alignItems: 'center', gap: 4 },
  scoreEmoji: { fontSize: 36 },
  scorePower: { fontFamily: BANGERS, fontSize: 32 },
  scoreLabel: { fontSize: 11, color: '#a1a1aa' },
  scoreDivider: { width: 1, height: 50, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 10 },
  counterCard: {
    backgroundColor: '#1a0707', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
    borderRadius: 16, padding: 14, marginBottom: 12,
  },
  counterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  counterTitle: { fontSize: 12, fontWeight: '800', color: RED },
  counterTimer: { fontFamily: BANGERS, fontSize: 20, color: RED },
  counterDesc: { fontSize: 12, color: '#a1a1aa', lineHeight: 18, marginBottom: 12 },
  counterBtn: {
    borderWidth: 1.5, borderColor: RED, backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 10,
  },
  counterBtnText: { fontSize: 14, fontWeight: '900', color: RED },
  counterBar: {
    height: 3, backgroundColor: '#2a2a2a', borderRadius: 2, overflow: 'hidden',
  },
  counterBarFill: { height: '100%', borderRadius: 2, backgroundColor: RED },
  windowClosed: {
    backgroundColor: '#111', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12,
  },
  windowClosedText: { fontSize: 12, color: '#52525b' },
  intelCard: {
    backgroundColor: '#111', borderWidth: 1, borderColor: 'rgba(250,204,21,0.15)',
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  intelTitle: { fontSize: 12, fontWeight: '800', color: GOLD, marginBottom: 8 },
  intelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  intelEmoji: { fontSize: 28 },
  intelName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  intelPowerText: { fontSize: 12, color: '#a1a1aa' },
  viewResultsBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 15, alignItems: 'center',
  },
  viewResultsText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
});
