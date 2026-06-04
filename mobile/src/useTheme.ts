import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { resolveTheme, type ThemeColors } from './theme'
import { useUiStore } from './stores/uiStore'

export function useTheme(): ThemeColors {
  const themeMode = useUiStore((s) => s.themeMode)
  return useMemo(() => resolveTheme(themeMode), [themeMode])
}

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: ThemeColors) => T,
): T {
  const theme = useTheme()
  return useMemo(() => StyleSheet.create(factory(theme)), [theme])
}
