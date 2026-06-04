import React, { useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useTheme } from '../useTheme'

/** Applies status bar + root background from the active theme. */
export function ThemedAppChrome({
  children,
  style,
}: {
  children: React.ReactNode
  style?: object
}) {
  const theme = useTheme()
  const rootStyle = useMemo(
    () => [{ flex: 1, backgroundColor: theme.bg }, style],
    [theme.bg, style],
  )
  return (
    <View style={rootStyle}>
      <StatusBar style={theme.statusBarStyle} />
      {children}
    </View>
  )
}

export function useThemedOverlayStyles() {
  const theme = useTheme()
  return useMemo(
    () =>
      StyleSheet.create({
        gearOverlay: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 9000,
          elevation: 9000,
          justifyContent: 'flex-end',
        },
        gearBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: theme.sheetBackdrop,
        },
        gearSheet: {
          height: '92%',
          backgroundColor: theme.bg,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: 'hidden',
        },
      }),
    [theme],
  )
}
