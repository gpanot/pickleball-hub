import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type SessionSort = 'match' | 'friends'

const STORAGE_KEY = 'ui-session-sort'

type Stored = {
  swipeSort: SessionSort
  shortlistSort: SessionSort
  notificationsEnabled: boolean
}

interface UiState extends Stored {
  hydrated: boolean
  hydrate: () => Promise<void>
  setSwipeSort: (sort: SessionSort) => void
  setShortlistSort: (sort: SessionSort) => void
  setNotificationsEnabled: (enabled: boolean) => void
}

async function persist(prefs: Stored) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export const useUiStore = create<UiState>((set, get) => ({
  swipeSort: 'match',
  shortlistSort: 'match',
  notificationsEnabled: true,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw) as Partial<Stored>
        set({
          swipeSort: data.swipeSort === 'friends' ? 'friends' : 'match',
          shortlistSort: data.shortlistSort === 'friends' ? 'friends' : 'match',
          notificationsEnabled: data.notificationsEnabled !== false,
          hydrated: true,
        })
        return
      }
    } catch {
      // ignore
    }
    set({ hydrated: true })
  },

  setSwipeSort: (swipeSort) => {
    set({ swipeSort })
    const { shortlistSort, notificationsEnabled } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled })
  },

  setShortlistSort: (shortlistSort) => {
    set({ shortlistSort })
    const { swipeSort, notificationsEnabled } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled })
  },

  setNotificationsEnabled: (notificationsEnabled) => {
    set({ notificationsEnabled })
    const { swipeSort, shortlistSort } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled })
  },
}))
