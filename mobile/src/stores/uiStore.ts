import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type SessionSort = 'match' | 'friends'
export type SwipeDateFilter = 'today' | 'tomorrow'

export type PendingNewFollower = {
  userId: string
  displayName: string
  imageUrl: string | null
}

const STORAGE_KEY = 'ui-session-sort'

type Stored = {
  swipeSort: SessionSort
  shortlistSort: SessionSort
  notificationsEnabled: boolean
  swipeDateFilter: SwipeDateFilter
}

interface UiState extends Stored {
  hydrated: boolean
  hydrate: () => Promise<void>
  setSwipeSort: (sort: SessionSort) => void
  setShortlistSort: (sort: SessionSort) => void
  setNotificationsEnabled: (enabled: boolean) => void
  setSwipeDateFilter: (filter: SwipeDateFilter) => void
  pendingNewFollower: PendingNewFollower | null
  setPendingNewFollower: (follower: PendingNewFollower | null) => void
}

async function persist(prefs: Stored) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export const useUiStore = create<UiState>((set, get) => ({
  swipeSort: 'match',
  shortlistSort: 'match',
  notificationsEnabled: true,
  swipeDateFilter: 'today',
  hydrated: false,
  pendingNewFollower: null,
  setPendingNewFollower: (follower) => set({ pendingNewFollower: follower }),

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw) as Partial<Stored>
        set({
          swipeSort: data.swipeSort === 'friends' ? 'friends' : 'match',
          shortlistSort: data.shortlistSort === 'friends' ? 'friends' : 'match',
          notificationsEnabled: data.notificationsEnabled !== false,
          swipeDateFilter: data.swipeDateFilter === 'tomorrow' ? 'tomorrow' : 'today',
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
    const { shortlistSort, notificationsEnabled, swipeDateFilter } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled, swipeDateFilter })
  },

  setShortlistSort: (shortlistSort) => {
    set({ shortlistSort })
    const { swipeSort, notificationsEnabled, swipeDateFilter } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled, swipeDateFilter })
  },

  setNotificationsEnabled: (notificationsEnabled) => {
    set({ notificationsEnabled })
    const { swipeSort, shortlistSort, swipeDateFilter } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled, swipeDateFilter })
  },

  setSwipeDateFilter: (swipeDateFilter) => {
    set({ swipeDateFilter })
    const { swipeSort, shortlistSort, notificationsEnabled } = get()
    void persist({ swipeSort, shortlistSort, notificationsEnabled, swipeDateFilter })
  },
}))
