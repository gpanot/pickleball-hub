import React from 'react'
import { View, Pressable, StyleSheet, Dimensions } from 'react-native'
import { GearSetupScreen } from './GearSetupScreen'
import { useNavBarHeight } from '../NavBar'
import { GearProfile, PlayerGender } from './gearTypes'

const { height: H } = Dimensions.get('window')

type Props = {
  visible: boolean
  onClose: () => void
  gender: PlayerGender
  initialGear: GearProfile
  saving: boolean
  error: string | null
  onSave: (gear: GearProfile) => void
  savedConfirmation?: boolean
}

export function GearSetupSheet({
  visible,
  onClose,
  gender,
  initialGear,
  saving,
  error,
  onSave,
  savedConfirmation,
}: Props) {
  const navBarHeight = useNavBarHeight()
  const availableHeight = H - navBarHeight
  const sheetHeight = availableHeight * 0.9

  if (!visible) return null

  return (
    <View style={[s.host, { bottom: navBarHeight }]} pointerEvents="box-none">
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { height: sheetHeight }]}>
        <GearSetupScreen
          gender={gender}
          initialGear={initialGear}
          saving={saving}
          error={error}
          onSave={onSave}
          onBack={onClose}
          closeIcon="close"
          embedded
          savedConfirmation={savedConfirmation}
        />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9000,
    elevation: 9000,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
})
