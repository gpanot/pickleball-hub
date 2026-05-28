import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GearProfile } from '../components/gear/gearTypes'
import { GEAR_CACHE_KEY } from '../components/gear/gearConstants'

const EMPTY_GEAR: GearProfile = { gender: null, cap: null, shirt: null, paddle: null, shoes: null }

type AuthedFetch = (path: string, options?: RequestInit) => Promise<Response>

export function useGearProfile(profileId: string | null, authedFetch: AuthedFetch) {
  const [gear, setGear]               = useState<GearProfile>(EMPTY_GEAR)
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [savedConfirmation, setSavedConfirmation] = useState(false)
  const [gearSetupComplete, setGearSetupComplete] = useState(false)

  const cacheKey = profileId ? `${GEAR_CACHE_KEY}_${profileId}` : null

  useEffect(() => {
    if (!profileId || !cacheKey) {
      setLoading(false)
      return
    }
    let cancelled = false

    ;(async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey)
        if (cached && !cancelled) {
          const parsed: GearProfile = JSON.parse(cached)
          setGear(parsed)
          if (parsed.setupComplete) setGearSetupComplete(true)
          setLoading(false)
        }
        const res = await authedFetch(`/api/players/${profileId}/gear`)
        if (!res.ok) throw new Error('fetch failed')
        const data: GearProfile = await res.json()
        if (!cancelled) {
          setGear(data)
          await AsyncStorage.setItem(cacheKey, JSON.stringify(data))
          if (data.setupComplete) {
            setGearSetupComplete(true)
            // Sync device flag so GearTeaserCard hides even before next server fetch
            await AsyncStorage.setItem('hasSeenGearPrompt', 'done')
          }
        }
      } catch {
        // silently fall back to cache
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [profileId, cacheKey])

  const saveGear = useCallback(
    async (updated: GearProfile): Promise<boolean> => {
      if (!profileId || !cacheKey) return false
      setSaving(true)
      setError(null)
      try {
        await AsyncStorage.setItem(cacheKey, JSON.stringify(updated))
        setGear(updated)
        const res = await authedFetch(`/api/players/${profileId}/gear`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated),
        })
        if (!res.ok) throw new Error('save failed')
        const saved: GearProfile = await res.json()
        if (saved.setupComplete) {
          setGearSetupComplete(true)
          await AsyncStorage.setItem('hasSeenGearPrompt', 'done')
        }
        // Update cache with server response (includes setupComplete)
        await AsyncStorage.setItem(cacheKey, JSON.stringify(saved))
        setGear(saved)
        setSavedConfirmation(true)
        setTimeout(() => setSavedConfirmation(false), 2000)
        return true
      } catch {
        setError('Failed to save. Changes saved locally.')
        return false
      } finally {
        setSaving(false)
      }
    },
    [profileId, cacheKey, authedFetch],
  )

  return { gear, loading, saving, error, saveGear, savedConfirmation, gearSetupComplete }
}
