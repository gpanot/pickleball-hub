import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthStore } from '../stores/authStore'
import { useTheme } from '../useTheme'
import type { ThemeColors } from '../theme'

type ActiveIntent = {
  timeSlot: string
  date: string
  zaloNumber: string | null
  expiresAt: string
} | null

type Props = {
  visible: boolean
  myActiveIntent: ActiveIntent
  onClose: () => void
  onSaved: (intent: NonNullable<ActiveIntent>) => void
  onDeleted: () => void
}

const TIME_SLOTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
] as const

const DATES = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
] as const

export function IntentSheet({ visible, myActiveIntent, onClose, onSaved, onDeleted }: Props) {
  const insets = useSafeAreaInsets()
  const T = useTheme()
  const s = useMemo(() => createIntentStyles(T), [T])
  const { authedFetch } = useAuthStore()

  const [timeSlot, setTimeSlot] = useState<string>(myActiveIntent?.timeSlot ?? '')
  const [date, setDate] = useState<string>(myActiveIntent?.date ?? '')
  const [zaloNumber, setZaloNumber] = useState<string>(myActiveIntent?.zaloNumber ?? '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  React.useEffect(() => {
    if (visible) {
      setTimeSlot(myActiveIntent?.timeSlot ?? '')
      setDate(myActiveIntent?.date ?? '')
      setZaloNumber(myActiveIntent?.zaloNumber ?? '')
    }
  }, [visible, myActiveIntent])

  if (!visible) return null

  const handleSave = async () => {
    if (!timeSlot || !date) {
      Alert.alert('Required', 'Please select a time and day.')
      return
    }
    setSaving(true)
    try {
      const res = await authedFetch('/api/play-intent', {
        method: 'POST',
        body: JSON.stringify({ timeSlot, date, zaloNumber: zaloNumber.trim() || null }),
      })
      if (!res.ok) {
        Alert.alert('Error', 'Could not save your availability.')
        return
      }
      const data = await res.json()
      onSaved({
        timeSlot,
        date,
        zaloNumber: zaloNumber.trim() || null,
        expiresAt: data.intent?.expiresAt ?? new Date().toISOString(),
      })
    } catch {
      Alert.alert('Connection error', 'Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await authedFetch('/api/play-intent', { method: 'DELETE' })
      onDeleted()
    } catch {
      Alert.alert('Connection error', 'Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <View style={s.host} pointerEvents="box-none">
      <Pressable style={s.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 44 : 0}
      >
        <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={s.handle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={s.title}>When are you looking to play?</Text>

            <Text style={s.sectionLabel}>Time of day</Text>
            <View style={s.chipRow}>
              {TIME_SLOTS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, timeSlot === key && s.chipActive]}
                  onPress={() => setTimeSlot(key)}
                >
                  <Text style={[s.chipText, timeSlot === key && s.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>Day</Text>
            <View style={s.chipRow}>
              {DATES.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, date === key && s.chipActive]}
                  onPress={() => setDate(key)}
                >
                  <Text style={[s.chipText, date === key && s.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.sectionLabel}>Zalo number</Text>
            <Text style={s.sectionSub}>Visible only to women who follow you back</Text>
            <TextInput
              style={s.input}
              value={zaloNumber}
              onChangeText={setZaloNumber}
              placeholder="Your Zalo number (optional)"
              placeholderTextColor="#555"
              keyboardType="phone-pad"
            />

            <TouchableOpacity
              style={[s.saveBtn, (!timeSlot || !date || saving) && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!timeSlot || !date || saving}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={s.saveBtnText}>Post my availability</Text>
              )}
            </TouchableOpacity>

            {myActiveIntent && (
              <TouchableOpacity
                style={[s.deleteBtn, deleting && { opacity: 0.5 }]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#ef4444" />
                ) : (
                  <Text style={s.deleteBtnText}>Remove my availability</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

function createIntentStyles(T: ThemeColors) {
  return StyleSheet.create({
    host: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      zIndex: 9000,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: T.sheetBackdrop,
    },
    sheet: {
      backgroundColor: T.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: T.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: T.text,
      marginBottom: 20,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      marginTop: 16,
    },
    sectionSub: {
      fontSize: 11,
      color: T.textTertiary,
      marginTop: -6,
      marginBottom: 8,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: T.border,
      backgroundColor: T.input,
    },
    chipActive: {
      borderColor: T.green,
      backgroundColor: T.green + '1F',
    },
    chipText: {
      fontSize: 13,
      color: T.textSecondary,
      fontWeight: '500',
    },
    chipTextActive: {
      color: T.green,
      fontWeight: '600',
    },
    input: {
      backgroundColor: T.input,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 14,
      color: T.text,
      borderWidth: 1,
      borderColor: T.border,
    },
    saveBtn: {
      marginTop: 24,
      backgroundColor: T.green,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
    },
    deleteBtn: {
      marginTop: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    deleteBtnText: {
      fontSize: 14,
      color: T.red,
      fontWeight: '500',
    },
  })
}
