import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Keyboard,
  Animated, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import type { CreateSquadPayload } from '../types';
import { SquadScreenHeader } from '../components/SquadScreenHeader';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const GOLD = '#f59e0b';
const MUTED2 = '#71717a';
const MUTED3 = '#a1a1aa';
const BG2 = '#18181b';
const BORDER = '#27272a';
const DEFAULT_SQUAD_COLOR = GOLD;
const DEFAULT_SQUAD_EMOJI = '🦁';

const SUGGESTIONS = ['D2 Lions', 'District Wolves', 'The Smashers', 'Court Kings', 'Net Crushers', 'The Regulars', 'Drop Shot FC'];

// 2 rows × 4 cols = 8 tiles; first 1 is "active" (gold), rest are open (dashed)
const TOTAL_TILES = 8;
const ACTIVE_TILES = 1;

interface Props {
  onCreated: (payload: CreateSquadPayload) => Promise<any>;
  onBack: () => void;
  loading: boolean;
}

export function SquadCreateScreen({ onCreated, onBack, loading }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(SUGGESTIONS[0]);
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // ── Animations ──────────────────────────────────────────────────────────────
  const cardTranslateY = useRef(new Animated.Value(40)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  // Stagger the active tiles popping in
  const tileScales = useRef(Array.from({ length: ACTIVE_TILES }, () => new Animated.Value(0))).current;
  const nameOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(cardTranslateY, { toValue: 0, tension: 60, friction: 9, useNativeDriver: true }),
      ...tileScales.map((anim, i) =>
        Animated.spring(anim, { toValue: 1, tension: 55, friction: 6, delay: 180 + i * 80, useNativeDriver: true })
      ),
    ]).start();
  }, []);

  function flashName() {
    Animated.sequence([
      Animated.timing(nameOpacity, { toValue: 0.2, duration: 70, useNativeDriver: true }),
      Animated.timing(nameOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    })();
  }, []);

  const handleCreate = async () => {
    Keyboard.dismiss();
    const trimmed = name.trim();
    if (trimmed.length < 2) { setNameError('Name must be at least 2 characters'); return; }
    if (trimmed.length > 24) { setNameError('Name must be 24 characters or less'); return; }
    setNameError('');
    setSubmitting(true);
    try {
      await onCreated({
        name: trimmed,
        emoji: DEFAULT_SQUAD_EMOJI,
        color: DEFAULT_SQUAD_COLOR,
        isPublic: true,
        showDupr: true,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      });
    } catch (e: any) {
      setNameError(e.message || 'Failed to create squad');
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = name.trim() || '…';

  return (
    <View style={s.container}>
      <SquadScreenHeader title="CREATE SQUAD" insetTop={insets.top} onBack={onBack} />

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Preview card ── */}
        <Animated.View style={[s.previewCard, { opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }]}>
          <Text style={s.previewLabel}>YOUR SQUAD</Text>

          {/* Tile grid */}
          <View style={s.tileGrid}>
            {Array.from({ length: TOTAL_TILES }).map((_, i) => {
              const isActive = i < ACTIVE_TILES;
              if (isActive) {
                return (
                  <Animated.View
                    key={i}
                    style={[s.tile, s.tileActive, { transform: [{ scale: tileScales[i] }] }]}
                  />
                );
              }
              return <View key={i} style={s.tile} />;
            })}
          </View>

          <Animated.Text style={[s.previewName, { opacity: nameOpacity }]}>{displayName}</Animated.Text>
          <Text style={s.previewHint}>
            Squads hold territory. Win courts to claim tiles,{'\n'}every Pod you invite expands the grid.
          </Text>
        </Animated.View>

        {/* ── Squad name ── */}
        <View style={s.section}>
          <Text style={s.label}>SQUAD NAME</Text>
          <TextInput
            style={[s.input, nameError ? s.inputError : null]}
            placeholder="Type to see it appear above"
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={name}
            onChangeText={(t) => { setName(t); setNameError(''); flashName(); }}
            autoCapitalize="words"
            maxLength={24}
            returnKeyType="done"
          />
          {nameError ? <Text style={s.errorText}>{nameError}</Text> : null}
        </View>

        {/* ── Suggestion chips ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((sug) => (
            <TouchableOpacity
              key={sug}
              style={[s.chip, name === sug && s.chipActive]}
              onPress={() => { setName(sug); setNameError(''); flashName(); }}
              activeOpacity={0.75}
            >
              <Text style={[s.chipText, name === sug && s.chipTextActive]}>{sug}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── CTA ── */}
        <TouchableOpacity
          style={s.ctaWrap}
          onPress={handleCreate}
          disabled={submitting || loading}
          activeOpacity={0.8}
        >
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGrad}>
            {submitting || loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.ctaText}>CREATE SQUAD + INVITE →</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, gap: 20 },

  // Preview card
  previewCard: {
    backgroundColor: '#111a11',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
  },
  previewLabel: {
    fontFamily: BANGERS,
    fontSize: 13,
    letterSpacing: 3,
    color: MUTED2,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: 220,
    justifyContent: 'center',
  },
  tile: {
    width: 46,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: MUTED2,
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tileActive: {
    borderColor: GOLD,
    borderStyle: 'solid',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  previewName: {
    fontFamily: BANGERS,
    fontSize: 22,
    color: GOLD,
    letterSpacing: 1,
    textAlign: 'center',
  },
  previewHint: {
    fontSize: 13,
    color: MUTED2,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Name input
  section: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: MUTED2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: BG2,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 2 },

  // Chips
  chipsRow: { flexDirection: 'row', gap: 10, paddingRight: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG2,
  },
  chipActive: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.5)',
  },
  chipText: { fontSize: 14, fontWeight: '500', color: MUTED3 },
  chipTextActive: { color: GOLD, fontWeight: '600' },

  // CTA
  ctaWrap: { marginTop: 4 },
  ctaGrad: {
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#365314',
  },
  ctaText: { fontSize: 16, fontWeight: '900', color: '#000', letterSpacing: 0.5 },
});
