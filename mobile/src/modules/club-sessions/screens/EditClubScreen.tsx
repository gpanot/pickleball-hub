/**
 * S5 — Edit Club
 *
 * Role-based access:
 *  Owner / Admin  — full edit: all fields, Save, Delete, Managers CRUD
 *  Host Manager   — read-only: fields disabled, Save/Delete hidden, no ⋯, no + Add
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  TextInput, Switch, KeyboardAvoidingView, Platform, ActivityIndicator,
  Keyboard, Alert, Image,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, Camera, MoreVertical } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as ImagePicker from 'expo-image-picker'
import { useCsNav } from '../navigation/CSNavigator'
import { ScreenShell } from './ScreenShell'
import {
  fetchClub, updateClub, deleteClub,
  type AppClub, type ClubRole,
} from '../api/csApi'
import { useTranslation } from 'react-i18next'
import { useCsTheme } from '../csTheme'
import type { CsThemeColors } from '../csTheme'
import { useAuthStore } from '@/stores/authStore'
import { ClubProfileScreen } from '../../clubs/screens/ClubProfileScreen'
import { ClubLocationField } from '../components/ClubLocationField'

interface Props { clubId: string }

const VIBE_PRESETS = ['Welcoming', 'Competitive', 'Social'] as const


export function EditClubScreen({ clubId }: Props) {
  const T = useCsTheme()
  const styles = useMemo(() => createStyles(T), [T])
  const { push, back } = useCsNav()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('club-sessions')
  const profileId = useAuthStore((s) => s.profileId)
  const { authedFetch } = useAuthStore()

  const [clubName, setClubName] = useState('')
  const [clubOrigName, setClubOrigName] = useState('')
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public')
  const [autoApprove, setAutoApprove] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [viewerRole, setViewerRole] = useState<ClubRole | null>(null)
  const canEdit = viewerRole === 'OWNER' || viewerRole === 'ADMIN'
  const isOwner = viewerRole === 'OWNER'

  const [tagline, setTagline] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  /** Local device URI — shown immediately after picking, before upload resolves */
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null)
  const [vibeTag, setVibeTag] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const [selectedIcon, setSelectedIcon] = useState<string | null>(null)

  // Location
  const [city, setCity] = useState('')
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const c = await fetchClub(clubId)
        setClubName(c.name)
        setClubOrigName(c.name)
        setSelectedIcon(c.icon ?? 'shield')
        setPrivacy(c.privacy as 'public' | 'private')
        setAutoApprove(c.autoApproveNewMembers)
        setTagline(c.tagline ?? '')
        setCoverImageUrl(c.coverImageUrl ?? null)
        setLocalCoverUri(c.coverImageUrl ?? null)
        setVibeTag(c.vibeTag ?? '')
        setCity(c.city ?? '')
        setLatitude(c.latitude ?? null)
        setLongitude(c.longitude ?? null)
        // Derive viewer role from the managers list embedded in the club
        if (profileId && c.managers) {
          const self = c.managers.find(m => m.profile.id === profileId)
          setViewerRole(self?.role ?? null)
        }
      } catch {
        setError('Failed to load club')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [clubId, profileId])

  async function handlePickCoverPhoto() {
    if (!canEdit) return
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
    // Show the local file immediately — no blank wait
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
    if (!canEdit) return
    if (vibeTag === preset) {
      setVibeTag('')
    } else {
      setVibeTag(preset)
    }
  }

  async function handleSave() {
    if (!canEdit) return
    const trimmed = clubName.trim()
    if (!trimmed) { setError('Club name is required'); return }

    // Validate location when it has been set/changed
    if (!city.trim() || latitude == null || longitude == null) {
      setLocationError('Club location is required. Tap "Use My Location" or type your city.')
      return
    }
    setLocationError(null)

    setSaving(true)
    setError(null)
    try {
      await updateClub(clubId, {
        name: trimmed,
        icon: selectedIcon,
        privacy,
        autoApproveNewMembers: autoApprove,
        tagline: tagline.trim() || null,
        coverImageUrl,
        vibeTag: vibeTag.trim() || null,
        city: city.trim(),
        latitude: latitude!,
        longitude: longitude!,
      })
      back()
    } catch (err: unknown) {
      const e = err as Error
      setError(e.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    if (!canEdit) return
    Alert.alert(
      'Delete club?',
      `"${clubOrigName || 'This club'}" and all its sessions will be permanently deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => Alert.alert(
            'Are you absolutely sure?',
            'This cannot be undone. All sessions and bookings will be lost.',
            [
              { text: 'Go back', style: 'cancel' },
              {
                text: 'Delete forever', style: 'destructive',
                onPress: async () => {
                  setDeleting(true)
                  setError(null)
                  try { await deleteClub(clubId); back() }
                  catch (err: unknown) {
                    const e = err as Error
                    setError(e.message || 'Failed to delete club')
                    setDeleting(false)
                  }
                },
              },
            ],
          ),
        },
      ],
    )
  }

  if (loading) {
    return (
      <ScreenShell showBack title={t('screens.editClub')}>
        <View style={styles.center}><ActivityIndicator color={T.glassPrimary} /></View>
      </ScreenShell>
    )
  }

  const previewData = {
    id: clubId,
    name: clubName.trim() || 'My Club',
    tagline: tagline.trim() || null,
    coverImageUrl: localCoverUri,
    vibeTag: vibeTag.trim() || null,
  }

  return (
    <>
      <ScreenShell
        showBack
        title={t('screens.editClub')}
        rightElement={canEdit && isOwner ? (
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Club options', undefined, [
                {
                  text: 'Delete club',
                  style: 'destructive',
                  onPress: confirmDelete,
                },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
            hitSlop={10}
          >
            <MoreVertical size={22} color={T.text} strokeWidth={2} />
          </TouchableOpacity>
        ) : undefined}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {error && (
              <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>
            )}

            {/* Host Manager read-only notice */}
            {viewerRole === 'HOST_MANAGER' && (
              <View style={styles.readonlyBanner}>
                <Text style={styles.readonlyText}>You can view this club but only Owners and Admins can edit settings.</Text>
              </View>
            )}

            {/* ── IDENTITY ── */}
            <Text style={styles.sectionLabel}>IDENTITY</Text>
            <Text style={styles.fieldLabel}>Club name</Text>
            <TextInput
              style={[styles.input, !canEdit && styles.inputDisabled, { color: T.text }]}
              value={clubName}
              onChangeText={t => { if (canEdit) { setClubName(t); setError(null) } }}
              editable={canEdit}
              selectionColor={T.glassPrimary}
              placeholderTextColor={T.muted}
            />

            {/* Tagline */}
            <Text style={styles.fieldLabel}>Tagline <Text style={styles.optional}>(max 60 chars)</Text></Text>
            <TextInput
              style={[styles.input, !canEdit && styles.inputDisabled, { color: T.text }]}
              value={tagline}
              onChangeText={v => { if (canEdit) setTagline(v) }}
              editable={canEdit}
              placeholder="e.g. Where champions are made"
              placeholderTextColor={T.muted}
              selectionColor={T.glassPrimary}
              maxLength={60}
            />

            {/* Cover photo */}
            <Text style={styles.fieldLabel}>Cover photo</Text>
            <TouchableOpacity style={styles.coverPhotoBtn} onPress={handlePickCoverPhoto} activeOpacity={0.8} disabled={!canEdit}>
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
                <View style={[styles.coverPhotoPicker, !canEdit && { opacity: 0.5 }]}>
                  <Camera size={24} color={T.muted} strokeWidth={1.5} />
                  <Text style={styles.coverPhotoLabel}>{canEdit ? 'Tap to change cover photo' : 'No cover photo'}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Vibe tag */}
            <Text style={styles.fieldLabel}>Vibe <Text style={styles.optional}>(max 30 chars)</Text></Text>
            <View style={styles.vibeRow}>
              {VIBE_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[styles.vibePill, vibeTag === preset && styles.vibePillSelected]}
                  onPress={() => handleVibePreset(preset)}
                  activeOpacity={0.8}
                  disabled={!canEdit}
                >
                  <Text style={[styles.vibePillText, vibeTag === preset && styles.vibePillTextSelected]}>
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, !canEdit && styles.inputDisabled, { color: T.text, marginTop: 8 }]}
              value={vibeTag}
              onChangeText={v => { if (canEdit) setVibeTag(v) }}
              editable={canEdit}
              placeholder="Or type a custom vibe…"
              placeholderTextColor={T.muted}
              selectionColor={T.glassPrimary}
              maxLength={30}
            />

            {/* ── LOCATION ── */}
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>LOCATION</Text>
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
              disabled={!canEdit}
              error={locationError}
            />

            {/* ── ACCESS ── */}
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>ACCESS</Text>
            <Text style={styles.fieldLabel}>Privacy</Text>
            <View style={styles.pillRow}>
              {(['public', 'private'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pill, privacy === p && styles.pillSelected]}
                  onPress={() => { if (!canEdit) return; Keyboard.dismiss(); setPrivacy(p) }}
                  disabled={!canEdit}
                >
                  <Text style={[styles.pillText, privacy === p && styles.pillTextSelected]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Auto-approve new members</Text>
              <Switch
                value={autoApprove}
                onValueChange={v => { if (canEdit) setAutoApprove(v) }}
                disabled={!canEdit}
                trackColor={{ false: T.glassBorder, true: T.glassPrimary }}
                thumbColor="#fff"
              />
            </View>

          </ScrollView>

          {/* ── Footer: Preview + Save side by side (Owner/Admin only) ── */}
          {canEdit && (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 40) }]}>
              <View style={styles.footerRow}>
                <TouchableOpacity
                  style={styles.previewBtn}
                  onPress={() => setShowPreview(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.previewBtnText}>Preview Club</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtnWrap, (saving || deleting) && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving || deleting}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[T.glassPrimary, T.glassPrimaryEnd]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.saveBtn}
                  >
                    <Check size={16} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1, paddingHorizontal: 20 },
    errorBanner: {
      backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12,
      marginTop: 12, marginBottom: 4, borderWidth: 1, borderColor: '#ef4444',
    },
    errorText: { color: '#ef4444', fontSize: 13 },
    readonlyBanner: {
      backgroundColor: 'rgba(100,116,139,0.12)', borderRadius: 12, padding: 12,
      marginTop: 12, marginBottom: 4, borderWidth: 1, borderColor: 'rgba(100,116,139,0.3)',
    },
    readonlyText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
    sectionLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: T.muted, marginTop: 16, marginBottom: 12,
    },
    fieldLabel: { fontSize: 14, color: T.textSecondary, marginBottom: 8, marginTop: 14 },
    optional: { fontSize: 12, color: T.muted, fontWeight: '400' },
    input: {
      backgroundColor: T.glassCard, borderRadius: 14, paddingHorizontal: 16,
      paddingVertical: 14, fontSize: 16,
      borderWidth: 1.5, borderColor: T.glassBorder,
    },
    inputDisabled: { opacity: 0.5 },
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
    footer: { paddingHorizontal: 20, paddingTop: 10 },
    footerRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
    saveBtnWrap: { flex: 1 },
    saveBtn: {
      borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: {
      fontFamily: 'BarlowCondensed_800ExtraBold', fontSize: 18, color: '#FFFFFF', letterSpacing: 0.5,
    },
    deleteBtn: {
      borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 14,
      paddingVertical: 14, alignItems: 'center',
    },
    deleteBtnText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
    previewBtn: {
      flex: 1, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
      justifyContent: 'center',
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
