import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from './authStore'
import { debugLog, debugError } from '../lib/debug'
import type { Session } from '../data'

const SAVED_IDS_KEY = 'saved-session-ids'
const PAGE_SIZE = 10
// Trigger prefetch when this many cards remain in the current batch
const PREFETCH_THRESHOLD = 5

interface SessionState {
  sessions: Session[]
  savedIds: Set<number>
  loading: boolean
  prefetching: boolean
  hasMore: boolean
  nextOffset: number
  totalCount: number | null
  error: string | null
  lastFetchedAt: number | null
  _lastLat: number | null
  _lastLng: number | null
  _lastDate: string | undefined

  currentIdx: number
  swipeHistory: number[]

  fetchSessions: (lat?: number | null, lng?: number | null, date?: string) => Promise<void>
  fetchIfNeeded: (lat?: number | null, lng?: number | null, date?: string) => Promise<void>
  prefetchNextBatch: (date?: string) => Promise<void>
  saveSession: (id: number) => void
  unsaveSession: (id: number) => void
  getSavedSessions: () => Session[]
  loadSavedIds: () => Promise<void>

  advanceSave: () => void
  advanceSkip: () => void
  undo: () => void
  resetDeck: () => void
}


export const useSessionStore = create<SessionState>()((set, get) => ({
  sessions: [],
  savedIds: new Set(),
  loading: false,
  prefetching: false,
  hasMore: false,
  nextOffset: 0,
  totalCount: null,
  error: null,
  lastFetchedAt: null,
  _lastLat: null,
  _lastLng: null,
  _lastDate: undefined,

  currentIdx: 0,
  swipeHistory: [],

  fetchSessions: async (lat, lng, date) => {
    set({ loading: true, error: null })
    try {
      const { authedFetch } = useAuthStore.getState()
      const params = new URLSearchParams()
      if (lat != null && lng != null) {
        params.set('lat', lat.toString())
        params.set('lng', lng.toString())
      }
      if (date) params.set('date', date)
      params.set('limit', PAGE_SIZE.toString())
      params.set('offset', '0')
      const path = `/api/sessions/swipe-deck?${params.toString()}`
      debugLog('sessions', `fetchSessions → ${path}`)
      const res = await authedFetch(path)
      if (!res.ok) {
        const body = await res.text().catch(() => '<unreadable>')
        debugError('sessions', `API error ${res.status}`, body)
        throw new Error(`API ${res.status}`)
      }
      const data = await res.json()
      const all: Session[] = data.sessions ?? []
      debugLog('sessions', `API returned ${all.length} sessions (hasMore=${data.hasMore})`)
      const sessions = all.filter((s) => s.spotsLeft > 0)
      debugLog('sessions', `After spots filter: ${sessions.length} sessions`)

      const sessionIdSet = new Set(sessions.map((s) => s.id))
      const { savedIds: prevSaved } = get()
      const pruned = new Set([...prevSaved].filter((id) => sessionIdSet.has(id)))
      if (pruned.size !== prevSaved.size) {
        AsyncStorage.setItem(SAVED_IDS_KEY, JSON.stringify([...pruned]))
      }

      set({
        sessions,
        savedIds: pruned,
        loading: false,
        lastFetchedAt: Date.now(),
        currentIdx: 0,
        swipeHistory: [],
        hasMore: data.hasMore ?? false,
        nextOffset: PAGE_SIZE,
        totalCount: data.total ?? null,
        _lastLat: lat ?? null,
        _lastLng: lng ?? null,
        _lastDate: date,
      })
    } catch (err) {
      debugError('sessions', 'fetchSessions FAILED', err)
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load sessions',
      })
    }
  },

  fetchIfNeeded: async (lat, lng, date) => {
    const { lastFetchedAt, loading } = get()
    if (loading) return
    if (lastFetchedAt !== null) return
    await get().fetchSessions(lat, lng, date)
  },

  prefetchNextBatch: async (date) => {
    const { hasMore, prefetching, loading, nextOffset, _lastLat, _lastLng, _lastDate } = get()
    if (!hasMore || prefetching || loading) return
    set({ prefetching: true })
    try {
      const { authedFetch } = useAuthStore.getState()
      const params = new URLSearchParams()
      if (_lastLat != null && _lastLng != null) {
        params.set('lat', _lastLat.toString())
        params.set('lng', _lastLng.toString())
      }
      const resolvedDate = date ?? _lastDate
      if (resolvedDate) params.set('date', resolvedDate)
      params.set('limit', PAGE_SIZE.toString())
      params.set('offset', nextOffset.toString())
      const path = `/api/sessions/swipe-deck?${params.toString()}`
      debugLog('sessions', `prefetchNextBatch → ${path}`)
      const res = await authedFetch(path)
      if (!res.ok) {
        debugError('sessions', `prefetch API error ${res.status}`)
        return
      }
      const data = await res.json()
      const incoming: Session[] = data.sessions ?? []
      const filtered = incoming.filter((s) => s.spotsLeft > 0)
      debugLog('sessions', `Prefetched ${filtered.length} more sessions`)

      set((state) => ({
        sessions: [...state.sessions, ...filtered],
        hasMore: data.hasMore ?? false,
        nextOffset: nextOffset + PAGE_SIZE,
        totalCount: data.total ?? state.totalCount,
        prefetching: false,
      }))
    } catch (err) {
      debugError('sessions', 'prefetchNextBatch FAILED', err)
      set({ prefetching: false })
    }
  },

  loadSavedIds: async () => {
    try {
      const raw = await AsyncStorage.getItem(SAVED_IDS_KEY)
      if (raw) {
        const ids: number[] = JSON.parse(raw)
        set({ savedIds: new Set(ids) })
      }
    } catch {
      // ignore
    }
  },

  saveSession: (id) => {
    set((state) => {
      const next = new Set(state.savedIds)
      next.add(id)
      AsyncStorage.setItem(SAVED_IDS_KEY, JSON.stringify([...next]))
      return { savedIds: next }
    })
  },

  unsaveSession: (id) => {
    set((state) => {
      const next = new Set(state.savedIds)
      next.delete(id)
      AsyncStorage.setItem(SAVED_IDS_KEY, JSON.stringify([...next]))
      return { savedIds: next }
    })
  },

  getSavedSessions: () => {
    const { sessions, savedIds } = get()
    return sessions.filter((s) => savedIds.has(s.id))
  },

  advanceSave: () => {
    const { currentIdx, sessions } = get()
    const current = sessions[currentIdx]
    if (current) get().saveSession(current.id)
    set((state) => ({
      swipeHistory: [...state.swipeHistory, state.currentIdx],
      currentIdx: state.currentIdx + 1,
    }))
    // Prefetch next batch when PREFETCH_THRESHOLD cards remain
    const { currentIdx: nextIdx, sessions: s } = get()
    if (s.length - nextIdx <= PREFETCH_THRESHOLD) {
      get().prefetchNextBatch()
    }
  },

  advanceSkip: () => {
    set((state) => ({
      swipeHistory: [...state.swipeHistory, state.currentIdx],
      currentIdx: state.currentIdx + 1,
    }))
    // Prefetch next batch when PREFETCH_THRESHOLD cards remain
    const { currentIdx: nextIdx, sessions: s } = get()
    if (s.length - nextIdx <= PREFETCH_THRESHOLD) {
      get().prefetchNextBatch()
    }
  },

  undo: () => {
    const { swipeHistory, sessions, savedIds } = get()
    if (!swipeHistory.length) return
    const prevIdx = swipeHistory[swipeHistory.length - 1]
    const prevSession = sessions[prevIdx]
    if (prevSession && savedIds.has(prevSession.id)) {
      get().unsaveSession(prevSession.id)
    }
    set((state) => ({
      currentIdx: prevIdx,
      swipeHistory: state.swipeHistory.slice(0, -1),
    }))
  },

  resetDeck: () => {
    set({ currentIdx: 0, swipeHistory: [] })
  },
}))
