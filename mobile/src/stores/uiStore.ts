import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type SessionSort = 'match' | 'friends'
export type SwipeDateFilter = 'today' | 'tomorrow'
/** Individual time-of-day slot key — used in multi-select array */
export type TimeSlotKey = 'morning' | 'afternoon' | 'evening'
export type SwipeMaxCards = 5 | 10 | 20

const ALL_SLOTS: TimeSlotKey[] = ['morning', 'afternoon', 'evening']

/** Default Discover filter values (also used by Reset in SwipeScreen). */
export const SWIPE_FILTER_DEFAULTS = {
  duprMin: 3.0,
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
  setSwipeDateFilter: (filter: SwipeDateFilter) => void
  setSwipeDuprMin: (v: number) => void
  setSwipeTimeSlots: (slots: TimeSlotKey[]) => void
  setSwipeMaxCards: (v: SwipeMaxCards) => void
  setSwipeRangeKm: (v: number | null) => void
  pendingNewFollower: PendingNewFollower | null
  setPendingNewFollower: (follower: PendingNewFollower | null) => void
  // PN6: userId of a player who just finished — Circle scrolls to them for kudos
  pendingKudosTarget: string | null
  setPendingKudosTarget: (userId: string | null) => void
}

async function persist(prefs: Stored) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

export const useUiStore = create<UiState>((set, get) => ({
  swipeSort: 'match',
  shortlistSort: 'match',
  notificationsEnabled: true,
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
        set({
          swipeSort: data.swipeSort === 'friends' ? 'friends' : 'match',
          shortlistSort: data.shortlistSort === 'friends' ? 'friends' : 'match',
          notificationsEnabled: data.notificationsEnabled !== false,
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
    const s = get()
    void persist({ swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setShortlistSort: (shortlistSort) => {
    set({ shortlistSort })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setNotificationsEnabled: (notificationsEnabled) => {
    set({ notificationsEnabled })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setSwipeDateFilter: (swipeDateFilter) => {
    set({ swipeDateFilter })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setSwipeDuprMin: (swipeDuprMin) => {
    set({ swipeDuprMin })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setSwipeTimeSlots: (swipeTimeSlots) => {
    set({ swipeTimeSlots })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setSwipeMaxCards: (swipeMaxCards) => {
    set({ swipeMaxCards })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards, swipeRangeKm: s.swipeRangeKm })
  },

  setSwipeRangeKm: (swipeRangeKm) => {
    set({ swipeRangeKm })
    const s = get()
    void persist({ swipeSort: s.swipeSort, shortlistSort: s.shortlistSort, notificationsEnabled: s.notificationsEnabled, swipeDateFilter: s.swipeDateFilter, swipeDuprMin: s.swipeDuprMin, swipeTimeSlots: s.swipeTimeSlots, swipeMaxCards: s.swipeMaxCards, swipeRangeKm })
  },
}))
