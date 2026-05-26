import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, CheckCircle, X } from 'lucide-react-native'
import { GearBubble, GearDot } from './GearBubble'
import { GearBrandSheet } from './GearBrandSheet'
import { GEAR_ZONES, GEAR_AVATAR, playerGenderFromStored } from './gearConstants'
import { GearProfile, GearZoneConfig, GearZoneKey, PlayerGender } from './gearTypes'

type BubblePosition = {
  top: string
  left?: string
  right?: string
  alignItems: 'flex-start' | 'flex-end'
  flipRow?: boolean
  connectorWidth?: number
}

const ZONE_POSITIONS: Record<GearZoneKey, BubblePosition> = {
  cap: {
    top: '18%',
    right: '8%',
    alignItems: 'flex-end',
  },
  shirt: {
    top: '30%',
    left: '4%',
    alignItems: 'flex-start',
    flipRow: true,
  },
  paddle: {
    top: '40%',
    right: '6%',
    alignItems: 'flex-end',
  },
  shoes: {
    top: '63%',
    right: '8%',
    alignItems: 'flex-end',
    connectorWidth: 100,
  },
}

const { width: SCREEN_W } = Dimensions.get('window')

type Props = {
  gender: PlayerGender | null
  initialGear: GearProfile
  saving: boolean
  error: string | null
  onSave: (gear: GearProfile) => void
  onBack: () => void
  onSkip?: () => void
  isOnboarding?: boolean
  savedConfirmation?: boolean
  closeIcon?: 'back' | 'close'
  embedded?: boolean
}

export function GearSetupScreen({
  gender: initialGender,
  initialGear,
  saving,
  error,
  onSave,
  onBack,
  onSkip,
  isOnboarding = false,
  savedConfirmation = false,
  closeIcon = 'back',
  embedded = false,
}: Props) {
  const insets = useSafeAreaInsets()
  const [gear, setGear] = useState<GearProfile>(initialGear)
  const [activeZone, setActiveZone] = useState<GearZoneConfig | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [pickedGender, setPickedGender] = useState<PlayerGender | null>(
    initialGender ?? (initialGear.gender ? playerGenderFromStored(initialGear.gender) : null)
  )
  const [showGenderPicker, setShowGenderPicker] = useState(!pickedGender)

  const gender: PlayerGender = pickedGender ?? 'man'

  const gearFieldCount = [gear.cap, gear.shirt, gear.paddle, gear.shoes].filter((v) => v !== null).length
  const allDone = gearFieldCount === 4

  useEffect(() => {
    if (savedConfirmation) setHasUnsavedChanges(false)
  }, [savedConfirmation])

  const handleConfirm = (brand: string) => {
    if (!activeZone) return
    setGear((prev) => ({ ...prev, [activeZone.key]: brand }))
    setHasUnsavedChanges(true)
    setActiveZone(null)
  }

  const showSave = isOnboarding || !allDone || hasUnsavedChanges || saving

  if (showGenderPicker) {
    const avatarSize = SCREEN_W * 0.36
    return (
      <View style={styles.root}>
        <View style={[styles.genderTopBar, { paddingTop: embedded ? 12 : insets.top + 8 }]}>
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
            {closeIcon === 'close' ? (
              <X size={20} color="#fff" strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={22} color="#fff" strokeWidth={2.5} />
            )}
          </Pressable>
        </View>
        <View style={styles.genderContent}>
          <Text style={styles.genderTitle}>Choose your avatar</Text>
          <Text style={styles.genderSub}>This sets your gear screen background</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={styles.genderOption}
              activeOpacity={0.8}
              onPress={() => {
                setPickedGender('man')
                setShowGenderPicker(false)
              }}
            >
              <Image
                source={GEAR_AVATAR.man}
                style={[styles.genderAvatar, { width: avatarSize, height: avatarSize * 1.4, borderRadius: 20 }]}
                resizeMode="cover"
              />
              <Text style={styles.genderLabel}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.genderOption}
              activeOpacity={0.8}
              onPress={() => {
                setPickedGender('female')
                setShowGenderPicker(false)
              }}
            >
              <Image
                source={GEAR_AVATAR.female}
                style={[styles.genderAvatar, { width: avatarSize, height: avatarSize * 1.4, borderRadius: 20 }]}
                resizeMode="cover"
              />
              <Text style={styles.genderLabel}>Female</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {/* Full-bleed avatar background */}
      <Image source={GEAR_AVATAR[gender]} style={styles.bgImage} resizeMode="cover" />

      {/* Dark gradient overlay at top and bottom */}
      {!embedded && <View style={styles.topGradient} />}
      {!embedded && <View style={styles.bottomGradient} />}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: embedded ? 12 : insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.backBtn} hitSlop={12}>
          {closeIcon === 'close' ? (
            <X size={20} color="#fff" strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={22} color="#fff" strokeWidth={2.5} />
          )}
        </Pressable>
        <Text style={styles.topBarTitle}>My Gear</Text>
        {showSave ? (
          <TouchableOpacity
            onPress={() => onSave({ ...gear, gender })}
            disabled={!allDone || saving}
            activeOpacity={0.7}
            style={[styles.saveBtn, (!allDone || saving) && styles.saveBtnDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#1a0a00" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>{isOnboarding ? 'Start' : 'Save'}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.saveBtnPlaceholder} />
        )}
      </View>

      {/* Saved confirmation badge */}
      {savedConfirmation && (
        <View style={[styles.toast, { top: (embedded ? 12 : insets.top + 8) + 48 }]}>
          <CheckCircle size={16} color="#f5a623" strokeWidth={2} />
          <Text style={styles.toastText}>Gear saved!</Text>
        </View>
      )}

      {/* Body-anchored bubbles */}
      {GEAR_ZONES.map((zone) => {
        const pos = ZONE_POSITIONS[zone.key]
        const selected = gear[zone.key] !== null
        const flip = pos.flipRow === true
        const lineW = pos.connectorWidth ?? 20
        return (
          <View
            key={zone.key}
            style={[
              styles.bubbleAnchor,
              {
                top: pos.top as any,
                ...(pos.left ? { left: pos.left as any } : {}),
                ...(pos.right ? { right: pos.right as any } : {}),
                alignItems: pos.alignItems,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.bubbleRow}>
              {flip ? (
                <>
                  <GearBubble
                    zone={zone}
                    value={gear[zone.key]}
                    onPress={() => setActiveZone(zone)}
                  />
                  <View style={[styles.connectorLine, { width: lineW }]} />
                  <GearDot selected={selected} />
                </>
              ) : (
                <>
                  <GearDot selected={selected} />
                  <View style={[styles.connectorLine, { width: lineW }]} />
                  <GearBubble
                    zone={zone}
                    value={gear[zone.key]}
                    onPress={() => setActiveZone(zone)}
                  />
                </>
              )}
            </View>
          </View>
        )
      })}

      {/* Bottom progress bar + optional skip */}
      <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <Text style={styles.progressLabel}>
          {gearFieldCount === 0
            ? 'Tap a zone to set your gear'
            : gearFieldCount === 4
              ? 'All gear set — tap Save!'
              : `${gearFieldCount} of 4 zones set`}
        </Text>
        <View style={styles.progressRow}>
          {GEAR_ZONES.map((z) => (
            <View
              key={z.key}
              style={[styles.progressDot, gear[z.key] !== null && styles.progressDotDone]}
            />
          ))}
        </View>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {isOnboarding && onSkip && (
          <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Brand picker sheet — renders as Modal above everything */}
      <GearBrandSheet
        zone={activeZone}
        currentValue={activeZone ? gear[activeZone.key] : null}
        onConfirm={handleConfirm}
        onClose={() => setActiveZone(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0A' },
  bgImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30,30,30,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#f5a623',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#1a0a00' },
  saveBtnPlaceholder: { minWidth: 72, height: 36 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.3)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    zIndex: 15,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  bubbleAnchor: { position: 'absolute', zIndex: 5 },
  bubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connectorLine: {
    width: 20,
    height: 1.5,
    backgroundColor: 'rgba(245,166,35,0.35)',
  },
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    zIndex: 5,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginBottom: 6,
    textAlign: 'center',
  },
  progressRow: { flexDirection: 'row', gap: 6 },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(60,60,60,0.6)',
  },
  progressDotDone: { backgroundColor: '#f5a623' },
  errorText: { color: '#E24B4A', fontSize: 13, paddingTop: 8, textAlign: 'center' },
  skipBtn: { alignItems: 'center', paddingTop: 12 },
  skipText: { color: '#888', fontSize: 14 },
  genderTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  genderContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  genderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  genderSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 32,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 20,
  },
  genderOption: {
    alignItems: 'center',
    gap: 10,
  },
  genderAvatar: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  genderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
})
