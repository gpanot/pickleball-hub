import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'player-avatar-url-cache'

type AvatarCache = Record<string, string>

interface AvatarCacheState {
  cache: AvatarCache
  hydrated: boolean
  hydrate: () => Promise<void>
  remember: (userId: string, url: string) => void
  get: (userId: string) => string | undefined
}

export const useAvatarCacheStore = create<AvatarCacheState>((set, get) => ({
  cache: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        set({ cache: JSON.parse(raw) as AvatarCache, hydrated: true })
        return
      }
    } catch {
      // ignore
    }
    set({ hydrated: true })
  },

  remember: (userId, url) => {
    const prev = get().cache[userId]
    if (prev === url) return
    const cache = { ...get().cache, [userId]: url }
    set({ cache })
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  },

  get: (userId) => get().cache[userId],
}))
