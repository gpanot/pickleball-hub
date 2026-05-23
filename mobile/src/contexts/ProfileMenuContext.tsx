import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { ProfileSheet } from '../components/ProfileSheet'

type ProfileMenuContextValue = {
  openProfileSheet: () => void
}

const ProfileMenuContext = createContext<ProfileMenuContextValue | null>(null)

export function ProfileMenuProvider({
  children,
  onLinkReclub,
  onRedoOnboarding,
}: {
  children: React.ReactNode
  onLinkReclub?: () => void
  onRedoOnboarding?: () => void
}) {
  const [visible, setVisible] = useState(false)

  const openProfileSheet = useCallback(() => setVisible(true), [])
  const closeProfileSheet = useCallback(() => setVisible(false), [])

  const value = useMemo(() => ({ openProfileSheet }), [openProfileSheet])

  return (
    <ProfileMenuContext.Provider value={value}>
      {children}
      <ProfileSheet
        visible={visible}
        onClose={closeProfileSheet}
        onLinkReclub={onLinkReclub}
        onRedoOnboarding={onRedoOnboarding}
      />
    </ProfileMenuContext.Provider>
  )
}

export function useProfileMenu(): ProfileMenuContextValue {
  const ctx = useContext(ProfileMenuContext)
  if (!ctx) {
    throw new Error('useProfileMenu must be used within ProfileMenuProvider')
  }
  return ctx
}
