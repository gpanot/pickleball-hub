import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Squad } from '../types';
import { SquadBackButton } from '../components/SquadBackButton';
import * as api from '../api';

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';

const ANIMAL_EMOJIS = ['🦁', '🐉', '🦅', '🐺', '🐯', '🦊', '🦈', '🐻', '⚡', '🔥', '🎁', '💫'];

interface Props {
  squad: Squad;
  onBack: () => void;
  onSaved: () => void;
}

export function SquadEditScreen({ squad, onBack, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(squad.name);
  const [emoji, setEmoji] = useState(squad.emoji);
  const [isPublic, setIsPublic] = useState(squad.isPublic);
  const [showDupr, setShowDupr] = useState(squad.showDupr);
  const [saving, setSaving] = useState(false);
  const isDirtyRef = useRef(false);

  const markDirty = () => { isDirtyRef.current = true; };

  const handleNameChange = useCallback((text: string) => {
    if (text.length <= 24) {
      setName(text);
      markDirty();
    }
  }, []);

  const handleEmojiSelect = useCallback((e: string) => {
    setEmoji(e);
    markDirty();
  }, []);

  const handleBack = useCallback(() => {
    if (isDirtyRef.current) {
      Alert.alert('Discard changes?', undefined, [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onBack },
      ]);
    } else {
      onBack();
    }
  }, [onBack]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (name.length < 2) {
      Alert.alert('Error', 'Squad name must be at least 2 characters');
      return;
    }
    setSaving(true);
    try {
      await api.updateSquad(squad.id, { name, emoji, isPublic, showDupr });
      isDirtyRef.current = false;
      onSaved();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [saving, name, emoji, isPublic, showDupr, squad.id, onSaved]);

  return (
    <View style={s.container}>
      {/* Topbar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={handleBack} />
        <Text style={s.topTitle}>Edit squad</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[s.saveBtn, saving && { opacity: 0.5 }]}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Squad name */}
        <Text style={s.fieldLabel}>SQUAD NAME</Text>
        <View style={s.nameInputWrap}>
          <TextInput
            style={s.nameInput}
            value={name}
            onChangeText={handleNameChange}
            maxLength={24}
            autoCapitalize="characters"
            placeholderTextColor="#52525b"
          />
        </View>
        <Text style={s.charCount}>{name.length} / 24</Text>

        {/* Animal grid */}
        <Text style={s.fieldLabel}>ANIMAL</Text>
        <View style={s.emojiGrid}>
          {ANIMAL_EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              style={[s.emojiCell, emoji === e && s.emojiSelected]}
              onPress={() => handleEmojiSelect(e)}
              activeOpacity={0.7}
            >
              <Text style={[s.emojiText, emoji === e && { transform: [{ scale: 1.08 }] }]}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Toggles */}
        <View style={s.toggleRow}>
          <View style={s.toggleInfo}>
            <Text style={s.toggleLabel}>Public squad</Text>
            <Text style={s.toggleSub}>Anyone can send a join request</Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={(v) => { setIsPublic(v); markDirty(); }}
            trackColor={{ false: '#333', true: LIME }}
            thumbColor="#fff"
          />
        </View>

        <View style={s.toggleRow}>
          <View style={s.toggleInfo}>
            <Text style={s.toggleLabel}>Show DUPR range</Text>
            <Text style={s.toggleSub}>Display avg DUPR on public profile</Text>
          </View>
          <Switch
            value={showDupr}
            onValueChange={(v) => { setShowDupr(v); markDirty(); }}
            trackColor={{ false: '#333', true: LIME }}
            thumbColor="#fff"
          />
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[s.saveMainBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator color="#000" /> : (
            <Text style={s.saveMainBtnText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row', alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  saveBtn: { fontSize: 13, fontWeight: '700', color: GOLD, borderWidth: 1, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  fieldLabel: {
    fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2,
    color: '#52525b', marginTop: 24, marginBottom: 10, marginHorizontal: 20,
  },
  nameInputWrap: {
    marginHorizontal: 16, backgroundColor: '#1a1a1a',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14,
    paddingHorizontal: 16,
  },
  nameInput: {
    fontFamily: BANGERS, fontSize: 28, color: GOLD,
    paddingVertical: 16, textTransform: 'uppercase',
  },
  charCount: { fontSize: 11, color: '#52525b', textAlign: 'right', marginRight: 20, marginTop: 4 },

  emojiGrid: {
    flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, gap: 8,
  },
  emojiCell: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
  },
  emojiSelected: {
    borderWidth: 2, borderColor: LIME,
    backgroundColor: 'rgba(163,230,53,0.13)',
  },
  emojiText: { fontSize: 28 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, marginTop: 24,
  },
  toggleInfo: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  toggleSub: { fontSize: 12, color: '#71717a', marginTop: 2 },

  saveMainBtn: {
    marginHorizontal: 16, marginTop: 36,
    backgroundColor: LIME, borderRadius: 16, paddingVertical: 16,
    alignItems: 'center',
  },
  saveMainBtnText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
