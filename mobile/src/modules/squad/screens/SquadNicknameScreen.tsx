import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../../stores/authStore';
import { SquadNicknameShieldIcon } from '../components/SquadNicknameShieldIcon';
import { SquadBackButton } from '../components/SquadBackButton';

// Use getState() so we never capture a stale/new-reference authedFetch from a re-render
function api(path: string, init?: RequestInit) {
  return useAuthStore.getState().authedFetch(path, init);
}

const BANGERS = 'Bangers_400Regular';
const GOLD = '#facc15';
const LIME = '#a3e635';
const LIME_DARK = '#65a30d';

interface ProfileInfo {
  displayName: string | null;
  dupr: number | null;
  imageUrl: string | null;
  current: string | null;
}

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

interface Props {
  onConfirmed: (nickname: string) => void;
  onBack: () => void;
}

export function SquadNicknameScreen({ onConfirmed, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const authDisplayName = useAuthStore((s) => s.displayName);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo>({
    displayName: authDisplayName,
    dupr: null,
    imageUrl: null,
    current: null,
  });
  const [input, setInput] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // On mount: ensure API base is resolved (handles dev builds pointing at prod Railway),
  // load profile info, and pre-fill with current nickname or auto-generated suggestion.
  useEffect(() => {
    (async () => {
      if (__DEV__) await useAuthStore.getState().ensureDevApiBase();
      try {
        const r = await api('/api/squads/nickname');
        const data = await r.json();
        setProfileInfo({
          displayName: data.displayName ?? authDisplayName,
          dupr: data.dupr,
          imageUrl: data.imageUrl,
          current: data.current,
        });
        const prefill = data.current ?? data.suggestion;
        if (prefill) {
          setInput(prefill);
          // Suggestion is already available (server checked), current is always ok
          setCheckState('available');
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNickname = useCallback((value: string) => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) { setCheckState('idle'); setReason(''); return; }

    setCheckState('checking');
    api(`/api/squads/nickname?q=${encodeURIComponent(trimmed)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.reason) {
          setCheckState('invalid');
          setReason(data.reason);
        } else if (data.available) {
          setCheckState('available');
          setReason('');
        } else {
          setCheckState('taken');
          setReason('Already taken');
        }
      })
      .catch(() => { setCheckState('idle'); });
  }, []);

  const handleChange = (text: string) => {
    const cleaned = text.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase().slice(0, 20);
    setInput(cleaned);
    setSaveError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!cleaned) { setCheckState('idle'); return; }
    setCheckState('checking');
    debounceRef.current = setTimeout(() => checkNickname(cleaned), 450);
  };

  const handleConfirm = async () => {
    if (checkState !== 'available' || saving) return;
    // Cancel any pending debounced availability check
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setSaving(true);
    setSaveError('');
    const nickname = input.trim().toLowerCase();
    let success = false;
    try {
      const res = await api('/api/squads/nickname', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        if (mountedRef.current) setSaveError(err.error ?? 'Failed to save');
        return;
      }
      success = true;
    } catch {
      if (mountedRef.current) setSaveError('Network error — please try again');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
    // Navigate only after all state updates are done (avoids unmount-during-fetch errors)
    if (success) onConfirmed(nickname);
  };

  const displayName = profileInfo.displayName ?? 'You';
  const handle = input ? `@${input}` : '@—';
  const city = 'Ho Chi Minh City';

  const handleBorderColor =
    checkState === 'available'
      ? '#22c55e'
      : checkState === 'taken' || checkState === 'invalid'
        ? '#ef4444'
        : 'rgba(255,255,255,0.1)';

  const availability =
    checkState === 'checking' ? null :
    checkState === 'available' ? { label: 'Available ✓', color: '#22c55e' } :
    checkState === 'taken' ? { label: 'Already taken', color: '#ef4444' } :
    checkState === 'invalid' ? { label: reason, color: '#ef4444' } :
    null;

  return (
    <View style={s.container}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <SquadBackButton onPress={onBack} />
        <Text style={s.topTitle}>Your Squadd identity</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <SquadNicknameShieldIcon size={80} />
          <Text style={s.heroTitle}>WHAT'S YOUR{'\n'}SQUADD NICKNAME?</Text>
          <Text style={s.heroSub}>
            {'This is how your crew will find you.\nPick something your court friends recognize.'}
          </Text>
        </View>

        {/* Input */}
        <Text style={s.fieldLabel}>NICKNAME</Text>
        <View style={[s.inputWrap, { borderColor: handleBorderColor }]}>
          <Text style={s.atSign}>@ </Text>
          <TextInput
            style={s.textInput}
            value={input}
            onChangeText={handleChange}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="yourhandle"
            placeholderTextColor="rgba(255,255,255,0.2)"
            maxLength={20}
          />
          {checkState === 'checking' && (
            <ActivityIndicator color={GOLD} size="small" style={{ marginRight: 12 }} />
          )}
        </View>

        {/* Preview card */}
        {input.length > 0 && (
          <View style={s.previewCard}>
            {profileInfo.imageUrl ? (
              <Image
                source={{ uri: profileInfo.imageUrl }}
                style={[s.previewAvatar, { borderColor: checkState === 'available' ? LIME : 'rgba(255,255,255,0.15)' }]}
              />
            ) : (
              <View style={[s.previewAvatarFallback, { borderColor: checkState === 'available' ? LIME : 'rgba(255,255,255,0.15)' }]}>
                <Text style={s.previewInitial}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.previewHandle}>{handle}</Text>
              <Text style={s.previewMeta}>
                {profileInfo.dupr ? `DUPR ${profileInfo.dupr}` : 'DUPR —'}
                {' · '}{city}
              </Text>
            </View>
            {availability && (
              <View style={[s.badge, { borderColor: `${availability.color}50`, backgroundColor: `${availability.color}15` }]}>
                <Text style={[s.badgeText, { color: availability.color }]}>{availability.label}</Text>
              </View>
            )}
          </View>
        )}

        {/* Rules */}
        <View style={s.rulesCard}>
          <Text style={s.rulesTitle}>RULES</Text>
          <Text style={s.rulesText}>3–20 characters · letters, numbers, underscores only</Text>
          <Text style={s.rulesText}>No spaces · can be changed at any time</Text>
        </View>

        {saveError ? <Text style={s.saveError}>{saveError}</Text> : null}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[s.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={handleConfirm}
          disabled={checkState !== 'available' || saving}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={[LIME, LIME_DARK]}
            style={[s.ctaGrad, checkState !== 'available' && { opacity: 0.4 }]}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.ctaText}>Confirm nickname →</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: {
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#fff', textAlign: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 28 },
  hero: { alignItems: 'center', marginBottom: 28 },
  heroTitle: {
    fontFamily: BANGERS,
    fontSize: 30,
    color: GOLD,
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
    lineHeight: 34,
  },
  heroSub: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#52525b',
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  atSign: { fontSize: 18, fontWeight: '800', color: '#52525b' },
  textInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    paddingVertical: 14,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  previewAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
  previewAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1e1e1e',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewInitial: { fontSize: 18, fontWeight: '900', color: '#fff' },
  previewHandle: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 3 },
  previewMeta: { fontSize: 12, color: '#a1a1aa' },
  badge: {
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  rulesCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  rulesTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#52525b',
    letterSpacing: 1,
    marginBottom: 8,
  },
  rulesText: { fontSize: 13, color: '#a1a1aa', lineHeight: 20 },
  saveError: { fontSize: 13, color: '#ef4444', textAlign: 'center', marginTop: 8 },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  ctaGrad: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  ctaText: { fontSize: 16, fontWeight: '900', color: '#000' },
});
