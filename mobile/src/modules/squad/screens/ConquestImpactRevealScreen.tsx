import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConquestImpactBreakdown } from '../types';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const GOLD = '#facc15';
const RED = '#ef4444';
const SURFACE = '#141414';

interface Props {
  data: ConquestImpactBreakdown;
  mySquadId: string;
  mySquadEmoji: string;
  onShare: () => void;
  onDone: () => void;
}

function CountUpNumber({ target, duration = 1400 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let rafId = 0;
    let cancelled = false;
    const startTime = Date.now();
    const tick = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [target, duration]);
  return <>{value}</>;
}

export function ConquestImpactRevealScreen({
  data, mySquadId, mySquadEmoji, onShare, onDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const totalInf = data.totalInf ?? 0;
  const xpAwarded = data.xpAwarded ?? 0;

  const rankChanged = data.prevRank !== null && data.venueRank !== null
    && data.prevRank !== data.venueRank;
  const rankImproved = rankChanged && data.venueRank! < data.prevRank!;

  const battleWins = data.battles.filter(b =>
    b.winnerSquadId === mySquadId
  ).length;
  const battleTotal = data.battles.length;

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Animated INF number */}
      <View style={s.bigInfSection}>
        <Text style={s.infLabel}>INF EARNED</Text>
        <Animated.Text
          style={[s.infNumber, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
        >
          +<CountUpNumber target={totalInf} />
        </Animated.Text>
        <Text style={s.xpLine}>+{xpAwarded} Squad XP</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {/* Venue and rank */}
        <View style={s.venueSection}>
          <View style={s.venueRow}>
            <Text style={s.venueIcon}>🏟️</Text>
            <View>
              <Text style={s.venueName}>{data.venueName}</Text>
              {data.venueRank && (
                <Text style={s.venueRank}>
                  Rank #{data.venueRank} at this venue
                  {rankImproved && (
                    <Text style={s.rankUp}> ▲ up from #{data.prevRank}</Text>
                  )}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Breakdown rows */}
        <View style={s.breakdownCard}>
          <Text style={s.sectionLabel}>INF BREAKDOWN</Text>

          <BreakdownRow icon="📍" label="Base INF (time on court)" value={data.baseInf} color={LIME} />
          {data.copresentBonus > 0 && (
            <BreakdownRow icon="👥" label="Squad co-presence bonus" value={data.copresentBonus} color={LIME} />
          )}
          {data.clashMultiplier > 1 && (
            <BreakdownRow
              icon="⚔️"
              label={`Clash multiplier ×${data.clashMultiplier.toFixed(1)}`}
              value={null}
              color={RED}
              tag="ACTIVE"
              tagColor={RED}
            />
          )}
          {data.overlordMultiplier > 1 && (
            <BreakdownRow
              icon="👑"
              label={`Overlord bonus ×${data.overlordMultiplier.toFixed(1)}`}
              value={null}
              color={GOLD}
              tag="CONTROL"
              tagColor={GOLD}
            />
          )}
          {data.cardBonus > 0 && (
            <BreakdownRow icon="🃏" label="Card battle bonus" value={data.cardBonus} color={GOLD} />
          )}

          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalValue}>+{totalInf} INF</Text>
          </View>
        </View>

        {/* Battle results */}
        {data.battles.length > 0 && (
          <View style={s.battlesCard}>
            <Text style={s.sectionLabel}>BATTLE RESULTS ({battleWins}/{battleTotal} won)</Text>
            {data.battles.map((battle, i) => {
              const won = battle.winnerSquadId === mySquadId;
              return (
                <View key={i} style={[s.battleRow, i < data.battles.length - 1 && s.battleRowBorder]}>
                  <Text style={s.battleIcon}>{battle.isCounterAttack ? '↩️' : '⚔️'}</Text>
                  <View style={s.battleInfo}>
                    <Text style={s.battleLabel}>
                      {battle.isCounterAttack ? 'Counter-attack' : `Battle #${battle.battleNumber}`}
                    </Text>
                    <Text style={s.battlePower}>
                      {battle.initiatingPower} vs {battle.rivalPower}
                    </Text>
                  </View>
                  <View style={[s.battleResult, won ? s.battleResultWin : s.battleResultLoss]}>
                    <Text style={[s.battleResultText, { color: won ? LIME : RED }]}>
                      {won ? 'WIN' : 'LOSS'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Notify info */}
        {data.notifiedMemberCount > 0 && (
          <Text style={s.notifyText}>
            {data.notifiedMemberCount} squadmate{data.notifiedMemberCount > 1 ? 's' : ''} notified
          </Text>
        )}

        {/* Rival */}
        {data.rivalSquadName && (
          <View style={s.rivalCard}>
            <Text style={s.rivalLabel}>Battle against</Text>
            <View style={s.rivalRow}>
              <Text style={s.rivalEmoji}>{data.rivalSquadEmoji}</Text>
              <Text style={s.rivalName}>{data.rivalSquadName}</Text>
            </View>
          </View>
        )}

        {/* CTAs */}
        <View style={s.ctaSection}>
          <TouchableOpacity style={s.shareBtn} onPress={onShare} activeOpacity={0.82}>
            <Text style={s.shareBtnText}>📤 Share Results</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.doneBtn} onPress={onDone} activeOpacity={0.82}>
            <Text style={s.doneBtnText}>Back to Squad</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function BreakdownRow({
  icon, label, value, color, tag, tagColor,
}: {
  icon: string;
  label: string;
  value: number | null;
  color: string;
  tag?: string;
  tagColor?: string;
}) {
  return (
    <View style={bd.row}>
      <Text style={bd.icon}>{icon}</Text>
      <Text style={bd.label}>{label}</Text>
      {value !== null ? (
        <Text style={[bd.value, { color }]}>+{value}</Text>
      ) : (
        tag && (
          <View style={[bd.tag, { borderColor: `${tagColor ?? color}40`, backgroundColor: `${tagColor ?? color}10` }]}>
            <Text style={[bd.tagText, { color: tagColor ?? color }]}>{tag}</Text>
          </View>
        )
      )}
    </View>
  );
}

const bd = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  icon: { fontSize: 15, width: 22 },
  label: { flex: 1, fontSize: 13, color: '#a1a1aa' },
  value: { fontFamily: BANGERS, fontSize: 18, letterSpacing: 0.5 },
  tag: {
    borderWidth: 1, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2,
  },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  bigInfSection: {
    backgroundColor: '#071a07',
    paddingVertical: 24, paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: 'rgba(163,230,53,0.15)',
  },
  infLabel: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.5,
    color: LIME, marginBottom: 4,
  },
  infNumber: {
    fontFamily: BANGERS, fontSize: 72, color: '#fff', letterSpacing: 1,
    textShadowColor: LIME,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  xpLine: { fontSize: 13, color: LIME, fontWeight: '700', marginTop: 4 },
  scroll: { paddingBottom: 100 },
  venueSection: { padding: 14 },
  venueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  venueIcon: { fontSize: 24 },
  venueName: { fontSize: 14, fontWeight: '800', color: '#fff' },
  venueRank: { fontSize: 11, color: '#a1a1aa', marginTop: 2 },
  rankUp: { color: LIME, fontWeight: '700' },

  breakdownCard: {
    marginHorizontal: 14, marginBottom: 10,
    backgroundColor: SURFACE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 14,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2,
    color: '#52525b', marginBottom: 10,
  },
  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  totalLabel: { fontSize: 12, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  totalValue: { fontFamily: BANGERS, fontSize: 24, color: LIME },

  battlesCard: {
    marginHorizontal: 14, marginBottom: 10,
    backgroundColor: SURFACE, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 14,
  },
  battleRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10,
  },
  battleRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  battleIcon: { fontSize: 16, width: 22 },
  battleInfo: { flex: 1 },
  battleLabel: { fontSize: 13, fontWeight: '700', color: '#fff' },
  battlePower: { fontSize: 11, color: '#a1a1aa', marginTop: 1 },
  battleResult: {
    borderWidth: 1, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3,
  },
  battleResultWin: { backgroundColor: 'rgba(163,230,53,0.1)', borderColor: 'rgba(163,230,53,0.3)' },
  battleResultLoss: { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' },
  battleResultText: { fontSize: 10, fontWeight: '800' },

  notifyText: {
    textAlign: 'center', fontSize: 11, color: '#52525b', marginBottom: 10,
  },

  rivalCard: {
    marginHorizontal: 14, marginBottom: 14,
    backgroundColor: 'rgba(250,204,21,0.06)',
    borderWidth: 1, borderColor: 'rgba(250,204,21,0.15)',
    borderRadius: 16, padding: 12,
  },
  rivalLabel: { fontSize: 11, color: '#52525b', marginBottom: 6 },
  rivalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rivalEmoji: { fontSize: 22 },
  rivalName: { fontSize: 14, fontWeight: '700', color: GOLD },

  ctaSection: { paddingHorizontal: 14, gap: 10, paddingBottom: 24 },
  shareBtn: {
    backgroundColor: 'rgba(163,230,53,0.12)', borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.4)', borderRadius: 16, padding: 15, alignItems: 'center',
  },
  shareBtnText: { fontSize: 15, fontWeight: '800', color: LIME },
  doneBtn: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 14, alignItems: 'center',
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#a1a1aa' },
});
