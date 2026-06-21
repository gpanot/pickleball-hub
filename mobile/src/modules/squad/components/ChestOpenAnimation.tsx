import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image, Dimensions } from 'react-native';
import { ClubTokenIcon, BrandTokenIcon } from './TokenIcons';

/** Easing that decelerates like a slot machine reel — fast at start, slow at end. */
const SLOT_EASING = Easing.out(Easing.cubic);

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const GOLD = '#facc15';
const BLUE = '#60a5fa';
const PURPLE = '#a78bfa';
const CHEST_IMAGE = require('../../../../assets/images/pickleball_chest_clash_of_clan.png');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  clubTokensAwarded: number;
  brandTokensAwarded: number;
  xpAwarded?: number;
  squadName: string;
}

interface Particle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
}

const PARTICLE_COLORS = [LIME, GOLD, '#22c55e', '#facc15', BLUE, PURPLE, '#f472b6'];


export function ChestOpenAnimation({ clubTokensAwarded, brandTokensAwarded, xpAwarded, squadName }: Props) {
  const chestScale = useRef(new Animated.Value(0.5)).current;
  const chestRotate = useRef(new Animated.Value(-5)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(8)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const rewardsOpacity = useRef(new Animated.Value(0)).current;
  const rewardsTranslateY = useRef(new Animated.Value(8)).current;

  // Counter animated values — useNativeDriver: false so we can read as integers
  const clubCounter = useRef(new Animated.Value(0)).current;
  const brandCounter = useRef(new Animated.Value(0)).current;
  const xpCounter = useRef(new Animated.Value(0)).current;

  // Displayed integer state, driven by listener on each animated value
  const [clubDisplay, setClubDisplay] = useState(0);
  const [brandDisplay, setBrandDisplay] = useState(0);
  const [xpDisplay, setXpDisplay] = useState(0);

  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 32 }, (_, i) => ({
      id: i,
      x: new Animated.Value(SCREEN_WIDTH / 2),
      y: new Animated.Value(300),
      opacity: new Animated.Value(1),
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      size: 4 + Math.random() * 6,
    }))
  );

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(chestScale, { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }),
        Animated.timing(chestRotate, { toValue: 0, duration: 800, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 500, delay: 400, useNativeDriver: true }),
      Animated.timing(titleTranslateY, { toValue: 0, duration: 500, delay: 400, useNativeDriver: true }),
    ]).start();

    Animated.timing(subtitleOpacity, { toValue: 1, duration: 500, delay: 500, useNativeDriver: true }).start();

    Animated.parallel([
      Animated.timing(rewardsOpacity, { toValue: 1, duration: 500, delay: 700, useNativeDriver: true }),
      Animated.timing(rewardsTranslateY, { toValue: 0, duration: 500, delay: 700, useNativeDriver: true }),
    ]).start();

    // Casino counter: starts at delay 700ms (same as rewards fade-in), runs 3 seconds
    const COUNTER_DELAY = 700;
    const COUNTER_DURATION = 3000;

    Animated.timing(clubCounter, {
      toValue: clubTokensAwarded,
      duration: COUNTER_DURATION,
      delay: COUNTER_DELAY,
      easing: SLOT_EASING,
      useNativeDriver: false,
    }).start();

    Animated.timing(brandCounter, {
      toValue: brandTokensAwarded,
      duration: COUNTER_DURATION,
      delay: COUNTER_DELAY,
      easing: SLOT_EASING,
      useNativeDriver: false,
    }).start();

    Animated.timing(xpCounter, {
      toValue: xpAwarded ?? 0,
      duration: COUNTER_DURATION,
      delay: COUNTER_DELAY,
      easing: SLOT_EASING,
      useNativeDriver: false,
    }).start();

    const idClub = clubCounter.addListener(({ value }) => setClubDisplay(Math.round(value)));
    const idBrand = brandCounter.addListener(({ value }) => setBrandDisplay(Math.round(value)));
    const idXp = xpCounter.addListener(({ value }) => setXpDisplay(Math.round(value)));

    particles.forEach((p) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 80 + Math.random() * 120;
      const targetX = SCREEN_WIDTH / 2 + Math.cos(angle) * distance;
      const targetY = 300 - Math.sin(angle) * distance - Math.random() * 100;
      const delay = Math.random() * 300;

      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(p.x, { toValue: targetX, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(p.y, { toValue: targetY + 400, duration: 1500 + Math.random() * 1000, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(800),
            Animated.timing(p.opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]),
        ]),
      ]).start();
    });

    return () => {
      clubCounter.removeListener(idClub);
      brandCounter.removeListener(idBrand);
      xpCounter.removeListener(idXp);
    };
  }, []);

  return (
    <View style={s.container}>
      {particles.map((p) => (
        <Animated.View
          key={p.id}
          style={[
            s.particle,
            {
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: p.color,
              transform: [{ translateX: p.x }, { translateY: p.y }],
              opacity: p.opacity,
            },
          ]}
        />
      ))}

      <View style={s.content}>
        <Animated.View style={{
          transform: [
            { scale: chestScale },
            { rotate: chestRotate.interpolate({ inputRange: [-5, 0], outputRange: ['-5deg', '0deg'] }) },
          ],
        }}>
          <Image source={CHEST_IMAGE} style={s.chest} resizeMode="contain" />
        </Animated.View>

        <Animated.Text style={[s.title, { opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }]}>
          CHEST OPENED!
        </Animated.Text>

        <Animated.Text style={[s.subtitle, { opacity: subtitleOpacity }]}>
          {squadName} earned rewards together
        </Animated.Text>

        <Animated.View style={[s.rewards, { opacity: rewardsOpacity, transform: [{ translateY: rewardsTranslateY }] }]}>
          <View style={[s.rewardCard, { borderColor: 'rgba(96,165,250,0.3)' }]}>
            <View style={s.iconWrap}><ClubTokenIcon size={32} /></View>
            <Text style={[s.rewardValue, { color: BLUE }]}>+{clubDisplay}</Text>
            <Text style={s.rewardLabel}>CLUB TOKENS</Text>
          </View>
          <View style={[s.rewardCard, { borderColor: 'rgba(167,139,250,0.3)' }]}>
            <View style={s.iconWrap}><BrandTokenIcon size={32} /></View>
            <Text style={[s.rewardValue, { color: PURPLE }]}>+{brandDisplay}</Text>
            <Text style={s.rewardLabel}>BRAND TOKENS</Text>
          </View>
          {xpAwarded !== undefined && (
            <View style={[s.rewardCard, { borderColor: 'rgba(163,230,53,0.3)' }]}>
              <Text style={{ fontSize: 24, marginBottom: 6 }}>⚡</Text>
              <Text style={[s.rewardValue, { color: LIME }]}>+{xpDisplay}</Text>
              <Text style={s.rewardLabel}>SQUAD XP</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050a02' },
  particle: { position: 'absolute' },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  chest: { width: 160, height: 160, marginBottom: 16 },
  title: {
    fontFamily: BANGERS,
    fontSize: 36,
    color: LIME,
    textShadowColor: '#000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, color: '#a1a1aa', marginBottom: 28, textAlign: 'center' },
  rewards: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  rewardCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    minWidth: 100,
  },
  iconWrap: { marginBottom: 6 },
  rewardValue: { fontSize: 28, fontWeight: '900' },
  rewardLabel: {
    fontSize: 11,
    color: '#a1a1aa',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'center',
  },
});
