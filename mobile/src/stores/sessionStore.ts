import { create } from 'zustand'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from './authStore'
import type { Session } from '../data'

const SAVED_IDS_KEY = 'saved-session-ids'

interface SessionState {
  sessions: Session[]
  savedIds: Set<number>
  loading: boolean
  error: string | null
  lastFetchedAt: number | null

  currentIdx: number
  swipeHistory: number[]

  fetchSessions: (lat?: number | null, lng?: number | null) => Promise<void>
  fetchIfNeeded: (lat?: number | null, lng?: number | null) => Promise<void>
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
  error: null,
  lastFetchedAt: null,

  currentIdx: 0,
  swipeHistory: [],

  fetchSessions: async (lat, lng) => {
    set({ loading: true, error: null })
    try {
      const { authedFetch } = useAuthStore.getState()
      const params = new URLSearchParams()
      if (lat != null && lng != null) {
        params.set('lat', lat.toString())
        params.set('lng', lng.toString())
      }
      const qs = params.toString()
      const path = `/api/sessions/swipe-deck${qs ? `?${qs}` : ''}`
      const res = await authedFetch(path)
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      const sessions: Session[] = data.sessions ?? []

      set({ sessions, loading: false, lastFetchedAt: Date.now(), currentIdx: 0, swipeHistory: [] })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load sessions',
      })
    }
  },

  fetchIfNeeded: async (lat, lng) => {
    const { lastFetchedAt, loading } = get()
    if (loading) return
    if (lastFetchedAt !== null) return
    await get().fetchSessions(lat, lng)
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
  },

  advanceSkip: () => {
    set((state) => ({ currentIdx: state.currentIdx + 1 }))
  },

  undo: () => {
    const { swipeHistory } = get()
    if (!swipeHistory.length) return
    const prevIdx = swipeHistory[swipeHistory.length - 1]
    set((state) => ({
      currentIdx: prevIdx,
      swipeHistory: state.swipeHistory.slice(0, -1),
    }))
  },

  resetDeck: () => {
    set({ currentIdx: 0, swipeHistory: [] })
  },
}))
