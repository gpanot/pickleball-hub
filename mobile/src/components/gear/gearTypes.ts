export type GearZoneKey = 'cap' | 'shirt' | 'paddle' | 'shoes'

export type GearProfile = {
  cap: string | null
  shirt: string | null
  paddle: string | null
  shoes: string | null
}

export type GearZoneConfig = {
  key: GearZoneKey
  label: string
  stepLabel: string
  emoji: string
}

export type PlayerGender = 'man' | 'female'
