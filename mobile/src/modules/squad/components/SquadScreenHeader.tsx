import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SquadBackButton } from './SquadBackButton';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';

interface Props {
  title: string;
  insetTop: number;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function SquadScreenHeader({ title, insetTop, onBack, right }: Props) {
  return (
    <View style={[s.topBar, { paddingTop: insetTop + 12 }]}>
      {onBack ? (
        <View style={s.sideSlot}>
          <SquadBackButton onPress={onBack} />
        </View>
      ) : (
        <View style={s.sideSlot} />
      )}
      <Text style={s.topTitle} numberOfLines={1}>
        {title}
      </Text>
      {right ?? <View style={s.sideSlot} />}
    </View>
  );
}

const s = StyleSheet.create({
  topBar: {
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideSlot: { width: 32, alignItems: 'flex-start' },
  topTitle: {
    flex: 1,
    fontFamily: BANGERS,
    fontSize: 22,
    color: GOLD,
    letterSpacing: 1,
    textAlign: 'center',
  },
});
