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
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, ChevronDown } from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'
import { PlayerSearch, type SearchResult, type PlayerSearchRef } from '../components/PlayerSearch'

const TOTAL_STEPS = 3

type TimeSlot =
  | 'weekday_evenings'
  | 'weekends'
  | 'weekday_mornings'
  | 'weekday_afternoons'
  | 'weekend_evenings'

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
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(null)
  const [otherExpanded, setOtherExpanded] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<SearchResult | null>(null)
  const [finishing, setFinishing] = useState(false)
  const playerSearchRef = useRef<PlayerSearchRef>(null)

  const { authedFetch, setOnboardingComplete, setReclubUserId, setDuprRating, profileId } =
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
    if (step < TOTAL_STEPS - 1) setStep(step + 1)
  }

  const prevStep = () => {
    if (step <= initialStep) {
      onCancel?.()
      return
    }
    setStep(step - 1)
    setOtherExpanded(false)
  }

  const handleFinish = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      const prefs: Record<string, unknown> = {
        dupr: dupr ? parseFloat(dupr) : null,
        timeSlots: timeSlot,
      }

      const res = await authedFetch('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          profileId,
          preferences: prefs,
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

      // Only overwrite the stored Reclub ID if the user actively selected one.
      if (selectedPlayer) {
        setReclubUserId(selectedPlayer.userId)
      }
      setDuprRating(dupr ? parseFloat(dupr) : null)
      setOnboardingComplete()
      onComplete()
    } catch {
      Alert.alert('Connection error', 'Could not save your profile. Please try again.')
      setFinishing(false)
    }
  }

  const handleTimeSelect = (value: string) => {
    if (value === 'other') {
      setOtherExpanded(!otherExpanded)
      return
    }
    setOtherExpanded(false)
    setTimeSlot(value as TimeSlot)
    setTimeout(nextStep, 200)
  }

  const TOP_OPTIONS: { label: string; sub: string; value: string; expandable?: boolean }[] = [
    {
      label: 'Weekday evenings',
      sub: 'Mon–Fri after 5 PM',
      value: 'weekday_evenings',
    },
    {
      label: 'Weekends',
      sub: 'Saturday & Sunday',
      value: 'weekends',
    },
    {
      label: 'Other times',
      sub: 'Mornings, afternoons, weekend evenings',
      value: 'other',
      expandable: true,
    },
  ]

  const SUB_OPTIONS: { label: string; sub: string; value: TimeSlot }[] = [
    {
      label: 'Weekday mornings',
      sub: 'Mon–Fri before noon',
      value: 'weekday_mornings',
    },
    {
      label: 'Weekday afternoons',
      sub: 'Mon–Fri 12–5 PM',
      value: 'weekday_afternoons',
    },
    {
      label: 'Weekend evenings',
      sub: 'Sat & Sun after 5 PM',
      value: 'weekend_evenings',
    },
  ]

  // Focus the search input after the step-2 transition settles
  useEffect(() => {
    if (step === 2) {
      const timer = setTimeout(() => playerSearchRef.current?.focus(), 350)
      return () => clearTimeout(timer)
    }
  }, [step])

  // Animate the expand/collapse of "Other times"
  const expandHeight = useSharedValue(0)
  useEffect(() => {
    expandHeight.value = withTiming(otherExpanded ? SUB_OPTIONS.length * 62 : 0, {
      duration: 200,
    })
  }, [otherExpanded])
  const expandStyle = useAnimatedStyle(() => ({
    height: expandHeight.value,
    opacity: expandHeight.value > 0 ? 1 : 0,
    overflow: 'hidden' as const,
  }))

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

      {/* Step 1 — When do you play? (web-app style with expandable "Other") */}
      {step === 1 && (
        <View style={styles.stepBody}>
          <Text style={styles.question}>When do you usually play?</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {TOP_OPTIONS.map((opt) => (
              <View key={opt.value}>
                <TouchableOpacity
                  style={[
                    styles.optionBtn,
                    opt.value === 'other' && otherExpanded && styles.optionBtnSelected,
                    timeSlot === opt.value && styles.optionBtnSelected,
                  ]}
                  onPress={() => handleTimeSelect(opt.value)}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionSub}>{opt.sub}</Text>
                  </View>
                  {opt.expandable ? (
                    <ChevronDown
                      size={18}
                      color="#666"
                      strokeWidth={2}
                      style={{
                        transform: [{ rotate: otherExpanded ? '180deg' : '0deg' }],
                      }}
                    />
                  ) : null}
                </TouchableOpacity>

                {/* Sub-options under "Other times" */}
                {opt.expandable && (
                  <Animated.View style={expandStyle}>
                    <View style={{ paddingLeft: 12, paddingTop: 6, gap: 6 }}>
                      {SUB_OPTIONS.map((sub) => (
                        <TouchableOpacity
                          key={sub.value}
                          style={[
                            styles.subOptionBtn,
                            timeSlot === sub.value && styles.optionBtnSelected,
                          ]}
                          onPress={() => handleTimeSelect(sub.value)}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.subOptionLabel}>{sub.label}</Text>
                            <Text style={styles.optionSub}>{sub.sub}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </Animated.View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Step 2 — Find your Reclub name */}
      {step === 2 && (
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
  subOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.input,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.15)',
  },
  subOptionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
})
