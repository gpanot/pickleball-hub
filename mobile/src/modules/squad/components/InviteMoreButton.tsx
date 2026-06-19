import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface Props {
  onPress: () => void;
  label?: string;
}

export function InviteMoreButton({ onPress, label = 'Invite more players →' }: Props) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={s.wrapper}>
      <LinearGradient colors={[LIME, LIME_DARK]} style={s.gradient}>
        <Text style={s.text}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrapper: { marginHorizontal: 16 },
  gradient: {
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
  },
  text: { fontSize: 16, fontWeight: '900', color: '#000' },
});
