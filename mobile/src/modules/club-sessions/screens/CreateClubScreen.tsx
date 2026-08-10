/**
 * S4 — Create Club (full form)
 * Wired to real POST /api/app-clubs.
 */
import React, { useState, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Switch, KeyboardAvoidingView, Platform, Keyboard,
  Image, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Camera } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { useCsNav } from '../navigation/CSNavigator'
import { ScreenShell } from './ScreenShell'
import { createClub } from '../api/csApi'
import { useTranslation } from 'react-i18next'
import { useCsTheme } from '../csTheme'
import type { CsThemeColors } from '../csTheme'
import { useAuthStore } from '../../../stores/authStore'
import { ClubProfileScreen } from '../../clubs/screens/ClubProfileScreen'
import { ClubLocationField } from '../components/ClubLocationField'

interface Props {}

const VIBE_PRESETS = ['Welcoming', 'Competitive', 'Social'] as const

export function CreateClubScreen({}: Props) {
  const T = useCsTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const { replace } = useCsNav()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('club-sessions')
  const { authedFetch } = useAuthStore()

  const [name, setName] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public')
  const [autoApprove, setAutoApprove] = useState(true)
  const [level] = useState('All levels')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New fields
  const [tagline, setTagline] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  /** Local device URI — shown immediately after picking, before upload resolves */
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null)
  const [vibeTag, setVibeTag] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Location — required on create
  const [city, setCity] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)

  async function handlePickCoverPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setError('Camera roll access is required to upload a cover photo.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    // Show local file immediately — no blank wait
    setLocalCoverUri(asset.uri)
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: 'cover.jpg',
      } as unknown as Blob)
      const res = await authedFetch('/api/upload/image', { method: 'POST', body: formData })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setCoverImageUrl(data.url ?? null)
      setLocalCoverUri(data.url ?? asset.uri)
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Image upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  function handleVibePreset(preset: string) {
    if (vibeTag === preset) {
      setVibeTag('')
    } else {
      setVibeTag(preset)
    }
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) { setError(t('createClub.errors.nameRequired')); return }

    // Validate location
    if (!city.trim() || latitude == null || longitude == null) {
      setLocationError('Club location is required. Tap "Use My Location" or type your city.')
      return
    }
    setLocationError(null)

    setLoading(true)
    setError(null)
    try {
      const club = await createClub({
        name: trimmed,
        icon: null,
        privacy,
        autoApproveNewMembers: autoApprove,
        level: level || null,
        tagline: tagline.trim() || null,
        coverImageUrl,
        vibeTag: vibeTag.trim() || null,
        city: city.trim(),
        latitude: latitude!,
        longitude: longitude!,
      })
      replace('ClubDetail', { clubId: club.id })
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      if (e.status === 409) {
        setError(t('createClub.errors.alreadyHave'))
      } else {
        setError(e.message || t('createClub.errors.failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  const previewData = {
    id: '__preview__',
    name: name.trim() || 'My Club',
    tagline: tagline.trim() || null,
    coverImageUrl: localCoverUri,
    vibeTag: vibeTag.trim() || null,
  }

  return (
    <>
      <ScreenShell showBack title={t('screens.createClub')} rightLabel={t('actions.save', { ns: 'common' })} onRightPress={handleCreate}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* ── IDENTITY ── */}
            <Text style={styles.sectionLabel}>{t('createClub.identitySection')}</Text>
            <Text style={styles.fieldLabel}>{t('createClub.clubNameLabel')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={v => { setName(v); setError(null) }}
              placeholder={t('createClub.clubNamePlaceholder')}
              placeholderTextColor={T.muted}
              selectionColor={T.glassPrimary}
            />

            {/* Tagline */}
            <Text style={styles.fieldLabel}>Tagline <Text style={styles.optional}>(optional, max 60 chars)</Text></Text>
            <TextInput
              style={styles.input}
              value={tagline}
              onChangeText={setTagline}
              placeholder="e.g. Where champions are made"
              placeholderTextColor={T.muted}
              selectionColor={T.glassPrimary}
              maxLength={60}
            />

            {/* Cover photo */}
            <Text style={styles.fieldLabel}>Cover photo <Text style={styles.optional}>(optional)</Text></Text>
            <TouchableOpacity style={styles.coverPhotoBtn} onPress={handlePickCoverPhoto} activeOpacity={0.8}>
              {localCoverUri ? (
                <View style={styles.coverPhotoPicker}>
                  <Image source={{ uri: localCoverUri }} style={styles.coverPhotoPreview} resizeMode="cover" />
                  {uploadingImage && (
                    <View style={styles.coverPhotoUploading}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.coverPhotoUploadingText}>Uploading…</Text>
                    </View>
                  )}
                </View>
              ) : uploadingImage ? (
                <View style={styles.coverPhotoPicker}>
                  <ActivityIndicator size="small" color={T.glassPrimary} />
                  <Text style={styles.coverPhotoLabel}>Uploading…</Text>
                </View>
              ) : (
                <View style={styles.coverPhotoPicker}>
                  <Camera size={24} color={T.muted} strokeWidth={1.5} />
                  <Text style={styles.coverPhotoLabel}>Tap to add cover photo</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Vibe tag */}
            <Text style={styles.fieldLabel}>Vibe <Text style={styles.optional}>(optional)</Text></Text>
            <View style={styles.vibeRow}>
              {VIBE_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.vibePill, vibeTag === preset && styles.vibePillSelected]}
                  onPress={() => handleVibePreset(preset)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.vibePillText, vibeTag === preset && styles.vibePillTextSelected]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              value={vibeTag}
              onChangeText={setVibeTag}
              placeholder="Or type a custom vibe…"
              placeholderTextColor={T.muted}
              selectionColor={T.glassPrimary}
              maxLength={30}
            />

            {/* ── LOCATION ── */}
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Location</Text>
            <Text style={styles.fieldLabel}>City <Text style={styles.optional}>(required)</Text></Text>
            <ClubLocationField
              city={city}
              latitude={latitude}
              longitude={longitude}
              onChange={({ city: c, latitude: lat, longitude: lng }) => {
                setCity(c)
                setLatitude(lat)
                setLongitude(lng)
                if (locationError) setLocationError(null)
              }}
              error={locationError}
            />

            {/* ── ACCESS ── */}
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>{t('createClub.accessSection')}</Text>
            <Text style={styles.fieldLabel}>{t('createClub.privacyLabel')}</Text>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, privacy === 'public' && styles.pillSelected]}
                onPress={() => { Keyboard.dismiss(); setPrivacy('public') }}
              >
                <Text style={[styles.pillText, privacy === 'public' && styles.pillTextSelected]}>
                  {t('createClub.privacyPublic')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pill, privacy === 'private' && styles.pillSelected]}
                onPress={() => { Keyboard.dismiss(); setPrivacy('private') }}
              >
                <Text style={[styles.pillText, privacy === 'private' && styles.pillTextSelected]}>
                  {t('createClub.privacyPrivate')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('createClub.autoApprove')}</Text>
              <Switch
                value={autoApprove}
                onValueChange={setAutoApprove}
                trackColor={{ false: T.glassBorder, true: T.glassPrimary }}
                thumbColor="#fff"
              />
            </View>
          </ScrollView>

          {/* ── Footer ── */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 40) }]}>
            <TouchableOpacity
              style={styles.previewBtn}
              onPress={() => setShowPreview(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.previewBtnText}>Preview club profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={(loading || !name.trim() || !city.trim() || latitude == null) ? styles.createBtnDisabled : undefined}
              onPress={handleCreate}
              disabled={loading || !name.trim() || !city.trim() || latitude == null}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={[T.glassPrimary, T.glassPrimaryEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createBtn}
              >
                <Text style={styles.createBtnText}>{loading ? t('createClub.creatingBtn') : t('createClub.createBtn')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScreenShell>

      {/* Full-screen preview overlay */}
      {showPreview && (
        <View style={StyleSheet.absoluteFillObject}>
          <ClubProfileScreen
            previewData={previewData}
            onClose={() => setShowPreview(false)}
          />
        </View>
      )}
    </>
  )
}

function createStyles(T: CsThemeColors) {
  return StyleSheet.create({
    scroll: { flex: 1, paddingHorizontal: 20 },
    errorBanner: {
      backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12,
      marginTop: 12, marginBottom: 4, borderWidth: 1, borderColor: '#ef4444',
    },
    errorBannerText: { color: '#ef4444', fontSize: 14 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: T.muted, marginTop: 16, marginBottom: 12,
    },
    fieldLabel: { fontSize: 14, color: T.textSecondary, marginBottom: 8, marginTop: 14 },
    optional: { fontSize: 12, color: T.muted, fontWeight: '400' },
    input: {
      backgroundColor: T.glassCard, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: T.text, borderWidth: 1.5, borderColor: T.glassBorder,
    },
    pillRow: {
      flexDirection: 'row', backgroundColor: T.glassCard, borderRadius: 14, padding: 3, gap: 2,
      borderWidth: 1, borderColor: T.glassBorder,
    },
    pill: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
    pillSelected: { backgroundColor: T.glassPrimary },
    pillText: { fontSize: 14, color: T.muted, fontWeight: '500' },
    pillTextSelected: { color: '#FFFFFF', fontWeight: '700' },
    toggleRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.glassBorder,
    },
    toggleLabel: { fontSize: 15, color: T.text, fontWeight: '500' },
    footer: { paddingHorizontal: 20, gap: 10 },
    createBtn: {
      borderRadius: 14, paddingVertical: 16, alignItems: 'center',
    },
    createBtnDisabled: { opacity: 0.4 },
    createBtnText: {
      fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: '#FFFFFF', letterSpacing: 0.5,
    },
    previewBtn: {
      borderRadius: 14, paddingVertical: 14, alignItems: 'center',
      borderWidth: 1.5, borderColor: T.glassPrimary,
      backgroundColor: T.glassPrimary + '14',
    },
    previewBtnText: { fontSize: 15, fontWeight: '600', color: T.glassPrimary },
    // Cover photo
    coverPhotoBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
    coverPhotoPicker: {
      height: 120, backgroundColor: T.glassCard, borderRadius: 14, alignItems: 'center',
      justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: T.glassBorder,
      borderStyle: 'dashed', overflow: 'hidden',
    },
    coverPhotoLabel: { fontSize: 13, color: T.muted },
    coverPhotoPreview: { width: '100%', height: 120, borderRadius: 14 },
    coverPhotoUploading: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14,
    },
    coverPhotoUploadingText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    // Vibe row
    vibeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    vibePill: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
      borderColor: T.glassBorder, backgroundColor: T.glassCard,
    },
    vibePillSelected: { borderColor: T.glassPrimary, backgroundColor: T.glassPrimary + '1A' },
    vibePillText: { fontSize: 14, color: T.textSecondary, fontWeight: '500' },
    vibePillTextSelected: { color: T.glassPrimary, fontWeight: '700' },
  })
}
