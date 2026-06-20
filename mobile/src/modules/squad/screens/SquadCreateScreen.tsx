import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Switch, ActivityIndicator, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import type { CreateSquadPayload } from '../types';
import { SquadScreenHeader } from '../components/SquadScreenHeader';

const BANGERS = 'Bangers_400Regular';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';
const DEFAULT_SQUAD_COLOR = '#f59e0b';

const EMOJIS = ['🦁', '🐉', '🦅', '🐺', '🐯', '🦈', '🦊', '🐻', '⚡', '🔥', '🎁', '💫'];

interface Props {
  onCreated: (payload: CreateSquadPayload) => Promise<any>;
  onBack: () => void;
  loading: boolean;
}

export function SquadCreateScreen({ onCreated, onBack, loading }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🦁');
  const [isPublic, setIsPublic] = useState(true);
  const [showDupr, setShowDupr] = useState(true);
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const req = await Location.requestForegroundPermissionsAsync();
          if (req.status !== 'granted') return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setCoords({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      } catch {}
    })();
  }, []);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }
    if (trimmed.length > 24) {
      setNameError('Name must be 24 characters or less');
      return;
    }
    setNameError('');
    setSubmitting(true);
    try {
      await onCreated({
        name: trimmed,
        emoji,
        color: DEFAULT_SQUAD_COLOR,
        isPublic,
        showDupr,
        ...(coords ? { latitude: coords.latitude, longitude: coords.longitude } : {}),
      });
    } catch (e: any) {
      setNameError(e.message || 'Failed to create squad');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      <SquadScreenHeader title="CREATE SQUAD" insetTop={insets.top} onBack={onBack} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Squad name */}
        <Text style={s.label}>Squad name</Text>
        <TextInput
          style={[s.input, nameError ? s.inputError : null]}
          placeholder="D2 LIONS"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={name}
          onChangeText={(t) => { setName(t); setNameError(''); }}
          autoCapitalize="characters"
          maxLength={24}
        />
        {nameError ? <Text style={s.errorText}>{nameError}</Text> : null}

        {/* Animal */}
        <Text style={[s.label, { marginTop: 16 }]}>Animal</Text>
        <View style={s.emojiGrid}>
          {EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              style={[s.emojiOpt, emoji === e && s.emojiSelected]}
              onPress={() => { setEmoji(e); Keyboard.dismiss(); }}
            >
              <Text style={{ fontSize: 24 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Toggles */}
        <View style={[s.toggleRow, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleTitle}>Open squad</Text>
            <Text style={s.toggleSub}>Anyone can request to join</Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: '#2a2a2a', true: LIME }}
            thumbColor="#fff"
          />
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={s.ctaWrap}
          onPress={handleCreate}
          disabled={submitting || loading}
          activeOpacity={0.8}
        >
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGrad}>
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.ctaText}>Create squad + invite crew →</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 100 },
  label: { fontSize: 11, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: BANGERS,
    letterSpacing: 1,
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOpt: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: '#1e1e1e',
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiSelected: { backgroundColor: 'rgba(163,230,53,0.13)', borderColor: LIME },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  toggleTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  toggleSub: { fontSize: 12, color: '#52525b', marginTop: 2 },
  ctaWrap: { marginTop: 20 },
  ctaGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#365314' },
  ctaText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
