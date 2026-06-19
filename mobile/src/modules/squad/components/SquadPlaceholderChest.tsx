import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');

export function SquadPlaceholderChest() {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -10, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [y]);

  return (
    <View style={s.container}>
      <View style={s.card}>
        <Animated.View style={{ transform: [{ translateY: y }] }}>
          <Image source={CHEST_IMAGE} style={s.chest} resizeMode="contain" />
        </Animated.View>
        <Text style={s.lock}>🔒</Text>
        <Text style={s.title}>Squad Chest</Text>
        <Text style={s.sub}>When squadmates play, everyone earns rewards.</Text>
        <Text style={s.hint}>CHECK IN TO UNLOCK</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 12 },
  card: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(250,204,21,0.15)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  chest: { width: 80, height: 80, opacity: 0.4 },
  lock: { fontSize: 22, marginTop: 8 },
  title: { fontFamily: BANGERS, fontSize: 18, color: GOLD, marginTop: 8 },
  sub: { fontSize: 13, color: '#a1a1aa', textAlign: 'center', marginTop: 4, lineHeight: 20 },
  hint: { fontSize: 11, color: '#52525b', marginTop: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
