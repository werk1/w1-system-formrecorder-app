/**
 * App colour schemes: the token list, the built-in schemes and the CSS they
 * produce. Shared by the Payload collection (fields, validation, seeding),
 * the frontend layout (CSS output) and the dev colour editor. Pure TS, no
 * Payload or React imports.
 */

export const COLOR_SCHEME_TOKENS = [
  { key: 'primary', label: 'Primary', hint: 'Pfeile, Icons' },
  { key: 'primaryStrong', label: 'Primary kräftig', hint: 'Hover' },
  { key: 'primaryText', label: 'Text auf Primary', hint: 'Symbol in den runden Pfeilen' },
  { key: 'secondary', label: 'Secondary', hint: 'Aktiv, Fokus, aktive Seite' },
  { key: 'bg', label: 'Hintergrund', hint: 'Seitenfläche der App' },
  { key: 'toolbar', label: 'Leisten', hint: 'Kopfzeile, Rail, Statuszeile' },
  { key: 'stage', label: 'Bühne', hint: 'Fläche um die Seiten' },
  { key: 'paper', label: 'Papier', hint: 'Seiten ohne Bild' },
  { key: 'border', label: 'Rahmen', hint: 'Linien, Outlines' },
  { key: 'text', label: 'Text', hint: '' },
  { key: 'muted', label: 'Text gedämpft', hint: 'Statuszeile, Hinweise' },
  { key: 'panelGradient', label: 'Panel-Verlauf', hint: 'CSS-Gradient des Navigations-Panels' },
  { key: 'panelBorder', label: 'Panel-Rahmen', hint: '' },
  { key: 'panelShadow', label: 'Panel-Schatten', hint: 'Farbe des Schattens' },
] as const

export type ColorSchemeTokenKey = (typeof COLOR_SCHEME_TOKENS)[number]['key']
export type ColorSchemeMode = Record<ColorSchemeTokenKey, string>

export interface ColorSchemeData {
  name: string
  light: ColorSchemeMode
  dark: ColorSchemeMode
}

/** CSS custom property of a token: primaryStrong → --flipbook-app-primary-strong. */
export function tokenVar(key: ColorSchemeTokenKey): string {
  return `--flipbook-app-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

/** Per-mode tokens that do not vary between schemes. */
export const MODE_SHARED: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--flipbook-app-field-bg': 'rgba(255, 255, 255, 0.72)',
    '--flipbook-app-field-border': 'color-mix(in srgb, var(--flipbook-app-text) 16%, transparent)',
    '--flipbook-app-gutter-shade': 'rgba(0, 0, 0, 0.1)',
  },
  dark: {
    '--flipbook-app-field-bg': 'rgba(255, 255, 255, 0.08)',
    '--flipbook-app-field-border': 'rgba(255, 255, 255, 0.16)',
    '--flipbook-app-gutter-shade': 'rgba(0, 0, 0, 0.2)',
  },
}

/**
 * Accepts colour and gradient values only: no declaration breaks, blocks,
 * comments, URLs or markup, so an admin value cannot inject other CSS.
 */
export function isSafeCssValue(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v.length === 0 || v.length > 400) return false
  if (/[;{}<>\\@]|\/\*|url\s*\(|expression\s*\(/i.test(v)) return false
  return /^[#a-z0-9\s(),.%+-]+$/i.test(v)
}

function modeDeclarations(mode: Partial<ColorSchemeMode>, fallback: ColorSchemeMode): string {
  return COLOR_SCHEME_TOKENS.map(({ key }) => {
    const value = isSafeCssValue(mode[key]) ? mode[key] : fallback[key]
    return `${tokenVar(key)}: ${value};`
  }).join(' ')
}

/** CSS for one scheme: light on :root, dark under prefers-color-scheme. */
export function schemeToCss(scheme: { light: Partial<ColorSchemeMode>; dark: Partial<ColorSchemeMode> }): string {
  const base = DEFAULT_COLOR_SCHEMES.graphite
  return `:root { ${modeDeclarations(scheme.light, base.light)} }\n@media (prefers-color-scheme: dark) { :root { ${modeDeclarations(scheme.dark, base.dark)} } }`
}

/** CSS that forces one mode regardless of the system (dev preview). */
export function schemeModePreviewCss(mode: Partial<ColorSchemeMode>, which: 'light' | 'dark'): string {
  const base = DEFAULT_COLOR_SCHEMES.graphite[which]
  const shared = Object.entries(MODE_SHARED[which])
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ')
  // :root:root outranks the scheme CSS, including its dark media query.
  return `:root:root { color-scheme: ${which}; ${modeDeclarations(mode, base)} ${shared} }`
}

export const DEFAULT_COLOR_SCHEMES: Record<
  'graphite' | 'advantage' | 'sage' | 'bordeaux' | 'aubergine' | 'terracotta',
  ColorSchemeData
> = {
  graphite: {
    name: 'Graphit',
    light: {
      primary: '#3e4c59',
      primaryStrong: '#2f3b46',
      primaryText: '#f7f5f0',
      secondary: '#8e793e',
      bg: '#ecebe8',
      toolbar: '#ffffff',
      stage: '#dcdad5',
      paper: '#fbfaf7',
      border: '#cfccc5',
      text: '#1f1e1c',
      muted: '#6b675f',
      panelGradient: 'linear-gradient(22deg, #eeece7 0%, #e3dfd7 55%, #d6d0c5 100%)',
      panelBorder: 'rgba(52, 50, 46, 0.1)',
      panelShadow: 'rgba(40, 36, 30, 0.1)',
    },
    dark: {
      primary: '#d6dee6',
      primaryStrong: '#ffffff',
      primaryText: '#1b242d',
      secondary: '#cdb876',
      bg: '#161615',
      toolbar: '#1e1d1b',
      stage: '#121211',
      paper: '#d8d4cb',
      border: '#34322e',
      text: '#ecebe8',
      muted: '#a39f97',
      panelGradient: 'linear-gradient(22deg, #2c2a26 0%, #25231f 55%, #1f1d1a 100%)',
      panelBorder: 'rgba(255, 255, 255, 0.08)',
      panelShadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
  advantage: {
    name: 'Advantage-Blau gedämpft',
    light: {
      primary: '#2f5b7c',
      primaryStrong: '#244a66',
      primaryText: '#ffffff',
      secondary: '#c9a33a',
      bg: '#eceeef',
      toolbar: '#ffffff',
      stage: '#dde1e4',
      paper: '#fbfbfa',
      border: '#c9d0d5',
      text: '#1b2228',
      muted: '#5f6b75',
      panelGradient: 'linear-gradient(204deg, #eceeef 0%, #e0e4e6 56%, #d3dade 100%)',
      panelBorder: 'rgba(27, 34, 40, 0.1)',
      panelShadow: 'rgba(27, 40, 55, 0.1)',
    },
    dark: {
      primary: '#8cb4d2',
      primaryStrong: '#a6c6de',
      primaryText: '#10202c',
      secondary: '#d8b95a',
      bg: '#141719',
      toolbar: '#1b1f22',
      stage: '#101315',
      paper: '#d6d8d8',
      border: '#2e3439',
      text: '#e9eef2',
      muted: '#9aa6b0',
      panelGradient: 'linear-gradient(204deg, #252b30 0%, #20252a 56%, #1b2024 100%)',
      panelBorder: 'rgba(255, 255, 255, 0.08)',
      panelShadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
  sage: {
    name: 'Salbei / Stein',
    light: {
      primary: '#46574f',
      primaryStrong: '#36453e',
      primaryText: '#f6f7f4',
      secondary: '#9a8766',
      bg: '#eceeeb',
      toolbar: '#ffffff',
      stage: '#dde0db',
      paper: '#fbfbf8',
      border: '#ccd1ca',
      text: '#1d221f',
      muted: '#646c66',
      panelGradient: 'linear-gradient(155deg, #d0d9da 0%, #bac9ca 52%, #99afb1 100%)',
      panelBorder: 'rgba(29, 34, 31, 0.1)',
      panelShadow: 'rgba(30, 45, 40, 0.12)',
    },
    dark: {
      primary: '#b9cbbf',
      primaryStrong: '#cfddd3',
      primaryText: '#16201a',
      secondary: '#c6b28c',
      bg: '#141715',
      toolbar: '#1b1f1c',
      stage: '#101311',
      paper: '#d6d8d2',
      border: '#2f3531',
      text: '#e8ece8',
      muted: '#9ea79f',
      panelGradient: 'linear-gradient(155deg, #26302d 0%, #212a27 52%, #1b2320 100%)',
      panelBorder: 'rgba(255, 255, 255, 0.08)',
      panelShadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
  bordeaux: {
    name: 'Bordeaux / Sand',
    light: {
      primary: '#7a2e3a',
      primaryStrong: '#5f222c',
      primaryText: '#fbf6f3',
      secondary: '#b08a4a',
      bg: '#efecea',
      toolbar: '#ffffff',
      stage: '#e0dbd8',
      paper: '#fbfaf8',
      border: '#d3ccc8',
      text: '#221c1c',
      muted: '#6f6462',
      panelGradient: 'linear-gradient(22deg, #f1ebe8 0%, #e7dcd8 55%, #dbcac5 100%)',
      panelBorder: 'rgba(60, 30, 32, 0.1)',
      panelShadow: 'rgba(60, 30, 32, 0.12)',
    },
    dark: {
      primary: '#e0a3ab',
      primaryStrong: '#efc0c6',
      primaryText: '#2a1216',
      secondary: '#d1b073',
      bg: '#181515',
      toolbar: '#201c1c',
      stage: '#131111',
      paper: '#d9d4d0',
      border: '#383030',
      text: '#eeeae8',
      muted: '#a89d9b',
      panelGradient: 'linear-gradient(22deg, #302526 0%, #282021 55%, #211b1b 100%)',
      panelBorder: 'rgba(255, 255, 255, 0.08)',
      panelShadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
  aubergine: {
    name: 'Aubergine / Altrosa',
    light: {
      primary: '#56395f',
      primaryStrong: '#432b4a',
      primaryText: '#faf6fb',
      secondary: '#b0647a',
      bg: '#efede8',
      toolbar: '#ffffff',
      stage: '#e2ddd3',
      paper: '#fbfaf7',
      border: '#d5cec2',
      text: '#211d22',
      muted: '#6c655f',
      panelGradient: 'linear-gradient(204deg, #f1ece2 0%, #e7dfd0 56%, #d9cdb8 100%)',
      panelBorder: 'rgba(50, 40, 28, 0.1)',
      panelShadow: 'rgba(60, 45, 30, 0.12)',
    },
    dark: {
      primary: '#c9aed3',
      primaryStrong: '#dcc8e3',
      primaryText: '#21142a',
      secondary: '#dc9aae',
      bg: '#171614',
      toolbar: '#1f1d1a',
      stage: '#131210',
      paper: '#d9d5cd',
      border: '#37332d',
      text: '#eeebe6',
      muted: '#a69f95',
      panelGradient: 'linear-gradient(204deg, #2f2a22 0%, #27231d 56%, #201d18 100%)',
      panelBorder: 'rgba(255, 255, 255, 0.08)',
      panelShadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
  terracotta: {
    name: 'Terrakotta / Petrol',
    light: {
      primary: '#9a4f33',
      primaryStrong: '#7c3d26',
      primaryText: '#fdf7f3',
      secondary: '#2f6f73',
      bg: '#efedea',
      toolbar: '#ffffff',
      stage: '#e1dcd6',
      paper: '#fbfaf7',
      border: '#d4ccc3',
      text: '#211d1a',
      muted: '#6e655d',
      panelGradient: 'linear-gradient(155deg, #f0e9e2 0%, #e6d9cc 52%, #d8c4b2 100%)',
      panelBorder: 'rgba(60, 40, 28, 0.1)',
      panelShadow: 'rgba(70, 45, 28, 0.12)',
    },
    dark: {
      primary: '#e3a98e',
      primaryStrong: '#f0c3ae',
      primaryText: '#2b160d',
      secondary: '#7fbcc0',
      bg: '#171514',
      toolbar: '#1f1c1a',
      stage: '#131110',
      paper: '#d9d5cf',
      border: '#37312c',
      text: '#eeebe7',
      muted: '#a69d95',
      panelGradient: 'linear-gradient(155deg, #30271f 0%, #28211b 52%, #211c17 100%)',
      panelBorder: 'rgba(255, 255, 255, 0.08)',
      panelShadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
}

export const DEFAULT_COLOR_SCHEME_KEY = 'graphite' as const
