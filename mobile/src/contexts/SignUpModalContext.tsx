import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { View, StyleSheet } from 'react-native'
import { SignUpModalOverlay } from '../components/SignUpModal'

type SignUpModalContextValue = {
  openSignUp: () => void
}

const SignUpModalContext = createContext<SignUpModalContextValue | null>(null)

export function SignUpModalProvider({
  children,
  onSignedIn,
}: {
  children: React.ReactNode
  onSignedIn: (needsOnboarding: boolean) => void
}) {
  const [visible, setVisible] = useState(false)

  const openSignUp = useCallback(() => setVisible(true), [])
  const closeSignUp = useCallback(() => setVisible(false), [])

  const value = useMemo(() => ({ openSignUp }), [openSignUp])

  const handleSignedIn = useCallback(
    (needsOnboarding: boolean) => {
      closeSignUp()
      onSignedIn(needsOnboarding)
    },
    [closeSignUp, onSignedIn],
  )

  return (
    <SignUpModalContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        <SignUpModalOverlay
          visible={visible}
          onClose={closeSignUp}
          onSignedIn={handleSignedIn}
        />
      </View>
    </SignUpModalContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})

export function useSignUpModal(): SignUpModalContextValue {
  const ctx = useContext(SignUpModalContext)
  if (!ctx) {
    throw new Error('useSignUpModal must be used within SignUpModalProvider')
  }
  return ctx
}
