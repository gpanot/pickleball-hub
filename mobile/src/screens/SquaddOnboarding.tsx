/**
 * SquaddOnboarding — matches squadd_carousel_final.html
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  ActivityIndicator,
  StatusBar,
  Easing,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Asset } from 'expo-asset';
import { LinearGradient } from 'expo-linear-gradient';

const BANGERS_FONT = 'Bangers_400Regular';
const BANGERS_TTF = require('../../assets/fonts/Bangers_400Regular.ttf');
const CHEST_IMAGE = require('../../assets/images/pickleball_chest_clash_of_clan.png');
const SQUADD_WAITLIST_KEY = 'squadd_waitlist_registered';

type SquaddRegistration = {
  squadName: string;
  emoji: string;
  country: string;
  city: string;
  friendCount: number;
  registeredAt: string;
};

type SquadDraft = {
  squadName: string;
  emoji: string;
};

type CountryKey = 'Vietnam' | 'Philippines' | 'Malaysia';

const REGIONAL_DATA: Record<CountryKey, { flag: string; cities: string[] }> = {
  Vietnam: { flag: '🇻🇳', cities: ['Ho Chi Minh City', 'Hanoi Capital', 'Da Nang'] },
  Philippines: { flag: '🇵🇭', cities: ['Metro Manila', 'Cebu', 'Cavite'] },
  Malaysia: { flag: '🇲🇾', cities: ['Kuala Lumpur', 'Selangor', 'Penang'] },
};

const COUNTRY_KEYS = Object.keys(REGIONAL_DATA) as CountryKey[];

const { width: W, height: H } = Dimensions.get('window');
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

const GOLD = '#facc15';
const GOLD_DARK = '#ca8a04';
const GOLD_BORDER = '#854d0e';
const GRAY_400 = '#9ca3af';
const GREEN_400 = '#4ade80';
const GREEN_CHECK = '#22c55e';

const PERKS = ['Founder Badge', 'Early Access', 'First Squad Name Selection'];
const ANIMALS_ROW1 = ['🦁', '🐉', '🦅', '🐺', '🐯', '🦈', '🦄', '🦋', '🐻'];
const ANIMALS_ROW2 = ['🐱', '🦊', '🐰', '🦩', '🐼', '🐨', '🦢', '🌸', '💫', '🐝', '🦔', '🐙'];
const FLOAT_BG_EMOJIS = ['🦁', '🐉', '🦅', '🐺', '🏆', '🌸', '⚡', '🔥', '🦄', '🦋'];

const LB_DATA = [
  { rank: '01', emoji: '🐍', name: 'D1 VIPERS', xp: '12,450', highlight: false },
  { rank: '02', emoji: '🦁', name: 'D2 LIONS', xp: '10,200', highlight: true },
  { rank: '03', emoji: '🦅', name: 'SKY HAWKS', xp: '9,840', highlight: false },
];

// ─── Background gradient (radial-like) ───────────────────────────────────────
const BgGradient = ({ children }: { children: React.ReactNode }) => (
  <LinearGradient
    colors={['#1a1a1a', '#0a0a0a', '#000000']}
    locations={[0, 0.45, 1]}
    style={StyleSheet.absoluteFill}
  >
    {children}
  </LinearGradient>
);

// ─── Float animation (screens 1–3, 7 hero emoji) ─────────────────────────────
function useFloatAnim(delayMs = 0) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(y, {
          toValue: -15,
          duration: 1500,
          delay: delayMs,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
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
    <Animated.View
      style={{ marginBottom: 40, transform: [{ translateY }] }}
      collapsable={false}
      renderToHardwareTextureAndroid
    >
      <Image
        source={CHEST_IMAGE}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Pickleball squad chest"
      />
    </Animated.View>
  );
};

// ─── Drifting background emojis (screen 5) ───────────────────────────────────
const DriftEmoji = ({ emoji, leftPct, durationSec, delaySec }: { emoji: string; leftPct: number; durationSec: number; delaySec: number }) => {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationSec * 1000,
        delay: delaySec * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [progress, durationSec, delaySec]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [H + 50, -100],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        opacity: 0.15,
        transform: [{ translateY }],
      }}
    >
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
        <DriftEmoji
          key={item.id}
          emoji={item.emoji}
          leftPct={item.left}
          durationSec={item.duration}
          delaySec={item.delay}
        />
      ))}
    </View>
  );
};

// ─── Dots (white, tappable) ──────────────────────────────────────────────────
const Dots = ({ total, current, onSelect }: { total: number; current: number; onSelect: (i: number) => void }) => (
  <View style={styles.dotsRow}>
    {Array.from({ length: total }).map((_, i) => (
      <TouchableOpacity key={i} onPress={() => onSelect(i)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
        <View style={[styles.dot, i === current && styles.dotActive]} />
      </TouchableOpacity>
    ))}
  </View>
);

// ─── Clash button (gradient + 3D border) ─────────────────────────────────────
const ClashButton = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: object;
}) => {
  const pressed = useRef(new Animated.Value(0)).current;
  const translateY = pressed.interpolate({ inputRange: [0, 1], outputRange: [0, 2] });
  const inactive = disabled || loading;

  return (
    <Animated.View style={[style, { transform: [{ translateY }] }, inactive && styles.clashBtnDisabledWrap]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => !inactive && Animated.timing(pressed, { toValue: 1, duration: 100, useNativeDriver: true }).start()}
        onPressOut={() => Animated.timing(pressed, { toValue: 0, duration: 100, useNativeDriver: true }).start()}
        onPress={onPress}
        disabled={inactive}
      >
        <View style={styles.clashBtnWrap}>
          <LinearGradient colors={[GOLD, GOLD_DARK]} style={styles.clashBtn}>
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.clashBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                {label}
              </Text>
            )}
          </LinearGradient>
          <View style={styles.clashBtnBorder} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Screen 1 ────────────────────────────────────────────────────────────────
const Screen1 = () => (
  <View style={styles.screen}>
    <FloatEmoji emoji="🏆" size={72} />
    <Text style={styles.clashTitle}>The first real{'\n'}pickleball squads.</Text>
    <Text style={styles.bodyXl}>
      Build a crew of up to <Text style={styles.boldWhite}>8 players</Text>.{'\n'}
      Every game helps your squad rise.
    </Text>
  </View>
);

// ─── Screen 2 ────────────────────────────────────────────────────────────────
const Screen2 = () => (
  <View style={styles.screen}>
    <View style={styles.animalRow}>
      {['🦁', '🐉', '🦅', '🐺'].map((e, i) => (
        <FloatEmoji key={e} emoji={e} size={48} delayMs={i * 200} style={{ marginBottom: 0 }} />
      ))}
    </View>
    <Text style={[styles.clashTitle, { marginTop: 24 }]}>Choose your{'\n'}identity.</Text>
    <View style={styles.identityList}>
      <Text style={styles.bodyLg}>Name your squad.</Text>
      <Text style={styles.bodyLg}>Pick your animal.</Text>
      <Text style={styles.bodyLg}>Claim your district.</Text>
      <Text style={[styles.bodyLg, styles.yellowBold, { marginTop: 16 }]}>You can only belong to one squad.</Text>
    </View>
  </View>
);

// ─── Screen 3 ────────────────────────────────────────────────────────────────
const Screen3 = () => (
  <View style={styles.screen}>
    <FloatChest size={140} />
    <Text style={styles.clashTitle}>Play together.{'\n'}Earn together.</Text>
    <View style={styles.identityList}>
      <Text style={styles.bodyLg}>When a squadmate plays,{'\n'}everyone earns rewards.</Text>
      <Text style={[styles.bodyLg, styles.boldWhite]}>Open squad chests.</Text>
      <Text style={[styles.bodyLg, styles.boldWhite]}>Collect XP.</Text>
      <Text style={[styles.bodyLg, styles.greenBlack, { marginTop: 16 }]}>GROW STRONGER TOGETHER.</Text>
    </View>
  </View>
);

// ─── Screen 4 ────────────────────────────────────────────────────────────────
const Screen4 = () => (
  <View style={styles.screen}>
    <View style={styles.lbContainer}>
      {LB_DATA.map((row) => (
        <View
          key={row.rank}
          style={[
            styles.lbRow,
            !row.highlight && styles.lbRowDim,
            row.highlight && styles.lbRowTop,
          ]}
        >
          <Text style={[styles.lbRank, row.highlight ? styles.lbRankGold : styles.lbRankDim]}>{row.rank}</Text>
          <Text style={styles.lbEmoji}>{row.emoji}</Text>
          <Text style={styles.lbName}>{row.name}</Text>
          <Text style={styles.lbXp}>{row.xp}</Text>
        </View>
      ))}
    </View>
    <Text style={styles.clashTitle}>Own your district.</Text>
    <View style={styles.identityList}>
      <Text style={styles.bodyLg}>Climb the leaderboard.</Text>
      <Text style={styles.bodyLg}>Beat rival squads.</Text>
      <Text style={[styles.bodyLg, styles.boldWhite]}>Become the team everyone recognizes.</Text>
    </View>
  </View>
);

// ─── Screen 5 ────────────────────────────────────────────────────────────────
const Screen5 = ({ onReserve }: { onReserve: () => void }) => (
  <View style={styles.screen}>
    <FloatingEmojiBackground />
    <View style={styles.screen5Content}>
      <Text style={styles.clashTitle}>Founding Squads{'\n'}are opening soon.</Text>
      <Text style={[styles.bodyLg, { textAlign: 'center', marginBottom: 32 }]}>
        Reserve your spot and be among the first squads on Squadd.
      </Text>
      <View style={styles.perksCard}>
        <Text style={styles.perksLabel}>Founding members receive:</Text>
        {PERKS.map((p) => (
          <View key={p} style={styles.perkRow}>
            <Text style={styles.checkIcon}>✓</Text>
            <Text style={styles.perkText}>{p}</Text>
          </View>
        ))}
      </View>
      <ClashButton label="RESERVE MY SQUADD" onPress={onReserve} style={{ width: '100%', marginTop: 32 }} />
    </View>
  </View>
);

// ─── Two-row horizontal emoji picker ─────────────────────────────────────────
const EmojiPickerRows = ({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (e: string) => void;
}) => (
  <View style={styles.emojiPickerWrap}>
    {[ANIMALS_ROW1, ANIMALS_ROW2].map((row, rowIndex) => (
      <ScrollView
        key={rowIndex}
        horizontal
        style={styles.emojiPickerScroll}
        contentContainerStyle={styles.emojiPickerRow}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        bounces
      >
        {row.map((e) => (
          <TouchableOpacity
            key={e}
            style={[styles.emojiOpt, selected === e && styles.emojiOptSelected]}
            onPress={() => onSelect(e)}
          >
            <Text style={styles.emojiOptText}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    ))}
  </View>
);

// ─── Screen 6: Create squad ──────────────────────────────────────────────────
const Screen6 = ({
  onNext,
  onBack,
}: {
  onNext: (name: string, emoji: string) => void;
  onBack: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const [squadName, setSquadName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🦁');

  const handleNext = () => {
    if (!squadName.trim()) return;
    onNext(squadName.trim().toUpperCase(), selectedEmoji);
  };

  return (
    <View style={[styles.screen, styles.formScreenWrap, { paddingHorizontal: 0 }]}>
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={onBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Back to waitlist"
      >
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.formScreen, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <View style={styles.formInner}>
          <Text style={[styles.clashTitle, styles.titleForm]}>
            Create your squad
          </Text>

          <Text style={styles.fieldLabel}>Squad Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. D2 LIONS"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={squadName}
            onChangeText={(t) => setSquadName(t.toUpperCase())}
            autoCapitalize="characters"
            maxLength={24}
          />
        </View>

        <Text style={[styles.fieldLabel, styles.emojiFieldLabel]}>Pick your Animal</Text>
        <EmojiPickerRows selected={selectedEmoji} onSelect={setSelectedEmoji} />

        <View style={styles.formInner}>
          <ClashButton label="Next: Region" onPress={handleNext} style={{ width: '100%', marginTop: 16 }} />
        </View>
      </ScrollView>
    </View>
  );
};

// ─── Screen 7: Select Region ─────────────────────────────────────────────────
const Screen7Region = ({
  onConfirm,
  onBack,
}: {
  onConfirm: (country: string, city: string) => void;
  onBack: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const [selectedCountry, setSelectedCountry] = useState<CountryKey | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cityOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(cityOpacity, {
      toValue: selectedCountry ? 1 : 0,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [selectedCountry, cityOpacity]);

  const handleCountry = (country: CountryKey) => {
    setSelectedCountry(country);
    setSelectedCity(null);
  };

  const handleConfirm = async () => {
    if (!selectedCountry || !selectedCity) return;
    setLoading(true);
    await onConfirm(selectedCountry, selectedCity);
    setLoading(false);
  };

  const cities = selectedCountry ? REGIONAL_DATA[selectedCountry].cities : [];

  return (
    <View style={[styles.screen, styles.formScreenWrap, { paddingHorizontal: 0 }]}>
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={onBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Back to create squad"
      >
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={[styles.formScreen, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formInner}>
          <Text style={[styles.clashTitle, styles.titleForm]}>Select Region</Text>

          <Text style={[styles.fieldLabel, styles.regionLabel]}>Tap your Country</Text>
          <View style={styles.flagSelector}>
            {COUNTRY_KEYS.map((country) => (
              <TouchableOpacity
                key={country}
                style={[styles.flagOpt, selectedCountry === country && styles.flagOptSelected]}
                onPress={() => handleCountry(country)}
              >
                <Text style={styles.flagEmoji}>{REGIONAL_DATA[country].flag}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Animated.View
            style={[
              styles.cityPills,
              {
                opacity: cityOpacity,
                transform: [{
                  translateY: cityOpacity.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
                }],
              },
              !selectedCountry && styles.cityPillsHidden,
            ]}
            pointerEvents={selectedCountry ? 'auto' : 'none'}
          >
            <Text style={[styles.fieldLabel, styles.regionLabel]}>Choose your City</Text>
            {cities.map((city) => (
              <TouchableOpacity
                key={city}
                style={[styles.cityPill, selectedCity === city && styles.cityPillSelected]}
                onPress={() => setSelectedCity(city)}
              >
                <Text style={[styles.cityPillText, selectedCity === city && styles.cityPillTextSelected]}>
                  {city}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>

          <ClashButton
            label="Confirm Reservation"
            onPress={handleConfirm}
            loading={loading}
            disabled={!selectedCountry || !selectedCity}
            style={{ width: '100%', marginTop: 40 }}
          />
        </View>
      </ScrollView>
    </View>
  );
};

// ─── Screen 8: Confirmation ────────────────────────────────────────────────
const Screen8 = ({
  countryFlag,
  city,
}: {
  countryFlag?: string;
  city?: string;
}) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={styles.screen}>
      <FloatEmoji emoji={countryFlag ?? '🇻🇳'} size={80} />
      <Text style={styles.clashTitle}>You are in the game!</Text>
      <Text style={[styles.bodyXl, { marginBottom: 32 }]}>
        Representing <Text style={styles.boldWhite}>{city ?? 'Ho Chi Minh City'}</Text> Squads.
      </Text>
      <View style={styles.confirmCard}>
        <Text style={styles.confirmText}>We will let you know when the game starts.</Text>
      </View>
      <Animated.Text style={[styles.foundingBadge, { opacity: pulse }]}>Founding Member Status: ACTIVE</Animated.Text>
    </View>
  );
};

// ─── Main ────────────────────────────────────────────────────────────────────
export default function SquaddOnboarding() {
  const [fontsLoaded, fontError] = useFonts({ [BANGERS_FONT]: BANGERS_TTF });
  const [assetsReady, setAssetsReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [registered, setRegistered] = useState<SquaddRegistration | null>(null);
  const [draft, setDraft] = useState<SquadDraft | null>(null);
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const autoSlideRef = useRef(true);

  const TOTAL_INTRO = 5;

  useEffect(() => {
    Asset.fromModule(CHEST_IMAGE)
      .downloadAsync()
      .catch(() => undefined)
      .finally(() => setAssetsReady(true));
  }, []);

  useEffect(() => {
    if (fontError) {
      console.warn('[SquaddOnboarding] Bangers font failed to load:', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    AsyncStorage.getItem(SQUADD_WAITLIST_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const data = JSON.parse(raw) as SquaddRegistration;
          if (data.squadName && data.emoji && data.country && data.city) {
            setRegistered(data);
            setCurrent(7);
          }
        } catch {
          // ignore corrupt storage
        }
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && registered) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 7 * W, animated: false });
      });
    }
  }, [ready, registered]);

  const goTo = useCallback((index: number, manual = false) => {
    if (manual) autoSlideRef.current = false;
    setCurrent(index);
    scrollRef.current?.scrollTo({ x: index * W, animated: true });
  }, []);

  // Auto-advance screens 0–4 every 6s (stops after manual nav, like HTML)
  useEffect(() => {
    const id = setInterval(() => {
      if (!autoSlideRef.current) return;
      setCurrent((prev) => {
        if (prev >= TOTAL_INTRO) return prev;
        const next = prev < 4 ? prev + 1 : 0;
        scrollRef.current?.scrollTo({ x: next * W, animated: true });
        return next;
      });
    }, 6000);
    return () => clearInterval(id);
  }, []);

  const handleReserve = () => goTo(5, true);
  const handleBackToWaitlist = () => goTo(4, true);
  const handleBackToSquadForm = () => goTo(5, true);
  const handleNextRegion = (name: string, emoji: string) => {
    setDraft({ squadName: name, emoji });
    goTo(6, true);
  };
  const handleConfirm = async (country: string, city: string) => {
    if (!draft) return;
    const record: SquaddRegistration = {
      squadName: draft.squadName,
      emoji: draft.emoji,
      country,
      city,
      friendCount: 0,
      registeredAt: new Date().toISOString(),
    };
    try {
      await fetch(`${API_BASE}/api/squad-waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          squadName: draft.squadName,
          emoji: draft.emoji,
          country,
          city,
          friendCount: 0,
        }),
      });
    } catch {
      // confirmation still shown
    }
    await AsyncStorage.setItem(SQUADD_WAITLIST_KEY, JSON.stringify(record));
    setRegistered(record);
    goTo(7, true);
  };

  const showDots = !registered && current < TOTAL_INTRO;
  const uiReady = ready && fontsLoaded && assetsReady;

  if (!uiReady) {
    return <View style={styles.root} />;
  }

  if (registered) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />
        <BgGradient>
          <Screen8
            countryFlag={REGIONAL_DATA[registered.country as CountryKey]?.flag ?? '🇻🇳'}
            city={registered.city}
          />
        </BgGradient>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <BgGradient>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={current < TOTAL_INTRO}
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / W);
            if (idx < TOTAL_INTRO) {
              autoSlideRef.current = false;
              setCurrent(idx);
            }
          }}
        >
          <Screen1 />
          <Screen2 />
          <Screen3 />
          <Screen4 />
          <Screen5 onReserve={handleReserve} />
          <Screen6 onNext={handleNextRegion} onBack={handleBackToWaitlist} />
          <Screen7Region onConfirm={handleConfirm} onBack={handleBackToSquadForm} />
          <Screen8 />
        </ScrollView>

        {showDots && (
          <Dots total={TOTAL_INTRO} current={current} onSelect={(i) => goTo(i, true)} />
        )}
      </BgGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  screen: {
    width: W,
    minHeight: H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 100,
    overflow: 'hidden',
  },
  screen5Content: {
    zIndex: 10,
    width: '100%',
    maxWidth: 384,
    alignItems: 'center',
  },
  formScreenWrap: { justifyContent: 'flex-start', alignItems: 'stretch' },
  formScreen: { flexGrow: 1, paddingBottom: 100 },
  formInner: { width: '100%', paddingHorizontal: 32, maxWidth: W, alignSelf: 'center' },
  emojiFieldLabel: { paddingHorizontal: 32, alignSelf: 'flex-start' },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32, marginTop: -2 },

  clashTitle: {
    fontFamily: BANGERS_FONT,
    fontSize: 48,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 52,
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    textShadowColor: '#000',
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
    includeFontPadding: false,
  },
  titleForm: { fontSize: 36, lineHeight: 40, marginBottom: 32 },

  bodyXl: {
    fontSize: 20,
    color: GRAY_400,
    textAlign: 'center',
    lineHeight: 30,
    maxWidth: 320,
  },
  bodyLg: {
    fontSize: 18,
    color: GRAY_400,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 8,
  },
  boldWhite: { color: '#fff', fontWeight: '700' },
  yellowBold: { color: GOLD, fontWeight: '700' },
  greenBlack: { color: GREEN_400, fontWeight: '900' },
  identityList: { alignItems: 'center' },

  animalRow: { flexDirection: 'row', gap: 24, marginBottom: 8, alignItems: 'flex-end' },

  lbContainer: { width: '100%', maxWidth: 320, marginBottom: 40 },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 16,
  },
  lbRowDim: { opacity: 0.6 },
  lbRowTop: {
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'rgba(250,204,21,0.1)',
    transform: [{ scale: 1.05 }],
  },
  lbRank: { fontSize: 14, fontWeight: '900', fontStyle: 'italic', width: 28 },
  lbRankDim: { color: GRAY_400 },
  lbRankGold: { color: GOLD },
  lbEmoji: { fontSize: 24 },
  lbName: { flex: 1, fontSize: 16, color: '#fff', fontWeight: '700' },
  lbXp: { fontSize: 16, color: GOLD, fontWeight: '900' },

  perksCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 24,
  },
  perksLabel: {
    fontSize: 12,
    color: GOLD,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  perkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  checkIcon: { color: GREEN_CHECK, fontSize: 16, fontWeight: '900' },
  perkText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  clashBtnWrap: { borderRadius: 16, overflow: 'hidden' },
  clashBtn: {
    paddingVertical: 19,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderRadius: 16,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  clashBtnBorder: {
    height: 4,
    backgroundColor: GOLD_BORDER,
    marginTop: -2,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  clashBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: '100%',
    textAlign: 'center',
  },

  fieldLabel: {
    fontSize: 12,
    color: GRAY_400,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    width: '100%',
    marginBottom: 24,
  },
  emojiPickerWrap: { width: W, marginBottom: 24, gap: 8 },
  emojiPickerScroll: { width: W },
  emojiPickerRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emojiOpt: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 52,
    alignItems: 'center',
  },
  emojiOptSelected: {
    backgroundColor: 'rgba(250,204,21,0.2)',
    borderColor: GOLD,
    transform: [{ scale: 1.1 }],
  },
  emojiOptText: { fontSize: 32 },

  regionLabel: { textAlign: 'center', alignSelf: 'center', marginBottom: 16 },
  flagSelector: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 32 },
  flagOpt: {
    padding: 8,
    borderRadius: 20,
    opacity: 0.6,
  },
  flagOptSelected: {
    opacity: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    transform: [{ scale: 1.3 }],
  },
  flagEmoji: { fontSize: 56 },
  cityPills: { width: '100%', gap: 12, marginBottom: 8 },
  cityPillsHidden: { height: 0, overflow: 'hidden', marginBottom: 0 },
  cityPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 100,
    alignItems: 'center',
  },
  cityPillSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD_DARK,
    transform: [{ scale: 1.05 }],
  },
  cityPillText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cityPillTextSelected: { color: '#000' },
  clashBtnDisabledWrap: { opacity: 0.5 },

  confirmCard: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  confirmText: { color: GREEN_400, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  foundingBadge: {
    marginTop: 48,
    fontSize: 14,
    color: GRAY_400,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },

  dotsRow: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    zIndex: 50,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: '#fff',
    transform: [{ scale: 1.3 }],
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
});
