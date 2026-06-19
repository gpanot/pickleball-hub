import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../stores/authStore';
import { SquadScreenHeader } from '../components/SquadScreenHeader';
import type { PlayStyle } from '../podConstants';
import { POD_SUGGESTED_NAMES, MIN_POD_NAME_LENGTH, MAX_POD_NAME_LENGTH } from '../podConstants';

const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

const POD_EMOJIS = ['🎯', '🔥', '⚡', '🌊', '💪', '🦅', '🐯', '🏹', '💥', '🌟', '🎮', '🚀'];

export interface PodSavedData {
  id: string;
  name: string;
  emoji: string;
  members: Array<{ profileId: string; displayName: string }>;
}

interface Props {
  squadId: string;
  playStyle: PlayStyle | null;
  onCreated: (podId: string) => void;
  onSkip: () => void;
  onBack: () => void;
  // Edit mode — when provided, the screen edits an existing Pod instead of creating one
  editPodId?: string;
  initialName?: string;
  initialEmoji?: string;
  // Called after a successful PATCH with the full updated pod data (edit mode only)
  onSaved?: (pod: PodSavedData) => void;
}

export function PodCreateScreen({ squadId, playStyle, onCreated, onSkip, onBack, editPodId, initialName, initialEmoji, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const isEditMode = !!editPodId;
  const suggestions = !isEditMode && playStyle ? (POD_SUGGESTED_NAMES[playStyle] ?? []) : [];
  const [name, setName] = useState(initialName ?? suggestions[0] ?? '');
  const [emoji, setEmoji] = useState(initialEmoji ?? '🎯');
  const [nameError, setNameError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < MIN_POD_NAME_LENGTH) {
      setNameError(`Name must be at least ${MIN_POD_NAME_LENGTH} characters`);
      return;
    }
    if (trimmed.length > MAX_POD_NAME_LENGTH) {
      setNameError(`Name must be ${MAX_POD_NAME_LENGTH} characters or less`);
      return;
    }
    setNameError('');
    setSubmitting(true);
    try {
      if (isEditMode) {
        const res = await useAuthStore.getState().authedFetch(`/api/pods/${editPodId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, emoji }),
        });
        if (!res.ok) {
          const data = await res.json();
          setNameError(data.error ?? 'Failed to update Pod');
          return;
        }
        const pod = await res.json();
        if (onSaved) {
          onSaved({ id: pod.id, name: pod.name, emoji: pod.emoji, members: pod.members ?? [] });
        } else {
          onCreated(pod.id);
        }
      } else {
        const res = await useAuthStore.getState().authedFetch('/api/pods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ squadId, name: trimmed, emoji }),
        });
        if (!res.ok) {
          const data = await res.json();
          setNameError(data.error ?? 'Failed to create Pod');
          return;
        }
        const pod = await res.json();
        onCreated(pod.id);
      }
    } catch {
      setNameError(isEditMode ? 'Failed to update Pod. Please try again.' : 'Failed to create Pod. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      <SquadScreenHeader title={isEditMode ? 'EDIT POD' : 'CREATE POD'} insetTop={insets.top} onBack={onBack} />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>{isEditMode ? 'Edit your Pod' : 'Name your Pod'}</Text>
        <Text style={s.sub}>A small crew inside your Squad — 2 to 4 players.</Text>

        {suggestions.length > 0 && (
          <View style={s.suggestions}>
            <Text style={s.suggLabel}>SUGGESTIONS</Text>
            <View style={s.suggRow}>
              {suggestions.map((sug) => (
                <TouchableOpacity
                  key={sug}
                  style={[s.suggPill, name === sug && s.suggPillActive]}
                  onPress={() => { setName(sug); setNameError(''); Keyboard.dismiss(); }}
                >
                  <Text style={[s.suggText, name === sug && s.suggTextActive]}>{sug}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Text style={s.label}>Pod name</Text>
        <TextInput
          style={[s.input, nameError ? s.inputError : null]}
          placeholder="Court Crew"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={name}
          onChangeText={(t) => { setName(t); setNameError(''); }}
          maxLength={MAX_POD_NAME_LENGTH}
        />
        {nameError ? <Text style={s.errorText}>{nameError}</Text> : null}

        <Text style={[s.label, { marginTop: 20 }]}>Icon</Text>
        <View style={s.emojiGrid}>
          {POD_EMOJIS.map((e) => (
            <TouchableOpacity
              key={e}
              style={[s.emojiOpt, emoji === e && s.emojiSelected]}
              onPress={() => { setEmoji(e); Keyboard.dismiss(); }}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.ctaWrap} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
          <LinearGradient colors={[LIME, LIME_DARK]} style={s.ctaGrad}>
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.ctaText}>{isEditMode ? 'Save changes →' : 'Create Pod →'}</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {!isEditMode && (
          <TouchableOpacity style={s.skipBtn} onPress={onSkip} activeOpacity={0.7}>
            <Text style={s.skipText}>Skip — I'll do this later</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingBottom: 80 },
  heading: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 6 },
  sub: { fontSize: 14, color: '#71717a', lineHeight: 20, marginBottom: 24 },
  suggestions: { marginBottom: 20 },
  suggLabel: { fontSize: 10, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  suggRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 100, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#141414',
  },
  suggPillActive: { borderColor: LIME, backgroundColor: 'rgba(163,230,53,0.1)' },
  suggText: { fontSize: 13, fontWeight: '700', color: '#a1a1aa' },
  suggTextActive: { color: LIME },
  label: { fontSize: 11, fontWeight: '800', color: '#52525b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 18, fontWeight: '700',
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOpt: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#1e1e1e',
    borderWidth: 2, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiSelected: { backgroundColor: 'rgba(163,230,53,0.13)', borderColor: LIME },
  ctaWrap: { marginTop: 28 },
  ctaGrad: { paddingVertical: 15, borderRadius: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: '#365314' },
  ctaText: { fontSize: 16, fontWeight: '900', color: '#000' },
  skipBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: '#52525b', fontWeight: '600' },
});
