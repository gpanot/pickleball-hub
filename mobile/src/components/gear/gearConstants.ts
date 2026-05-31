import { GearZoneConfig, GearZoneKey, PlayerGender } from './gearTypes'

export function playerGenderFromStored(g: string | null | undefined): PlayerGender {
  const v = (g ?? '').toLowerCase().trim()
  if (v === 'female') return 'female'
  return 'man'
}

export const GEAR_ZONES: GearZoneConfig[] = [
  { key: 'cap',    label: 'Cap',        stepLabel: '1 of 4', emoji: '🧢' },
  { key: 'shirt',  label: 'Polo shirt', stepLabel: '2 of 4', emoji: '👕' },
  { key: 'paddle', label: 'Paddle',     stepLabel: '3 of 4', emoji: '🏓' },
  { key: 'shoes',  label: 'Shoes',      stepLabel: '4 of 4', emoji: '👟' },
]

export const GEAR_BRANDS: Record<GearZoneKey, string[]> = {
  cap:    ['Nike', 'Adidas', 'New Era', 'Under Armour', 'Titleist', 'Callaway', 'Puma', 'Wilson'],
  shirt:  ['Nike', 'Adidas', 'Under Armour', 'Lululemon', 'Fila', 'Lacoste', 'Puma', 'Uniqlo'],
  paddle: ['Selkirk', 'JOOLA', 'Head', 'Franklin', 'Engage', 'Paddletek', 'Onix', 'Wilson'],
  shoes:  ['Nike', 'New Balance', 'Adidas', 'ASICS', 'K-Swiss', 'Babolat', 'Skechers', 'Prince'],
}

export const OTHER_BRAND_KEY = '__other__'
export const NO_BRAND_KEY = '__none__'
export const GEAR_CACHE_KEY  = 'squadd_gear_profile'

export const GEAR_AVATAR: Record<PlayerGender, any> = {
  man:    require('../../../assets/images/avatar_man.jpg'),
  female: require('../../../assets/images/avatar_female.jpg'),
}
