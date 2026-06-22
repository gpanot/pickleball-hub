import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const BANGERS_FONT = 'Bangers_400Regular';
const DM_SANS_BOLD = 'DMSans_700Bold';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

function useFloatAnim() {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -14, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [y]);
  return y;
}

interface Props {
  onCreateSquad: () => void;
  onBackFromStart?: () => void;
}

export function SquadCarouselScreen({ onCreateSquad }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useFloatAnim();

  return (
    <LinearGradient colors={['#1a1a1a', '#0a0a0a', '#000000']} locations={[0, 0.45, 1]} style={s.container}>
      <View style={[s.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>

        {/* Floating chest */}
        <Animated.View style={[s.chestWrap, { transform: [{ translateY }] }]} collapsable={false} renderToHardwareTextureAndroid>
          <Image source={CHEST_IMAGE} style={s.chestImg} resizeMode="contain" />
        </Animated.View>

        {/* Headline */}
        <Text style={s.title}>Play together.{'\n'}Earn together.</Text>

        {/* Feature bullets */}
        <View style={s.bullets}>
          <BulletRow text="Every game earns rewards for your whole squad." />
          <BulletRow text="Open squad chests. Collect XP. Climb the leaderboard." />
          <BulletRow text="Build something real with your crew." highlight />
        </View>

        {/* CTA */}
        <View style={s.ctaWrap}>
          <TouchableOpacity onPress={onCreateSquad} activeOpacity={0.85} style={s.ctaBtn}>
            <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGrad}>
              <Text style={s.ctaText}>LET'S START</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

      </View>
    </LinearGradient>
  );
}

function BulletRow({ text, highlight }: { text: string; highlight?: boolean }) {
  return (
    <View style={s.bulletRow}>
      <Text style={[s.bulletDot, highlight && { color: LIME }]}>•</Text>
      <Text style={[s.bulletText, highlight && s.bulletTextHighlight]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 0,
  },
  chestWrap: { marginBottom: 36 },
  chestImg: { width: 150, height: 150 },
  title: {
    fontFamily: BANGERS_FONT,
    fontSize: 40,
    lineHeight: 46,
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 28,
  },
  bullets: {
    width: '100%',
    gap: 12,
    marginBottom: 40,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    fontSize: 18,
    color: '#71717a',
    lineHeight: 24,
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#a1a1aa',
    lineHeight: 22,
    fontFamily: DM_SANS_BOLD,
  },
  bulletTextHighlight: {
    color: '#fff',
  },
  ctaWrap: { width: '100%' },
  ctaBtn: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  ctaGrad: {
    paddingVertical: 17,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
  },
  ctaText: {
    fontFamily: BANGERS_FONT,
    fontSize: 20,
    letterSpacing: 1.5,
    color: '#000',
  },
});
