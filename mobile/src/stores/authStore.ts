import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { fetchWithTimeout } from '../lib/fetchWithTimeout'
import { debugLog, debugWarn, debugError } from '../lib/debug'

const PROD_API_URL = 'https://pickleball-hub-mobile-i9ag-production.up.railway.app'

export function resolveApiBase(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  const configUrl = Constants.expoConfig?.extra?.apiUrl

  if (envUrl) {
    debugLog('resolveApiBase', `Using EXPO_PUBLIC_API_URL: ${envUrl}`)
    return envUrl
  }
  if (configUrl) {
    debugLog('resolveApiBase', `Using expoConfig.extra.apiUrl: ${configUrl}`)
    return configUrl
  }

  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0]
    const url = `http://${ip}:3000`
    debugLog('resolveApiBase', `Using debuggerHost: ${url}`)
    return url
  }

  const fallback = __DEV__ ? 'http://localhost:3000' : PROD_API_URL
  debugLog('resolveApiBase', `Fallback (__DEV__=${__DEV__}): ${fallback}`)
  return fallback
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
  gender: string | null
  hasCompletedOnboarding: boolean

  isSignedIn: () => boolean
  setDuprRating: (rating: number | null) => void
  setGender: (gender: string | null) => void
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
      gender: null,
      hasCompletedOnboarding: false,

      setDuprRating: (duprRating) => set({ duprRating }),

      setGender: (gender) => set({ gender }),

      isSignedIn: () => get().jwt !== null,

      ensureServerAuth: async () => {
        const { jwt } = get()
        if (jwt && jwt !== 'dev-token') return true
        const url = `${resolveApiBase()}/api/auth/mobile-token?dev=1`
        debugLog('auth', `ensureServerAuth → ${url}`)
        try {
          const res = await fetchWithTimeout(url, undefined, 10000)
          debugLog('auth', `ensureServerAuth status=${res.status}`)
          if (!res.ok) return false
          const data = await res.json()
          set({
            jwt: data.jwt,
            userId: data.userId,
            profileId: data.profileId,
            displayName: data.displayName,
            imageUrl: data.imageUrl,
            reclubUserId: data.reclubUserId,
            duprRating: data.duprRating ?? null,
            gender: data.gender ?? null,
            hasCompletedOnboarding: data.hasCompletedOnboarding ?? false,
          })
          debugLog('auth', `ensureServerAuth OK, profileId=${data.profileId}`)
          return true
        } catch (e) {
          debugError('auth', 'ensureServerAuth FAILED', e)
          return false
        }
      },

      signIn: async (idToken: string) => {
        const url = `${resolveApiBase()}/api/auth/mobile-token`
        debugLog('auth', `signIn POST → ${url}`)
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          })
          debugLog('auth', `signIn response status=${res.status}`)
          if (!res.ok) {
            const body = await res.text().catch(() => '<unreadable>')
            debugWarn('auth', `signIn failed: ${res.status}`, body)
            return false
          }

          const data = await res.json()
          debugLog('auth', `signIn OK, userId=${data.userId}, duprRating=${data.duprRating}, reclubUserId=${data.reclubUserId}`)
          set({
            jwt: data.jwt,
            userId: data.userId,
            profileId: data.profileId,
            displayName: data.displayName,
            imageUrl: data.imageUrl,
            // Server is authoritative — use its values directly
            reclubUserId: data.reclubUserId,
            duprRating: data.duprRating ?? null,
            gender: data.gender ?? null,
            hasCompletedOnboarding: data.hasCompletedOnboarding ?? false,
          })
          return true
        } catch (e) {
          debugError('auth', 'signIn network error', e)
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
          gender: null,
        })
      },

      deleteAccount: async () => {
        const { jwt } = get()
        if (jwt) {
          const res = await fetch(`${resolveApiBase()}/api/profile/delete`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${jwt}` },
          })
          if (!res.ok) {
            throw new Error(`Delete failed: ${res.status}`)
          }
        }
        get().signOut()
      },

      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),

      setReclubUserId: (id: string) => set({ reclubUserId: id }),

      authedFetch: async (path: string, init?: RequestInit) => {
        const { jwt } = get()
        const url = `${resolveApiBase()}${path}`
        debugLog('fetch', `${init?.method ?? 'GET'} ${url} jwt=${jwt ? (jwt === 'dev-token' ? 'dev-token' : 'real') : 'none'}`)
        try {
          const res = await fetch(url, {
            ...init,
            headers: {
              ...init?.headers,
              'Content-Type': 'application/json',
              ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
          })
          debugLog('fetch', `${init?.method ?? 'GET'} ${path} → ${res.status}`)
          return res
        } catch (e) {
          debugError('fetch', `${init?.method ?? 'GET'} ${path} NETWORK ERROR`, e)
          throw e
        }
      },
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => secureStorage),
    }
  )
)
