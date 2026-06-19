import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChestOpenAnimation } from '../components/ChestOpenAnimation';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface Props {
  clubTokensAwarded: number;
  brandTokensAwarded: number;
  xpAwarded: number;
  squadName: string;
  onDone: () => void;
}

export function SquadChestOpenScreen({ clubTokensAwarded, brandTokensAwarded, xpAwarded, squadName, onDone }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.container, { paddingBottom: insets.bottom + 20 }]}>
      <ChestOpenAnimation
        clubTokensAwarded={clubTokensAwarded}
        brandTokensAwarded={brandTokensAwarded}
        xpAwarded={xpAwarded}
        squadName={squadName}
      />
      <View style={s.bottomAction}>
        <TouchableOpacity style={s.doneBtn} onPress={onDone} activeOpacity={0.8}>
          <Text style={s.doneBtnText}>Collect 🎁</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050a02' },
  bottomAction: { paddingHorizontal: 24, paddingTop: 16 },
  doneBtn: {
    backgroundColor: LIME,
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doneBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
