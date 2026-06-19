import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SquadBackButton } from '../components/SquadBackButton';

const BANGERS_FONT = 'Bangers_400Regular';
const DM_SANS = 'DMSans_400Regular';
const DM_SANS_BOLD = 'DMSans_700Bold';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');

const { width: W, height: H } = Dimensions.get('window');
const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';
const GOLD_BORDER = '#854d0e';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

const LB_DATA = [
  { rank: '01', emoji: '🐍', name: 'D1 VIPERS', xp: '12,450', highlight: false },
  { rank: '02', emoji: '🦁', name: 'D2 LIONS', xp: '10,200', highlight: true },
  { rank: '03', emoji: '🦅', name: 'SKY HAWKS', xp: '9,840', highlight: false },
];

const PERKS = ['Founder Badge', 'Early Access', 'First Squad Name Selection'];
const FLOAT_BG_EMOJIS = ['🦁', '🐉', '🦅', '🐺', '🏆', '🎁', '⚡', '🔥', '🦄', '🦋'];
const CAROUSEL_COUNT = 5;
const AUTO_ADVANCE_MS = 6000;

interface Props {
  onCreateSquad: () => void;
  /** Shown on slide 1 — return to gate / ready after carousel was completed once. */
  onBackFromStart?: () => void;
}

function useFloatAnim(delayMs = 0) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -15, duration: 1500, delay: delayMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [delayMs, y]);
  return y;
}

const FloatEmoji = ({ emoji, size = 72, delayMs = 0, style }: { emoji: string; size?: number; delayMs?: number; style?: object }) => {
  const translateY = useFloatAnim(delayMs);
  return (
    <Animated.Text style={[{ fontSize: size, marginBottom: 40, transform: [{ translateY }] }, style]}>
      {emoji}
    </Animated.Text>
  );
};

const FloatChest = ({ size = 140 }: { size?: number }) => {
  const translateY = useFloatAnim(0);
  return (
    <Animated.View style={{ marginBottom: 40, transform: [{ translateY }] }} collapsable={false} renderToHardwareTextureAndroid>
      <Image source={CHEST_IMAGE} style={{ width: size, height: size }} resizeMode="contain" />
    </Animated.View>
  );
};

const DriftEmoji = ({ emoji, leftPct, durationSec, delaySec }: { emoji: string; leftPct: number; durationSec: number; delaySec: number }) => {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: durationSec * 1000, delay: delaySec * 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [progress, durationSec, delaySec]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [H + 50, -100] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: `${leftPct}%` as any, opacity: 0.15, transform: [{ translateY }] }}>
      <Text style={{ fontSize: 40 }}>{emoji}</Text>
    </Animated.View>
  );
};

const FloatingEmojiBackground = () => {
  const items = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      emoji: FLOAT_BG_EMOJIS[Math.floor(Math.random() * FLOAT_BG_EMOJIS.length)],
      left: Math.random() * 100,
      duration: Math.random() * 12 + 8,
      delay: Math.random() * 8,
    })),
  ).current;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {items.map((item) => (
        <DriftEmoji key={item.id} emoji={item.emoji} leftPct={item.left} durationSec={item.duration} delaySec={item.delay} />
      ))}
    </View>
  );
};

const Dots = ({ total, current, onSelect }: { total: number; current: number; onSelect: (i: number) => void }) => (
  <View style={s.dotsRow}>
    {Array.from({ length: total }).map((_, i) => (
      <TouchableOpacity key={i} onPress={() => onSelect(i)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
        <View style={[s.dot, i === current && s.dotActive]} />
      </TouchableOpacity>
    ))}
  </View>
);

export function SquadCarouselScreen({ onCreateSquad, onBackFromStart }: Props) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>();

  const titleStyle = {
    fontFamily: BANGERS_FONT,
    fontSize: 36,
    lineHeight: 44,
    color: '#fff',
    textAlign: 'center' as const,
    letterSpacing: 1,
    paddingBottom: 4,
  };

  const goTo = useCallback((idx: number) => {
    const target = Math.max(0, Math.min(idx, CAROUSEL_COUNT - 1));
    setPage(target);
    scrollRef.current?.scrollTo({ x: target * W, animated: true });
  }, []);

  useEffect(() => {
    if (page >= CAROUSEL_COUNT - 1) return;
    autoTimer.current = setTimeout(() => goTo(page + 1), AUTO_ADVANCE_MS);
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
  }, [page, goTo]);

  const handleCreatePress = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    onCreateSquad();
  }, [onCreateSquad]);

  const handleBack = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (page > 0) goTo(page - 1);
    else onBackFromStart?.();
  }, [page, goTo, onBackFromStart]);

  const showBack = page > 0 || !!onBackFromStart;

  const onScroll = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    if (idx !== page) setPage(idx);
  }, [page]);

  const pageStyle = [s.page, { paddingBottom: 100 }];

  return (
    <LinearGradient colors={['#1a1a1a', '#0a0a0a', '#000000']} locations={[0, 0.45, 1]} style={s.container}>
      {showBack && (
        <SquadBackButton
          onPress={handleBack}
          style={[s.backBtn, { top: insets.top + 12 }]}
        />
      )}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {/* Screen 0 */}
        <View style={pageStyle}>
          <FloatEmoji emoji="🏆" size={72} />
          <Text style={titleStyle}>The first real{'\n'}pickleball squads.</Text>
          <Text style={s.body}>Build a crew of up to <Text style={s.bold}>8 players</Text>.{'\n'}Every game helps your squad rise.</Text>
        </View>

        {/* Screen 1 */}
        <View style={pageStyle}>
          <View style={s.animalRow}>
            {['🦁', '🐉', '🦅', '🐺'].map((e, i) => (
              <FloatEmoji key={e} emoji={e} size={48} delayMs={i * 200} style={{ marginBottom: 0 }} />
            ))}
          </View>
          <Text style={[titleStyle, { marginTop: 24 }]}>Choose your{'\n'}identity.</Text>
          <View style={s.list}>
            <Text style={s.body}>Name your squad.</Text>
            <Text style={s.body}>Pick your animal.</Text>
            <Text style={s.body}>Claim your district.</Text>
            <Text style={[s.body, { color: GOLD, fontWeight: '700', marginTop: 16 }]}>You can only belong to one squad.</Text>
          </View>
        </View>

        {/* Screen 2 */}
        <View style={pageStyle}>
          <FloatChest size={140} />
          <Text style={titleStyle}>Play together.{'\n'}Earn together.</Text>
          <View style={s.list}>
            <Text style={s.body}>When a squadmate plays,{'\n'}everyone earns rewards.</Text>
            <Text style={[s.body, s.bold]}>Open squad chests.</Text>
            <Text style={[s.body, s.bold]}>Collect XP.</Text>
          </View>
        </View>

        {/* Screen 3 — leaderboard */}
        <View style={pageStyle}>
          <View style={s.lbContainer}>
            {LB_DATA.map((row) => (
              <View key={row.rank} style={[s.lbRow, row.highlight ? s.lbRowTop : s.lbRowDim]}>
                <Text style={[s.lbRank, row.highlight ? { color: GOLD } : { color: '#555' }]}>{row.rank}</Text>
                <Text style={s.lbEmoji}>{row.emoji}</Text>
                <Text style={s.lbName}>{row.name}</Text>
                <Text style={s.lbXp}>{row.xp}</Text>
              </View>
            ))}
          </View>
          <Text style={[titleStyle, s.titleDistrict]}>Own your district.</Text>
          <View style={s.list}>
            <Text style={[s.body, s.bodyDmSans]}>Climb the leaderboard.</Text>
            <Text style={[s.body, s.bodyDmSans]}>Beat rival squads.</Text>
            <Text style={[s.body, s.bodyDmSans, s.bold]}>Become the team everyone recognizes.</Text>
          </View>
        </View>

        {/* Screen 4 — CTA */}
        <View style={pageStyle}>
          <FloatingEmojiBackground />
          <View style={s.ctaContent}>
            <Text style={titleStyle}>Founding Squads{'\n'}are opening now.</Text>
            <Text style={[s.body, s.bodyDmSans, { textAlign: 'center', marginBottom: 24 }]}>
              Create your squad and be among the first on SQUADD.
            </Text>
            <View style={s.perksCard}>
              <Text style={s.perksLabel}>Founding members receive:</Text>
              {PERKS.map((p) => (
                <View key={p} style={s.perkRow}>
                  <Text style={{ color: '#22c55e', fontSize: 16, marginRight: 10 }}>✓</Text>
                  <Text style={s.perkText}>{p}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={s.ctaButton}
              onPress={handleCreatePress}
              activeOpacity={0.85}
              delayPressIn={0}
            >
              <View style={s.ctaButtonWrap}>
                <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGradient}>
                  <Text style={s.ctaButtonText}>Create your squad</Text>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: insets.bottom + 90 + 16, alignSelf: 'center' }}>
        <Dots total={CAROUSEL_COUNT} current={page} onSelect={goTo} />
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { position: 'absolute', left: 16, zIndex: 10 },
  page: { width: W, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  titleDistrict: { fontSize: 34, lineHeight: 42, marginTop: 4 },
  body: { fontSize: 16, color: '#a1a1aa', textAlign: 'center', lineHeight: 26, marginTop: 8 },
  bodyDmSans: { fontFamily: DM_SANS },
  bold: { color: '#fff', fontWeight: '700', fontFamily: DM_SANS_BOLD },
  animalRow: { flexDirection: 'row', gap: 12 },
  list: { marginTop: 16, alignItems: 'center' },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { backgroundColor: '#fff', width: 24 },
  lbContainer: { width: '100%', maxWidth: 320, marginBottom: 40, gap: 6 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  lbRowTop: { backgroundColor: 'rgba(250,204,21,0.08)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)' },
  lbRowDim: { backgroundColor: 'rgba(255,255,255,0.03)' },
  lbRank: { width: 28, fontSize: 16, fontWeight: '900' },
  lbEmoji: { fontSize: 24, marginRight: 10 },
  lbName: { flex: 1, fontSize: 14, fontWeight: '800', color: '#fff', fontFamily: BANGERS_FONT },
  lbXp: { fontSize: 14, fontWeight: '700', color: GOLD },
  ctaContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, width: '100%' },
  perksCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, width: '100%', marginBottom: 16 },
  perksLabel: { fontSize: 12, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontFamily: DM_SANS },
  perkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  perkText: { fontSize: 15, color: '#fff', fontWeight: '600', fontFamily: DM_SANS },
  ctaButton: { width: '100%', marginTop: 16 },
  ctaButtonWrap: { borderRadius: 16, overflow: 'hidden', width: '100%' },
  ctaGradient: { paddingVertical: 16, alignItems: 'center', borderRadius: 16, borderBottomWidth: 3, borderBottomColor: '#365314' },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000',
    fontFamily: DM_SANS_BOLD,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
