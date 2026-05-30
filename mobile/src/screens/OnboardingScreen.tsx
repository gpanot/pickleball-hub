import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { PlayerSearch, type SearchResult, type PlayerSearchRef } from '../components/PlayerSearch'
import { GEAR_AVATAR } from '../components/gear/gearConstants'
import type { PlayerGender } from '../components/gear/gearTypes'

const TOTAL_STEPS = 4

type TimeSlotKey = 'morning' | 'afternoon' | 'evening'

const TIME_OPTIONS: { key: TimeSlotKey; label: string; sub: string }[] = [
  { key: 'morning', label: 'Morning', sub: 'Before 12h' },
  { key: 'afternoon', label: 'Afternoon', sub: '12h — 17h' },
  { key: 'evening', label: 'Evening', sub: 'After 17h' },
]

const { width: SCREEN_W } = Dimensions.get('window')

export function OnboardingScreen({
  onComplete,
  onCancel,
  initialStep = 0,
}: {
  onComplete: () => void
  onCancel?: () => void
  initialStep?: number
}) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(initialStep)
  const [dupr, setDupr] = useState('')
  const [duprError, setDuprError] = useState('')
  const [timeSlots, setTimeSlots] = useState<TimeSlotKey[]>([])
  const [gender, setGender] = useState<PlayerGender | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<SearchResult | null>(null)
  const [finishing, setFinishing] = useState(false)
  const playerSearchRef = useRef<PlayerSearchRef>(null)

  const { authedFetch, setOnboardingComplete, setReclubUserId, setDuprRating, setGender: saveGenderToStore, profileId } =
    useAuthStore()

  const validateDupr = (value: string): boolean => {
    if (!value) return true
    const num = parseFloat(value)
    if (isNaN(num) || num < 0 || num > 8) {
      setDuprError('Enter a value between 0.0 and 8.0')
      return false
    }
    setDuprError('')
    return true
  }

  const nextStep = () => {
    if (step === 0 && !validateDupr(dupr)) return
    if (step === 2 && !gender) return
    if (step < TOTAL_STEPS - 1) setStep(step + 1)
  }

  const prevStep = () => {
    if (step <= initialStep) {
      onCancel?.()
      return
    }
    setStep(step - 1)
  }

  const handleFinish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      const prefs: Record<string, unknown> = {
        dupr: dupr ? parseFloat(dupr) : null,
        timeSlots: timeSlots.length > 0 ? timeSlots : null,
        gender: gender ?? null,
      }

      const res = await authedFetch('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          profileId,
          preferences: prefs,
          gender: gender ?? null,
          reclubUserId: selectedPlayer?.userId ?? undefined,
        }),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        console.error('[onboarding] profile save failed:', res.status, errBody)
        Alert.alert('Could not save', 'Your profile could not be saved. Please try again.')
        setFinishing(false)
        return
      }

      if (selectedPlayer) {
        setReclubUserId(selectedPlayer.userId)
      }
      setDuprRating(dupr ? parseFloat(dupr) : null)
      saveGenderToStore(gender)
      setOnboardingComplete()
      onComplete()
    } catch {
      Alert.alert('Connection error', 'Could not save your profile. Please try again.')
      setFinishing(false)
    }
  }

  const toggleTimeSlot = (key: TimeSlotKey) => {
    setTimeSlots((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  // Focus the search input after the step-3 transition settles
  useEffect(() => {
    if (step === 3) {
      const timer = setTimeout(() => playerSearchRef.current?.focus(), 350)
      return () => clearTimeout(timer)
    }
  }, [step])

  const avatarSize = SCREEN_W * 0.36

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === 'ios' ? 'height' : 'padding'}
      keyboardVerticalOffset={0}
    >
      {/* Progress bar */}
      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              {
                backgroundColor:
                  i < step
                    ? T.amber
                    : i === step
                      ? 'rgba(245,166,35,0.6)'
                      : '#2a2a2a',
              },
            ]}
          />
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        {step > 0 && (
          <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
            <ChevronLeft size={20} color="#999" strokeWidth={2} />
            <Text style={styles.backLabel}>Back</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.stepLabel}>
          Step {step + 1} of {TOTAL_STEPS}
        </Text>
      </View>

      {/* Step 0 — DUPR */}
      {step === 0 && (
        <View style={styles.stepBody}>
          <Text style={styles.question}>What is your DUPR?</Text>
          <Text style={styles.questionSub}>
            Enter your doubles rating (0.0–8.0) or leave blank if unsure
          </Text>
          <TextInput
            style={[styles.textInput, duprError ? { borderColor: '#ef4444' } : undefined]}
            value={dupr}
            onChangeText={(v) => {
              setDupr(v)
              if (duprError) setDuprError('')
            }}
            placeholder="e.g. 3.5"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
            maxLength={4}
          />
          {duprError !== '' && (
            <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>
              {duprError}
            </Text>
          )}
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={nextStep}
            activeOpacity={0.8}
          >
            <Text style={styles.nextLabel}>
              {dupr ? 'Next' : 'Skip for now'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 1 — When do you play? (Morning / Afternoon / Evening, multi-select) */}
      {step === 1 && (
        <View style={styles.stepBody}>
          <Text style={styles.question}>When do you usually play?</Text>
          <Text style={styles.questionSub}>Select all that apply</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {TIME_OPTIONS.map((opt) => {
              const selected = timeSlots.includes(opt.key)
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.optionBtn, selected && styles.optionBtnSelected]}
                  onPress={() => toggleTimeSlot(opt.key)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionSub}>{opt.sub}</Text>
                  </View>
                  {selected && (
                    <View style={styles.checkMark}>
                      <Text style={{ color: '#000', fontWeight: '700', fontSize: 12 }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity
            style={[styles.nextBtn, { marginTop: 24 }]}
            onPress={nextStep}
            activeOpacity={0.8}
          >
            <Text style={styles.nextLabel}>
              {timeSlots.length > 0 ? 'Next' : 'Skip for now'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2 — Gender / Avatar */}
      {step === 2 && (
        <View style={[styles.stepBody, { alignItems: 'center' }]}>
          <Text style={styles.question}>Choose your avatar</Text>
          <Text style={styles.questionSub}>This sets your gear screen background</Text>
          <View style={styles.genderRow}>
            <TouchableOpacity
              style={styles.genderOption}
              activeOpacity={0.8}
              onPress={() => { setGender('man'); setStep(s => s + 1) }}
            >
              <Image
                source={GEAR_AVATAR.man}
                style={[
                  styles.genderAvatar,
                  { width: avatarSize, height: avatarSize * 1.4 },
                  gender === 'man' && { borderColor: T.amber },
                ]}
                resizeMode="cover"
              />
              <Text style={styles.genderLabel}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.genderOption}
              activeOpacity={0.8}
              onPress={() => { setGender('female'); setStep(s => s + 1) }}
            >
              <Image
                source={GEAR_AVATAR.female}
                style={[
                  styles.genderAvatar,
                  { width: avatarSize, height: avatarSize * 1.4 },
                  gender === 'female' && { borderColor: T.amber },
                ]}
                resizeMode="cover"
              />
              <Text style={styles.genderLabel}>Female</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3 — Find your Reclub name */}
      {step === 3 && (
        <View style={[styles.stepBody, { flex: 1 }]}>
          <Text style={styles.question}>
            Let's find your name on Reclub so we can find your friends
          </Text>
          <Text style={[styles.questionSub, { marginBottom: 12 }]}>
            Search by your Reclub name
          </Text>

          <PlayerSearch
            ref={playerSearchRef}
            mode="select"
            selectedPlayer={selectedPlayer}
            onSelectPlayer={setSelectedPlayer}
          />

          <TouchableOpacity
            style={[styles.nextBtn, { marginTop: 12, marginBottom: insets.bottom + 8 }, finishing && { opacity: 0.6 }]}
            onPress={() => {
              Keyboard.dismiss()
              handleFinish()
            }}
            activeOpacity={0.8}
            disabled={finishing}
          >
            {finishing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.nextLabel}>
                {selectedPlayer ? 'Continue' : 'Skip'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.bg,
    paddingHorizontal: 20,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  progressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  backLabel: {
    fontSize: 13,
    color: '#999',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stepBody: {
    paddingTop: 8,
  },
  question: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 26,
  },
  questionSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 6,
  },
  textInput: {
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#fff',
    marginTop: 20,
    borderWidth: 1,
    borderColor: T.border,
  },
  nextBtn: {
    backgroundColor: T.amber,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  nextLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: T.border,
  },
  optionBtnSelected: {
    borderColor: T.amber,
    backgroundColor: 'rgba(245,166,35,0.08)',
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  optionSub: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  checkMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: T.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 32,
  },
  genderOption: {
    alignItems: 'center',
    gap: 10,
  },
  genderAvatar: {
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  genderLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
})
