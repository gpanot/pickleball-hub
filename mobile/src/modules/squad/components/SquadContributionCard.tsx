import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PlayerContribution } from '../types';

const GOLD = '#facc15';

interface Props {
  contribution: PlayerContribution;
}

export function SquadContributionCard({ contribution }: Props) {
  return (
    <View style={s.container}>
      <Text style={s.label}>YOUR CONTRIBUTION</Text>
      <View style={s.row}>
        <View style={s.stat}>
          <Text style={s.value}>{contribution.sessions}</Text>
          <Text style={s.sub}>SESSIONS</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.value, { color: GOLD }]}>{contribution.xpEarned}</Text>
          <Text style={s.sub}>XP EARNED</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.value}>{contribution.chestsOpened}</Text>
          <Text style={s.sub}>CHESTS OPENED</Text>
        </View>
      </View>
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
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    marginHorizontal: 3,
  },
  value: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 2,
  },
  sub: {
    fontSize: 9,
    fontWeight: '800',
    color: '#52525b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
