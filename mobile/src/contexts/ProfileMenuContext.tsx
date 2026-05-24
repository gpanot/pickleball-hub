import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react'

type ProfileMenuContextValue = {
  openProfileSheet: () => void
}

const ProfileMenuContext = createContext<ProfileMenuContextValue | null>(null)

export function ProfileMenuProvider({
  children,
  onOpenProfile,
}: {
  children: React.ReactNode
  onOpenProfile: () => void
}) {
  const openProfileSheet = useCallback(() => onOpenProfile(), [onOpenProfile])

  const value = useMemo(() => ({ openProfileSheet }), [openProfileSheet])

  return (
    <ProfileMenuContext.Provider value={value}>
      {children}
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
