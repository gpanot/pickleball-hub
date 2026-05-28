export type GearZoneKey = 'cap' | 'shirt' | 'paddle' | 'shoes'

export type GearProfile = {
  gender: string | null
  cap: string | null
  shirt: string | null
  paddle: string | null
  shoes: string | null
  /** True when all 4 zones were saved — persisted in DB so it survives reinstall. */
  setupComplete?: boolean
}

export type GearZoneConfig = {
  key: GearZoneKey
  label: string
  stepLabel: string
  emoji: string
}

export type PlayerGender = 'man' | 'female'
