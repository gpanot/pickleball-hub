import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Easing, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Path } from 'react-native-svg';
import { SquadBackButton } from '../components/SquadBackButton';
import type { ConquestSession, SquadCardData, ClashRival } from '../types';
import { formatCountdown } from '../hooks/useConquest';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';
const RED = '#ef4444';
const SURFACE = '#141414';
const BLUE = '#7dd3fc';
const RADAR_SIZE = 200;
const R = RADAR_SIZE / 2;

interface Props {
  session: ConquestSession;
  mySquad: { id: string; name: string; emoji: string; level: number };
  friendlyNames: string[];
  cardData: SquadCardData | null;
  onBack: () => void;
  // Called when user taps "Watch battle" — goes straight to battle screen
  onWatchBattle: () => void;
  // Called when user taps "See result" — goes straight to win/lose screen
  onSeeResult: () => void;
  // Called when "Start Battle" is tapped (or auto-fires after countdown)
  onPlayCard: () => Promise<void>;
  activeBattle?: { id: string; revealed: boolean; winnerSquadId: string | null } | null;
}

// ── Fixed ambient blip positions ───────────────────────────────────────────────
const AMBIENT_BLIPS: Array<[number, number, string]> = [
  [25,  0.52, 'a'],
  [70,  0.72, 'b'],
  [130, 0.40, 'c'],
  [175, 0.65, 'd'],
  [240, 0.55, 'e'],
  [305, 0.38, 'f'],
];

function polarToXY(angleDeg: number, radiusFraction: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: R + Math.cos(rad) * radiusFraction * R * 0.9,
    y: R + Math.sin(rad) * radiusFraction * R * 0.9,
  };
}

function RadarSweep({ sweepAnim }: { sweepAnim: Animated.Value }) {
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { transform: [{ rotate: sweepAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
      ]}
    >
      <Svg width={RADAR_SIZE} height={RADAR_SIZE} style={StyleSheet.absoluteFillObject}>
        <Defs>
          <RadialGradient id="sweep" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={LIME} stopOpacity="0.5" />
            <Stop offset="100%" stopColor={LIME} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Path d={`M ${R} ${R} L ${R} 0`} stroke={LIME} strokeWidth={2} strokeOpacity={0.7} />
        <Path
          d={`M ${R} ${R} L ${R} 0 A ${R} ${R} 0 0 0 ${R + Math.sin(-70 * Math.PI / 180) * R} ${R + Math.cos(-70 * Math.PI / 180) * R} Z`}
          fill="url(#sweep)"
          fillOpacity={0.25}
        />
      </Svg>
    </Animated.View>
  );
}

function AmbientBlip({ x, y, delay }: { x: number; y: number; delay: number }) {
  const pulse = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(pulse, { toValue: 1, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 900, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.delay(1200 + delay % 800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, delay]);

  return (
    <Animated.View
      style={[s.blip, s.blipBlue, { position: 'absolute', left: x - 4, top: y - 4, opacity: pulse }]}
    />
  );
}

const AUTO_BATTLE_DELAY = 20;

export function ConquestActiveSessionScreen({
  session,
  mySquad,
  friendlyNames,
  cardData,
  onBack,
  onWatchBattle,
  onSeeResult,
  onPlayCard,
  activeBattle,
}: Props) {
  const insets = useSafeAreaInsets();

  // Auto-exit if session expires
  useEffect(() => {
    if (session.state === 'expired') onBack();
  }, [session.state, onBack]);

  const sweepAnim = useRef(new Animated.Value(0)).current;
  const blipAnim1 = useRef(new Animated.Value(1)).current;
  const blipAnim2 = useRef(new Animated.Value(1)).current;
  const blipAnim3 = useRef(new Animated.Value(1)).current;

  const [revealSeconds, setRevealSeconds] = useState(() =>
    Math.max(0, Math.floor((new Date(session.autoEndsAt).getTime() - Date.now()) / 1000))
  );

  // Radar sweep
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweepAnim, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [sweepAnim]);

  // Rival blip flicker
  useEffect(() => {
    if (!session.isClashActive) return;
    const make = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 0.15, duration: 600, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
    const l1 = make(blipAnim1, 0);
    const l2 = make(blipAnim2, 400);
    const l3 = make(blipAnim3, 800);
    l1.start(); l2.start(); l3.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); };
  }, [session.isClashActive, blipAnim1, blipAnim2, blipAnim3]);

  // Session countdown
  useEffect(() => {
    setRevealSeconds(Math.max(0, Math.floor((new Date(session.autoEndsAt).getTime() - Date.now()) / 1000)));
    const t = setInterval(() => setRevealSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [session.autoEndsAt]);

  const autoRevealTotal = Math.floor(
    (new Date(session.autoEndsAt).getTime() - new Date(session.startedAt).getTime()) / 1000
  );
  const revealProgress = autoRevealTotal > 0
    ? Math.min(1, 1 - revealSeconds / autoRevealTotal) : 1;

  const ambientBlips = useMemo(() =>
    AMBIENT_BLIPS.map(([angle, frac, key]) => {
      const { x, y } = polarToXY(angle, frac);
      return { x, y, key };
    }), []);

  const friendlyBlipPositions = [
    { top: '42%' as const, left: '57%' as const },
    { top: '30%' as const, left: '38%' as const },
  ];

  // Build rivals list from session
  const rivals: ClashRival[] = session.clashRivals ?? (
    session.isClashActive && session.clashPartnerSquadId
      ? [{ squadId: session.clashPartnerSquadId, squadName: session.clashPartnerSquadName ?? 'Rival', squadEmoji: '🦅', battle: null }]
      : []
  );

  const hasBattle = !!activeBattle;
  const battleRevealed = activeBattle?.revealed || !!activeBattle?.winnerSquadId;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <SquadBackButton onPress={onBack} />
        <View style={s.headerCenter}>
          <Text style={s.headerSubtitle}>📡 RADAR PULSE ACTIVE</Text>
          <Text style={s.headerTitle}>{session.venueName.toUpperCase()}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.courtDot} />
          <Text style={s.courtLabel}>Live</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* ── Radar ── */}
        <View style={s.radarSection}>
          <Text style={s.radarLabel}>⚡ LIVE COURT RADAR</Text>
          <View style={[s.radarWrap, { width: RADAR_SIZE, height: RADAR_SIZE }]}>
            <View style={[s.ring, s.ring1]} />
            <View style={[s.ring, s.ring2]} />
            <View style={[s.ring, s.ring3]} />
            <RadarSweep sweepAnim={sweepAnim} />
            {ambientBlips.map(({ x, y, key }, i) => (
              <AmbientBlip key={key} x={x} y={y} delay={i * 350} />
            ))}
            {friendlyNames.slice(0, 2).map((_, i) => (
              <View key={i} style={[s.blip, s.blipLime, { position: 'absolute', ...friendlyBlipPositions[i] }]} />
            ))}
            {session.isClashActive && (
              <>
                <Animated.View style={[s.blip, s.blipGold, s.rivalPos1, { opacity: blipAnim1 }]} />
                <Animated.View style={[s.blip, s.blipGold, s.rivalPos2, { opacity: blipAnim2 }]} />
                <Animated.View style={[s.blip, s.blipGold, s.rivalPos3, { opacity: blipAnim3 }]} />
              </>
            )}
            <View style={s.centerDot} />
          </View>
          <View style={s.legend}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: LIME }]} /><Text style={s.legendText}>Your squad</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: BLUE }]} /><Text style={s.legendText}>Players nearby</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: GOLD }]} /><Text style={s.legendText}>Rival squad</Text></View>
          </View>
        </View>

        {/* ── Per-rival: VS card + squad card (merged from Rival Reveal screen) ── */}
        {rivals.length > 0 ? rivals.map((rival) => (
          <RivalSection
            key={rival.squadId}
            rival={rival}
            mySquad={mySquad}
            cardData={cardData}
            hasBattle={hasBattle}
            battleRevealed={!!battleRevealed}
            onPlayCard={onPlayCard}
            onWatchBattle={onWatchBattle}
            onSeeResult={onSeeResult}
          />
        )) : (
          <View style={s.noRivalCard}>
            <Text style={s.noRivalText}>No rival detected · INF accumulating quietly 🕵️</Text>
          </View>
        )}

        {/* ── Co-present row ── */}
        {friendlyNames.length > 0 && (
          <View style={s.copresentRow}>
            <View style={s.copresentAvatars}>
              {friendlyNames.slice(0, 3).map((name, i) => (
                <View key={i} style={[s.cpAvatar, { marginLeft: i > 0 ? -8 : 0 }, i === 0 ? s.cpAvatarFirst : null]}>
                  <Text style={s.cpInitial}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              ))}
            </View>
            <Text style={s.copresentText}>
              {friendlyNames.join(', ')} · <Text style={{ color: LIME }}>{mySquad.name}</Text>
            </Text>
          </View>
        )}

        {/* ── Auto-reveal countdown ── */}
        <View style={s.revealCard}>
          <Text style={s.revealLabel}>INF AUTO-REVEALS IN</Text>
          <Text style={s.revealValue}>{formatCountdown(revealSeconds)}</Text>
          <View style={s.revealBar}>
            <View style={[s.revealBarFill, { width: `${Math.round(revealProgress * 100)}%` }]} />
          </View>
          <Text style={s.revealNote}>Session ends automatically · just keep playing 🏓</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Per-rival section: VS card + squad card ──────────────────────────────────

function RivalSection({
  rival,
  mySquad,
  cardData,
  hasBattle,
  battleRevealed,
  onPlayCard,
  onWatchBattle,
  onSeeResult,
}: {
  rival: ClashRival;
  mySquad: { id: string; name: string; emoji: string; level: number };
  cardData: SquadCardData | null;
  hasBattle: boolean;
  battleRevealed: boolean;
  onPlayCard: () => Promise<void>;
  onWatchBattle: () => void;
  onSeeResult: () => void;
}) {
  const [autoCountdown, setAutoCountdown] = useState(AUTO_BATTLE_DELAY);
  const firedRef = useRef(false);
  const [playing, setPlaying] = useState(false);

  // 20-second auto-battle countdown — fires onPlayCard automatically
  useEffect(() => {
    if (hasBattle) return;
    firedRef.current = false;
    setAutoCountdown(AUTO_BATTLE_DELAY);
    const t = setInterval(() => {
      setAutoCountdown(prev => {
        const next = prev - 1;
        if (next <= 0 && !firedRef.current) {
          firedRef.current = true;
          setTimeout(async () => {
            setPlaying(true);
            try { await onPlayCard(); } finally { setPlaying(false); }
          }, 0);
          clearInterval(t);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBattle]);

  const handleManualPlay = async () => {
    if (playing || firedRef.current) return;
    firedRef.current = true;
    setPlaying(true);
    try { await onPlayCard(); } finally { setPlaying(false); }
  };

  return (
    <>
      {/* Trigger banner */}
      <View style={s.triggerBanner}>
        <View style={s.triggerDot} />
        <Text style={s.triggerText}>
          {rival.squadName} just checked in — battle triggered automatically
        </Text>
      </View>

      {/* VS card */}
      <View style={s.vsCard}>
        <View style={s.vsWatermark}><Text style={s.vsWatermarkText}>⚔️</Text></View>
        <View style={s.vsRow}>
          <View style={s.vsSquad}>
            <Text style={s.vsEmoji}>{mySquad.emoji}</Text>
            <Text style={[s.vsName, { color: LIME }]}>{mySquad.name}</Text>
            <Text style={s.vsSub}>You</Text>
          </View>
          <View style={s.vsCenter}>
            <Text style={s.vsLabel}>VS</Text>
            <Text style={s.vsClash}>CLASH</Text>
          </View>
          <View style={s.vsSquad}>
            <Text style={s.vsEmoji}>{rival.squadEmoji}</Text>
            <Text style={[s.vsName, { color: GOLD }]}>{rival.squadName}</Text>
            <Text style={s.vsSub}>just arrived</Text>
          </View>
        </View>
        <View style={s.clashMultiplier}>
          <Text style={s.clashMultiplierText}>
            🏟️ <Text style={s.clashRed}>Arena Clash active</Text>{' '}— both squads earn ×2.0
          </Text>
          <Text style={s.clashX}>×2.0</Text>
        </View>
      </View>

      {/* Squad card */}
      <View style={s.cardSection}>
        <Text style={s.sectionLabel}>YOUR SQUAD CARD</Text>
        <View style={s.squadCard}>
          <View style={s.cardWatermark}><Text style={s.cardWatermarkText}>SQUAD CARD</Text></View>
          <View style={s.cardTopRow}>
            <View style={s.cardEmojiBox}><Text style={s.cardEmoji}>{mySquad.emoji}</Text></View>
            <View style={s.cardNameWrap}>
              <Text style={s.cardName}>{mySquad.name}</Text>
              <Text style={s.cardSubName}>Level {mySquad.level}</Text>
            </View>
            <View style={s.cardPowerWrap}>
              <Text style={s.cardPowerLabel}>CARD POWER</Text>
              <Text style={s.cardPower}>{cardData?.cardPowerInf ?? '…'}</Text>
              <Text style={s.cardPowerSub}>INF bonus</Text>
            </View>
          </View>
          <View style={s.cardStats}>
            <View style={s.cardStat}>
              <Text style={s.cardStatIcon}>🏆</Text>
              <Text style={s.cardStatValue}>{cardData?.venuesOwnedCount ?? 0}</Text>
              <Text style={s.cardStatLabel}>Venues owned</Text>
            </View>
            <View style={s.cardStat}>
              <Text style={s.cardStatIcon}>⚡</Text>
              <Text style={[s.cardStatValue, { color: LIME }]}>LV {mySquad.level}</Text>
              <Text style={s.cardStatLabel}>Squad level</Text>
            </View>
            <View style={s.cardStat}>
              <Text style={s.cardStatIcon}>🏓</Text>
              <Text style={[s.cardStatValue, { color: LIME }]}>{cardData?.activeMembersThisWeek ?? 0}</Text>
              <Text style={s.cardStatLabel}>Active this week</Text>
            </View>
          </View>

          {/* CTA — morphs based on battle state */}
          {hasBattle ? (
            <TouchableOpacity
              style={[s.playBtn, battleRevealed ? s.resultBtn : s.watchBtn]}
              onPress={battleRevealed ? onSeeResult : onWatchBattle}
              activeOpacity={0.82}
            >
              <Text style={[s.playBtnText, battleRevealed ? s.resultBtnText : s.watchBtnText]}>
                {battleRevealed ? '🏆 See result →' : '⚡ Watch the battle →'}
              </Text>
            </TouchableOpacity>
          ) : (
            // Auto-start progress bar — not tappable (fires automatically)
            <View style={s.autoStartBar}>
              <View style={[s.autoStartFill, { width: `${(autoCountdown / AUTO_BATTLE_DELAY) * 100}%` as any }]} />
              {playing ? (
                <ActivityIndicator color={RED} size="small" style={{ zIndex: 1 }} />
              ) : (
                <Text style={s.autoStartBarText}>⚔️ Battle is starting in {autoCountdown}s</Text>
              )}
            </View>
          )}
          <Text style={s.gamblerNote}>You don't know their card power — it's a gamble</Text>
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    gap: 12,
  },
  headerCenter: { flex: 1 },
  headerSubtitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: LIME },
  headerTitle: { fontFamily: BANGERS, fontSize: 24, color: '#fff', letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  courtDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#22c55e' },
  courtLabel: { fontSize: 11, color: '#a1a1aa' },
  scroll: { paddingBottom: 100 },

  // Radar
  radarSection: { alignItems: 'center', paddingTop: 16, paddingBottom: 10 },
  radarLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', color: '#52525b', marginBottom: 14 },
  radarWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(163,230,53,0.18)' },
  ring1: { width: 66, height: 66 },
  ring2: { width: 122, height: 122 },
  ring3: { width: 178, height: 178 },
  blip: { width: 8, height: 8, borderRadius: 4 },
  blipLime: { backgroundColor: LIME },
  blipGold: { backgroundColor: GOLD },
  blipBlue: { backgroundColor: BLUE, shadowColor: BLUE, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 5, elevation: 4 },
  rivalPos1: { position: 'absolute', top: '24%', left: '30%' },
  rivalPos2: { position: 'absolute', top: '32%', left: '20%' },
  rivalPos3: { position: 'absolute', top: '18%', left: '46%' },
  centerDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: LIME, shadowColor: LIME, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 10, elevation: 8 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#a1a1aa' },

  // No rival
  noRivalCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: 'rgba(163,230,53,0.05)',
    borderWidth: 1, borderColor: 'rgba(163,230,53,0.12)',
    borderRadius: 16, padding: 12,
  },
  noRivalText: { fontSize: 12, color: '#a1a1aa', textAlign: 'center' },

  // Trigger banner
  triggerBanner: {
    marginHorizontal: 16, marginTop: 6, marginBottom: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 10, padding: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  triggerDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: RED },
  triggerText: { fontSize: 12, fontWeight: '700', color: RED, flex: 1, lineHeight: 16 },

  // VS card
  vsCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#0f0d00',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.25)',
    borderRadius: 16, padding: 16, overflow: 'hidden',
  },
  vsWatermark: { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -40 }, { translateY: -40 }] },
  vsWatermarkText: { fontSize: 80, opacity: 0.04 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  vsSquad: { flex: 1, alignItems: 'center', gap: 4 },
  vsEmoji: { fontSize: 36, lineHeight: 40 },
  vsName: { fontFamily: BANGERS, fontSize: 17, letterSpacing: 0.5 },
  vsSub: { fontSize: 11, color: '#a1a1aa' },
  vsCenter: { alignItems: 'center', flexShrink: 0 },
  vsLabel: { fontFamily: BANGERS, fontSize: 26, color: RED, letterSpacing: 1 },
  vsClash: { fontSize: 9, fontWeight: '800', color: RED, letterSpacing: 1 },
  clashMultiplier: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  clashMultiplierText: { fontSize: 12, color: '#a1a1aa', flex: 1 },
  clashRed: { color: RED, fontWeight: '700' },
  clashX: { fontFamily: BANGERS, fontSize: 20, color: RED },

  // Squad card
  cardSection: { marginHorizontal: 16, marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 10 },
  squadCard: { backgroundColor: '#1a1a0a', borderWidth: 1.5, borderColor: 'rgba(250,204,21,0.4)', borderRadius: 20, padding: 18, overflow: 'hidden' },
  cardWatermark: { position: 'absolute', bottom: 10, right: 14 },
  cardWatermarkText: { fontFamily: BANGERS, fontSize: 11, letterSpacing: 2, color: 'rgba(250,204,21,0.15)' },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  cardEmojiBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardEmoji: { fontSize: 26 },
  cardNameWrap: { flex: 1, justifyContent: 'center' },
  cardName: { fontFamily: BANGERS, fontSize: 20, color: GOLD, letterSpacing: 0.5 },
  cardSubName: { fontSize: 11, color: '#a1a1aa', marginTop: 2 },
  cardPowerWrap: { alignItems: 'flex-end', flexShrink: 0 },
  cardPowerLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: '#52525b' },
  cardPower: { fontFamily: BANGERS, fontSize: 28, color: GOLD, lineHeight: 32 },
  cardPowerSub: { fontSize: 9, color: '#52525b' },
  cardStats: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  cardStat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 8, alignItems: 'center', gap: 2 },
  cardStatIcon: { fontSize: 16 },
  cardStatValue: { fontFamily: BANGERS, fontSize: 16, color: GOLD },
  cardStatLabel: { fontSize: 9, color: '#52525b', textAlign: 'center' },
  playBtn: { backgroundColor: GOLD, borderBottomWidth: 3, borderBottomColor: GOLD_DARK, borderRadius: 16, padding: 14, alignItems: 'center' },
  playBtnText: { fontSize: 15, fontWeight: '900', color: '#000' },
  watchBtn: { backgroundColor: 'rgba(239,68,68,0.12)', borderBottomWidth: 1, borderBottomColor: 'rgba(239,68,68,0.35)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
  watchBtnText: { color: '#f87171' },
  resultBtn: { backgroundColor: 'rgba(250,204,21,0.15)', borderBottomWidth: 1, borderBottomColor: 'rgba(250,204,21,0.5)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.5)' },
  resultBtnText: { color: GOLD },
  gamblerNote: { fontSize: 10, color: '#52525b', textAlign: 'center', marginTop: 8 },

  // Auto-start bar
  autoStartBar: {
    borderRadius: 12, overflow: 'hidden',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    height: 48, justifyContent: 'center', alignItems: 'center',
  },
  autoStartFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(239,68,68,0.18)', borderRadius: 12 },
  autoStartBarText: { fontSize: 13, fontWeight: '800', color: '#f87171', zIndex: 1 },

  // Co-present
  copresentRow: { marginHorizontal: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  copresentAvatars: { flexDirection: 'row' },
  cpAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e1e1e', borderWidth: 2, borderColor: LIME, alignItems: 'center', justifyContent: 'center' },
  cpAvatarFirst: { zIndex: 2 },
  cpInitial: { fontSize: 12, fontWeight: '900', color: '#fff' },
  copresentText: { fontSize: 12, color: '#a1a1aa', flex: 1 },

  // Auto-reveal countdown
  revealCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: SURFACE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', borderRadius: 16, padding: 14, alignItems: 'center' },
  revealLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: '#52525b', marginBottom: 6 },
  revealValue: { fontFamily: BANGERS, fontSize: 44, color: LIME, letterSpacing: 1 },
  revealBar: { width: '100%', height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  revealBarFill: { height: '100%', borderRadius: 2, backgroundColor: LIME },
  revealNote: { fontSize: 11, color: '#52525b', marginTop: 8 },
});
