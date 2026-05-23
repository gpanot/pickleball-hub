import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'

export function resolveApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  // Resolve on each request — hostUri is often unset at module load on device.
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0]
    return `http://${ip}:3000`
  }
  return 'http://localhost:3000'
}

const secureStorage: StateStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => {
    SecureStore.setItemAsync(key, value)
  },
  removeItem: (key) => {
    SecureStore.deleteItemAsync(key)
  },
}

export interface AuthState {
  jwt: string | null
  userId: string | null
  profileId: string | null
  reclubUserId: string | null
  displayName: string | null
  imageUrl: string | null
  duprRating: number | null
  hasCompletedOnboarding: boolean

  isSignedIn: () => boolean
  setDuprRating: (rating: number | null) => void
  signIn: (idToken: string) => Promise<boolean>
  signOut: () => void
  deleteAccount: () => Promise<void>
  setOnboardingComplete: () => void
  setReclubUserId: (id: string) => void
  /** Replace offline dev-token with a real JWT when the server is reachable. */
  ensureServerAuth: () => Promise<boolean>
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      jwt: null,
      userId: null,
      profileId: null,
      reclubUserId: null,
      displayName: null,
      imageUrl: null,
      duprRating: null,
      hasCompletedOnboarding: false,

      setDuprRating: (duprRating) => set({ duprRating }),

      isSignedIn: () => get().jwt !== null,

      ensureServerAuth: async () => {
        const { jwt } = get()
        if (jwt && jwt !== 'dev-token') return true
        try {
          const res = await fetchWithTimeout(
            `${resolveApiBase()}/api/auth/mobile-token?dev=1`,
            undefined,
            10000
          )
          if (!res.ok) return false
          const data = await res.json()
          set({
            jwt: data.jwt,
            userId: data.userId,
            profileId: data.profileId,
            displayName: data.displayName,
            imageUrl: data.imageUrl,
            reclubUserId: data.reclubUserId ?? get().reclubUserId,
            hasCompletedOnboarding:
              data.hasCompletedOnboarding ?? get().hasCompletedOnboarding,
          })
          if (__DEV__) {
            console.log('[auth] ensureServerAuth: got real JWT', data.profileId)
          }
          return true
        } catch (e) {
          if (__DEV__) {
            console.warn('[auth] ensureServerAuth failed', e)
          }
          return false
        }
      },

      signIn: async (idToken: string) => {
        try {
          const res = await fetch(`${resolveApiBase()}/api/auth/mobile-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          })
          if (!res.ok) return false

          const data = await res.json()
          set({
            jwt: data.jwt,
            userId: data.userId,
            profileId: data.profileId,
            displayName: data.displayName,
            imageUrl: data.imageUrl,
            reclubUserId: data.reclubUserId,
            hasCompletedOnboarding: data.hasCompletedOnboarding,
          })
          return true
        } catch {
          return false
        }
      },

      signOut: () => {
        set({
          jwt: null,
          userId: null,
          profileId: null,
          reclubUserId: null,
          displayName: null,
          imageUrl: null,
          duprRating: null,
          hasCompletedOnboarding: false,
        })
      },

      deleteAccount: async () => {
        const { jwt } = get()
        if (jwt) {
          try {
            await fetch(`${resolveApiBase()}/api/profile/delete`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${jwt}` },
            })
          } catch {
            // best-effort
          }
        }
        get().signOut()
      },

      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),

      setReclubUserId: (id: string) => set({ reclubUserId: id }),

      authedFetch: async (path: string, init?: RequestInit) => {
        const { jwt } = get()
        const url = `${resolveApiBase()}${path}`
        if (__DEV__) {
          console.log('[authedFetch]', init?.method ?? 'GET', url, {
            hasJwt: !!jwt,
            devToken: jwt === 'dev-token',
          })
        }
        return fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            'Content-Type': 'application/json',
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        })
      },
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => secureStorage),
    }
  )
)
