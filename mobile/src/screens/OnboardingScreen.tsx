import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Search, Check } from 'lucide-react-native'
import { T } from '../theme'
import { useAuthStore } from '../stores/authStore'

const TOTAL_STEPS = 4

type TimeSlot =
  | 'weekday_evenings'
  | 'weekends'
  | 'weekday_mornings'
  | 'weekday_afternoons'
  | 'weekend_evenings'

type Availability = 'morning' | 'lunch' | 'after_work'

type SearchResult = {
  userId: string
  displayName: string | null
  username: string | null
  imageUrl: string | null
  duprDoubles: number | null
}

export function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(0)
  const [dupr, setDupr] = useState('')
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(null)
  const [availability, setAvailability] = useState<Availability[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<SearchResult | null>(null)

  const { authedFetch, setOnboardingComplete, setReclubUserId, profileId } =
    useAuthStore()

  const nextStep = () => {
    if (step < TOTAL_STEPS - 1) setStep(step + 1)
  }

  const prevStep = () => {
    if (step > 0) setStep(step - 1)
  }

  const handleFinish = async () => {
    const prefs: Record<string, unknown> = {
      dupr: dupr ? parseFloat(dupr) : null,
      timeSlots: timeSlot,
      availability,
    }

    await authedFetch('/api/profile', {
      method: 'POST',
      body: JSON.stringify({
        profileId,
        preferences: prefs,
        reclubUserId: selectedPlayer?.userId ?? undefined,
      }),
    })

    if (selectedPlayer) {
      setReclubUserId(selectedPlayer.userId)
    }
    setOnboardingComplete()
    onComplete()
  }

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await authedFetch(
          `/api/players/search?q=${encodeURIComponent(searchQuery)}`
        )
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data)
        }
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const toggleAvailability = (slot: Availability) => {
    setAvailability((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    )
  }

  const TIME_OPTIONS: { label: string; sub: string; value: TimeSlot }[] = [
    {
      label: 'Weekday evenings',
      sub: 'Mon–Fri after 5 PM',
      value: 'weekday_evenings',
    },
    { label: 'Weekends', sub: 'Saturday & Sunday', value: 'weekends' },
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

  const AVAIL_OPTIONS: { label: string; value: Availability }[] = [
    { label: 'Morning', value: 'morning' },
    { label: 'Lunch', value: 'lunch' },
    { label: 'After work', value: 'after_work' },
  ]

  const renderPlayerResult = useCallback(
    ({ item }: { item: SearchResult }) => {
      const isSelected = selectedPlayer?.userId === item.userId
      return (
        <TouchableOpacity
          onPress={() => setSelectedPlayer(isSelected ? null : item)}
          style={[styles.resultRow, isSelected && styles.resultRowSelected]}
          activeOpacity={0.7}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.resultAvatar}
            />
          ) : (
            <View style={[styles.resultAvatar, styles.resultAvatarFallback]}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                {(item.displayName ?? '?')[0]}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.resultName}>
              {item.displayName ?? item.username ?? 'Unknown'}
            </Text>
            {item.duprDoubles != null && (
              <Text style={styles.resultDupr}>
                DUPR {item.duprDoubles.toFixed(2)}
              </Text>
            )}
          </View>
          {isSelected && <Check size={20} color={T.green} strokeWidth={2.5} />}
        </TouchableOpacity>
      )
    },
    [selectedPlayer]
  )

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            style={styles.textInput}
            value={dupr}
            onChangeText={setDupr}
            placeholder="e.g. 3.5"
            placeholderTextColor="#555"
            keyboardType="decimal-pad"
            maxLength={4}
          />
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

      {/* Step 1 — When do you play? */}
      {step === 1 && (
        <View style={styles.stepBody}>
          <Text style={styles.question}>When do you usually play?</Text>
          <View style={{ gap: 8, marginTop: 12 }}>
            {TIME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionBtn,
                  timeSlot === opt.value && styles.optionBtnSelected,
                ]}
                onPress={() => {
                  setTimeSlot(opt.value)
                  setTimeout(nextStep, 200)
                }}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{opt.label}</Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Step 2 — Availability (multi-select) */}
      {step === 2 && (
        <View style={styles.stepBody}>
          <Text style={styles.question}>
            What time are you available to play?
          </Text>
          <Text style={styles.questionSub}>Select all that apply</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {AVAIL_OPTIONS.map((opt) => {
              const selected = availability.includes(opt.value)
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.chipBtn,
                    selected && styles.chipBtnSelected,
                  ]}
                  onPress={() => toggleAvailability(opt.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      selected && styles.chipLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {selected && (
                    <Check size={16} color={T.amber} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity
            style={[styles.nextBtn, { marginTop: 20 }]}
            onPress={nextStep}
            activeOpacity={0.8}
          >
            <Text style={styles.nextLabel}>
              {availability.length > 0 ? 'Next' : 'Skip for now'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 3 — Find your Reclub name */}
      {step === 3 && (
        <View style={[styles.stepBody, { flex: 1 }]}>
          <Text style={styles.question}>
            Let's find your name on Reclub so we can find your friends
          </Text>
          <Text style={styles.questionSub}>Search by your Reclub name</Text>
          <View style={styles.searchBox}>
            <Search size={16} color="#666" strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search your name..."
              placeholderTextColor="#555"
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={T.amber} />}
          </View>

          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.userId}
            renderItem={renderPlayerResult}
            style={{ flex: 1, marginTop: 8 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              searchQuery.length >= 2 && !searching ? (
                <Text style={styles.emptyText}>No players found</Text>
              ) : null
            }
          />

          <TouchableOpacity
            style={[styles.nextBtn, { marginTop: 12 }]}
            onPress={handleFinish}
            activeOpacity={0.8}
          >
            <Text style={styles.nextLabel}>
              {selectedPlayer ? 'Continue' : 'Skip'}
            </Text>
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
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  chipBtnSelected: {
    borderColor: T.amber,
    backgroundColor: 'rgba(245,166,35,0.08)',
  },
  chipLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  chipLabelSelected: {
    color: T.amber,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.input,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1e1e1e',
  },
  resultRowSelected: {
    backgroundColor: 'rgba(245,166,35,0.06)',
    borderRadius: 10,
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  resultAvatarFallback: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  resultDupr: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
})
