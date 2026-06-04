import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ThemeMode } from '../theme'

export type SessionSort = 'match' | 'friends'
export type SwipeDateFilter = 'today' | 'tomorrow'
/** Individual time-of-day slot key — used in multi-select array */
export type TimeSlotKey = 'morning' | 'afternoon' | 'evening'
export type SwipeMaxCards = 5 | 10 | 20

const ALL_SLOTS: TimeSlotKey[] = ['morning', 'afternoon', 'evening']

/** Default Discover filter values (also used by Reset in SwipeScreen). */
export const SWIPE_FILTER_DEFAULTS = {
  duprMin: 2.9,
  timeSlots: [...ALL_SLOTS] as TimeSlotKey[],
  maxCards: 20 as SwipeMaxCards,
  rangeKm: 5,
} as const

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
  themeMode: ThemeMode
  swipeDateFilter: SwipeDateFilter
  swipeDuprMin: number
  swipeTimeSlots: TimeSlotKey[]
  swipeMaxCards: SwipeMaxCards
  swipeRangeKm: number | null
}

interface UiState extends Stored {
  hydrated: boolean
  hydrate: () => Promise<void>
  setSwipeSort: (sort: SessionSort) => void
  setShortlistSort: (sort: SessionSort) => void
  setNotificationsEnabled: (enabled: boolean) => void
  setThemeMode: (mode: ThemeMode) => void
  setSwipeDateFilter: (filter: SwipeDateFilter) => void
  setSwipeDuprMin: (v: number) => void
  setSwipeTimeSlots: (slots: TimeSlotKey[]) => void
  setSwipeMaxCards: (v: SwipeMaxCards) => void
  setSwipeRangeKm: (v: number | null) => void
  pendingNewFollower: PendingNewFollower | null
  setPendingNewFollower: (follower: PendingNewFollower | null) => void
  pendingKudosTarget: string | null
  setPendingKudosTarget: (userId: string | null) => void
  backgroundRefreshTrigger: number
  triggerBackgroundRefresh: () => void
}

function snapshot(s: UiState): Stored {
  return {
    swipeSort: s.swipeSort,
    shortlistSort: s.shortlistSort,
    notificationsEnabled: s.notificationsEnabled,
    themeMode: s.themeMode,
    swipeDateFilter: s.swipeDateFilter,
    swipeDuprMin: s.swipeDuprMin,
    swipeTimeSlots: s.swipeTimeSlots,
    swipeMaxCards: s.swipeMaxCards,
    swipeRangeKm: s.swipeRangeKm,
  }
}

async function persist(s: UiState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(s)))
}

const VALID_THEME_MODES = new Set<ThemeMode>(['light', 'dark'])

export const useUiStore = create<UiState>((set, get) => ({
  swipeSort: 'match',
  shortlistSort: 'match',
  notificationsEnabled: true,
  themeMode: 'dark',
  swipeDateFilter: 'today',
  swipeDuprMin: SWIPE_FILTER_DEFAULTS.duprMin,
  swipeTimeSlots: [...SWIPE_FILTER_DEFAULTS.timeSlots],
  swipeMaxCards: SWIPE_FILTER_DEFAULTS.maxCards,
  swipeRangeKm: SWIPE_FILTER_DEFAULTS.rangeKm,
  hydrated: false,
  pendingNewFollower: null,
  setPendingNewFollower: (follower) => set({ pendingNewFollower: follower }),
  pendingKudosTarget: null,
  setPendingKudosTarget: (userId) => set({ pendingKudosTarget: userId }),
  backgroundRefreshTrigger: 0,
  triggerBackgroundRefresh: () => set((s) => ({ backgroundRefreshTrigger: s.backgroundRefreshTrigger + 1 })),

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw) as Partial<Stored>
        const validMaxCards: SwipeMaxCards[] = [5, 10, 20]
        const validSlotKeys = new Set<string>(['morning', 'afternoon', 'evening'])
        const savedSlots = Array.isArray(data.swipeTimeSlots)
          ? (data.swipeTimeSlots as string[]).filter((s) => validSlotKeys.has(s)) as TimeSlotKey[]
          : [...ALL_SLOTS]
        const themeMode =
          data.themeMode && VALID_THEME_MODES.has(data.themeMode) ? data.themeMode : 'dark'
        set({
          swipeSort: data.swipeSort === 'friends' ? 'friends' : 'match',
          shortlistSort: data.shortlistSort === 'friends' ? 'friends' : 'match',
          notificationsEnabled: data.notificationsEnabled !== false,
          themeMode,
          swipeDateFilter: data.swipeDateFilter === 'tomorrow' ? 'tomorrow' : 'today',
          swipeDuprMin: typeof data.swipeDuprMin === 'number' ? data.swipeDuprMin : SWIPE_FILTER_DEFAULTS.duprMin,
          swipeTimeSlots: savedSlots.length > 0 ? savedSlots : [...SWIPE_FILTER_DEFAULTS.timeSlots],
          swipeMaxCards: validMaxCards.includes(data.swipeMaxCards as SwipeMaxCards) ? (data.swipeMaxCards as SwipeMaxCards) : SWIPE_FILTER_DEFAULTS.maxCards,
          swipeRangeKm:
            data.swipeRangeKm === null
              ? null
              : typeof data.swipeRangeKm === 'number'
                ? data.swipeRangeKm
                : SWIPE_FILTER_DEFAULTS.rangeKm,
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
    void persist(get())
  },

  setShortlistSort: (shortlistSort) => {
    set({ shortlistSort })
    void persist(get())
  },

  setNotificationsEnabled: (notificationsEnabled) => {
    set({ notificationsEnabled })
    void persist(get())
  },

  setThemeMode: (themeMode) => {
    set({ themeMode })
    void persist(get())
  },

  setSwipeDateFilter: (swipeDateFilter) => {
    set({ swipeDateFilter })
    void persist(get())
  },

  setSwipeDuprMin: (swipeDuprMin) => {
    set({ swipeDuprMin })
    void persist(get())
  },

  setSwipeTimeSlots: (swipeTimeSlots) => {
    set({ swipeTimeSlots })
    void persist(get())
  },

  setSwipeMaxCards: (swipeMaxCards) => {
    set({ swipeMaxCards })
    void persist(get())
  },

  setSwipeRangeKm: (swipeRangeKm) => {
    set({ swipeRangeKm })
    void persist(get())
  },
}))
