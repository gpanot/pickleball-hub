/**
 * Theme tokens for SQUADD mobile.
 * Light palette source: Light Theme Color Palette for Your Circle App.md
 */

export type ThemeMode = 'light' | 'dark'

/** Canonical light palette from the Circle app design doc. */
export const circleLightPalette = {
  primaryBackground: '#FFFFFF',
  secondaryBackground: '#FAFAFA',
  tertiaryBackground: '#F6F6F6',
  accentOrange: '#F5A623',
  accentOrangeLight: '#F3AD36',
  primaryText: '#212121',
  secondaryText: '#757575',
  disabledText: '#BDBDBD',
  iconGray: '#9E9E9E',
  successGreen: '#4CAF50',
  errorRed: '#F44336',
  warningYellow: '#FFEB3B',
  borderDivider: '#E0E0E0',
  shadow: 'rgba(0,0,0,0.12)',
} as const

export type ThemeColors = {
  /** Accent Orange — CTAs, active states */
  amber: string
  /** Accent Orange Light — pressed / secondary accent */
  amberLight: string
  /** Success Green */
  green: string
  /** Error Red */
  red: string
  /** Warning Yellow */
  warning: string
  ringColors: readonly string[]
  /** Primary Background — main screens */
  bg: string
  /** Secondary Background — elevated cards, sections, alternate rows */
  surface: string
  /** Secondary Background — inputs, search fields */
  input: string
  /** Border/Divider */
  border: string
  /** Tertiary Background — subtle separators, disabled areas */
  borderSubtle: string
  /** Secondary Text */
  muted: string
  /** Primary Text */
  text: string
  textSecondary: string
  /** Disabled Text */
  textTertiary: string
  navBarBg: string
  navBarBorder: string
  /** Icon Gray — inactive icons */
  iconMuted: string
  /** Text on primary/accent buttons (amber CTAs) */
  textOnPrimary: string
  statusBarStyle: 'light' | 'dark'
  sheetBackdrop: string
  overlay: string
  /** Shadow Color (with opacity) — elevated cards */
  shadow: string
}

const p = circleLightPalette

export const lightTheme: ThemeColors = {
  amber: p.accentOrange,
  amberLight: p.accentOrangeLight,
  green: p.successGreen,
  red: p.errorRed,
  warning: p.warningYellow,
  ringColors: ['#7F77DD', '#1D9E75', '#D4537E', p.accentOrange],
  bg: p.primaryBackground,
  surface: p.secondaryBackground,
  input: p.secondaryBackground,
  border: p.borderDivider,
  borderSubtle: p.tertiaryBackground,
  muted: p.secondaryText,
  text: p.primaryText,
  textSecondary: p.secondaryText,
  textTertiary: p.disabledText,
  navBarBg: p.primaryBackground,
  navBarBorder: p.borderDivider,
  iconMuted: p.iconGray,
  textOnPrimary: '#212121',
  statusBarStyle: 'dark',
  sheetBackdrop: 'rgba(0,0,0,0.5)',
  overlay: 'rgba(0,0,0,0.45)',
  shadow: p.shadow,
}

/** Dark theme text — oklch equivalents from design tokens */
const darkText = {
  /** --foreground / --card-foreground — primary body text */
  foreground: '#FCFCFC',
  /** --muted-foreground — subdued secondary/helper text */
  mutedForeground: '#D1D1D1',
  /** --primary-foreground — text on amber/primary buttons */
  primaryForeground: '#2E2E2E',
  /** De-emphasized labels (timestamps, meta) — between muted and disabled */
  subtle: '#B3B3B3',
} as const

export const darkTheme: ThemeColors = {
  amber: '#f5a623',
  amberLight: '#f3ad36',
  green: '#22c55e',
  red: '#e24b4a',
  warning: '#ffeb3b',
  ringColors: ['#7F77DD', '#1D9E75', '#D4537E', '#f5a623'],
  bg: '#0a0a0a',
  surface: '#1a1a1a',
  input: '#111111',
  border: '#2a2a2a',
  borderSubtle: '#1e1e1e',
  muted: darkText.mutedForeground,
  text: darkText.foreground,
  textSecondary: darkText.mutedForeground,
  textTertiary: darkText.subtle,
  navBarBg: '#0a0a0a',
  navBarBorder: '#1e1e1e',
  iconMuted: darkText.mutedForeground,
  textOnPrimary: darkText.primaryForeground,
  statusBarStyle: 'light',
  sheetBackdrop: 'rgba(0,0,0,0.6)',
  overlay: 'rgba(0,0,0,0.75)',
  shadow: 'rgba(0,0,0,0.35)',
}

export function resolveTheme(mode: ThemeMode): ThemeColors {
  return mode === 'light' ? lightTheme : darkTheme
}

/** @deprecated Use useTheme() */
export const T = darkTheme
