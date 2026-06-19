import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const GOLD = '#facc15';
const GOLD_DARK = '#a16207';
const STONE_TOP = '#c9a45c';
const STONE_MID = '#8b6914';
const STONE_BOTTOM = '#4a3410';

interface Props {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Clash-of-Clans-style stone back tab with gold rim and depth. */
export function SquadBackButton({ onPress, style }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[s.wrap, style]}
    >
      <LinearGradient
        colors={[STONE_TOP, STONE_MID, STONE_BOTTOM]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={s.plaque}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={s.shine}
        />
        <Text style={s.arrow}>‹</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: 32,
    height: 28,
  },
  plaque: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: GOLD,
    borderBottomWidth: 3,
    borderBottomColor: GOLD_DARK,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 3,
  },
  shine: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 7,
  },
  arrow: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '900',
    color: '#fff8dc',
    marginLeft: -1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
