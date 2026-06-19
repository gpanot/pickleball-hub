import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

const GOLD = '#facc15';
const LIME = '#a3e635';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan small.png');

// 4 check-ins in 7 days → streak chest on the 5th (completion) day
const CHECKINS_REQUIRED = 4;
const WINDOW_DAYS = 7;
const CHEST_DAY = CHECKINS_REQUIRED + 1; // day 5 = reward day

interface Props {
  streakDays: number;        // how many check-in days this rolling week (0–4)
  weekCheckIns?: number;     // alias: same value, prefer this going forward
  onStreakChestReady?: () => void;
}

export function SquadStreakTracker({ streakDays, weekCheckIns }: Props) {
  const count = weekCheckIns ?? streakDays;
  const completed = count >= CHECKINS_REQUIRED;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>🔥 Squad Streak</Text>
          <Text style={s.sub}>
            {completed
              ? 'Streak complete — chest unlocked for everyone!'
              : `${count} of ${CHECKINS_REQUIRED} check-ins this week`}
          </Text>
        </View>
        <View style={[s.xpPill, completed && s.xpPillGold]}>
          <Text style={[s.xpPillText, completed && s.xpPillTextGold]}>
            {completed ? '🎉 +50 XP each' : '+20 XP / check-in'}
          </Text>
        </View>
      </View>

      {/* Day track */}
      <View style={s.track}>
        {/* 4 check-in day nodes */}
        {Array.from({ length: CHECKINS_REQUIRED }).map((_, i) => {
          const done = i < count;
          const isNext = i === count && !completed;
          return (
            <React.Fragment key={i}>
              <View style={s.nodeCol}>
                <Text style={s.dayLabel}>DAY {i + 1}</Text>
                <View style={[s.node, done && s.nodeDone, isNext && s.nodeNext]}>
                  {done ? (
                    <Text style={s.nodeCheck}>✓</Text>
                  ) : (
                    <View style={[s.nodeInnerDot, isNext && s.nodeInnerDotNext]} />
                  )}
                </View>
              </View>
              <View style={[s.arrow, done && i < count - 1 && s.arrowDone]}>
                <Text style={[s.arrowText, (done && i < count - 1) ? s.arrowTextDone : {}]}>→</Text>
              </View>
            </React.Fragment>
          );
        })}

        {/* Chest reward node */}
        <View style={s.nodeCol}>
          <Text style={[s.dayLabel, s.dayLabelChest]}>CHEST</Text>
          <View style={[s.chestNode, completed && s.chestNodeDone]}>
            <Image
              source={CHEST_IMAGE}
              style={[s.chestImg, !completed && s.chestImgDim]}
              resizeMode="contain"
            />
          </View>
          {completed && <Text style={s.chestReadyLabel}>CHEST</Text>}
        </View>
      </View>

      {/* Progress caption */}
      {!completed && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { flex: count / CHECKINS_REQUIRED }]} />
          <View style={{ flex: 1 - count / CHECKINS_REQUIRED }} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 14,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: '900', color: '#fff' },
  sub: { fontSize: 11, color: '#71717a', marginTop: 2, lineHeight: 16 },
  xpPill: {
    backgroundColor: 'rgba(163,230,53,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(163,230,53,0.25)',
  },
  xpPillGold: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderColor: 'rgba(250,204,21,0.35)',
  },
  xpPillText: { fontSize: 10, fontWeight: '800', color: LIME, textAlign: 'right' },
  xpPillTextGold: { color: GOLD },

  // Track
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nodeCol: { alignItems: 'center', gap: 6 },
  dayLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayLabelChest: { color: GOLD },

  node: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2a2a2a',
  },
  nodeDone: {
    backgroundColor: LIME,
    borderColor: LIME,
  },
  nodeNext: {
    borderColor: GOLD,
    borderStyle: 'dashed',
  },
  nodeCheck: { fontSize: 15, color: '#000', fontWeight: '900' },
  nodeInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2a2a2a',
  },
  nodeInnerDotNext: { backgroundColor: GOLD },

  // Arrow connectors
  arrow: { alignItems: 'center', justifyContent: 'center', paddingBottom: 12 },
  arrowText: { fontSize: 12, color: '#2a2a2a' },
  arrowDone: {},
  arrowTextDone: { color: 'rgba(163,230,53,0.4)' },

  // Chest node
  chestNode: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(250,204,21,0.2)',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  chestNodeDone: {
    borderStyle: 'solid',
    borderColor: GOLD,
    backgroundColor: 'rgba(250,204,21,0.08)',
  },
  chestImg: { width: 34, height: 34 },
  chestImgDim: { opacity: 0.35 },
  chestReadyLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 0.5,
  },

  // Progress bar
  progressBar: {
    flexDirection: 'row',
    height: 3,
    borderRadius: 2,
    backgroundColor: '#1e1e1e',
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: LIME,
    borderRadius: 2,
  },
});
