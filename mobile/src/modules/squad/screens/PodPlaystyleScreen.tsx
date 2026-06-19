import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SquadScreenHeader } from '../components/SquadScreenHeader';
import type { PlayStyle } from '../podConstants';

const LIME = '#a3e635';

const PLAYSTYLE_OPTIONS: Array<{ key: PlayStyle; label: string; emoji: string; sub: string }> = [
  { key: 'partner',    label: 'My partner',          emoji: '💑', sub: 'Doubles partner or best half' },
  { key: 'friend',     label: 'Close friends',        emoji: '👯', sub: '2-4 people I play with most' },
  { key: 'group',      label: 'Regular group',        emoji: '🏓', sub: 'Our usual crew at the courts' },
  { key: 'colleagues', label: 'Work colleagues',      emoji: '💼', sub: 'Office warriors, lunch breakers' },
  { key: 'open_play',  label: 'Open play regulars',   emoji: '🌐', sub: 'People I keep running into' },
  { key: 'solo',       label: 'Just me for now',      emoji: '🧘', sub: "I'll build my Pod later" },
];

interface Props {
  onSelected: (playStyle: PlayStyle) => void;
  onSkip: () => void;
  onBack?: () => void;
}

export function PodPlaystyleScreen({ onSelected, onSkip, onBack }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={s.container}>
      <SquadScreenHeader title="YOUR POD" insetTop={insets.top} onBack={onBack ?? onSkip} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>Who do you usually{'\n'}play with?</Text>
        <Text style={s.sub}>Your Pod is a 2–4 person inner circle inside your Squad.</Text>

        <View style={s.options}>
          {PLAYSTYLE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={s.option}
              onPress={() => onSelected(opt.key)}
              activeOpacity={0.75}
            >
              <Text style={s.optionEmoji}>{opt.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.optionLabel}>{opt.label}</Text>
                <Text style={s.optionSub}>{opt.sub}</Text>
              </View>
              <Text style={s.arrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingBottom: 60 },
  heading: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 36,
    marginBottom: 8,
  },
  sub: { fontSize: 14, color: '#71717a', lineHeight: 20, marginBottom: 28 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 16,
  },
  optionEmoji: { fontSize: 28 },
  optionLabel: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 2 },
  optionSub: { fontSize: 12, color: '#71717a' },
  arrow: { fontSize: 20, color: '#52525b' },
});
