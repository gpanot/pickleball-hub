import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'

function resolveApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL
  // In dev on a physical device, localhost won't work.
  // Grab the host IP from the Expo manifest so the device can reach the machine.
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost
  if (debuggerHost) {
    const ip = debuggerHost.split(':')[0]
    return `http://${ip}:3000`
  }
  return 'http://localhost:3000'
}

const API_BASE = resolveApiBase()

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
  hasCompletedOnboarding: boolean

  isSignedIn: () => boolean
  signIn: (idToken: string) => Promise<boolean>
  signOut: () => void
  deleteAccount: () => Promise<void>
  setOnboardingComplete: () => void
  setReclubUserId: (id: string) => void
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
      hasCompletedOnboarding: false,

      isSignedIn: () => get().jwt !== null,

      signIn: async (idToken: string) => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/mobile-token`, {
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
          hasCompletedOnboarding: false,
        })
      },

      deleteAccount: async () => {
        const { jwt } = get()
        if (jwt) {
          try {
            await fetch(`${API_BASE}/api/profile/delete`, {
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
        return fetch(`${API_BASE}${path}`, {
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
