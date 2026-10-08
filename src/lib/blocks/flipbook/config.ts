export const FLIPBOOK_SPREAD_MODES = ['auto', 'single', 'double'] as const
export const FLIPBOOK_COVER_MODES = ['covers', 'none'] as const
export const FLIPBOOK_DIRECTIONS = ['ltr', 'rtl'] as const
export const FLIPBOOK_THEMES = ['inherit', 'light', 'dark'] as const
export const FLIPBOOK_ENGINES = ['auto', 'strip', 'webgl'] as const

export const FLIPBOOK_BOOLEAN_CONFIG_KEYS = [
  'showControls',
  'showCounter',
  'showThumbnails',
  'allowZoom',
  'allowFullscreen',
  'allowSearch',
  'allowTextSelect',
  'keyboardNav',
  'swipeNav',
  'loop',
] as const

export type FlipbookBooleanConfigKey = (typeof FLIPBOOK_BOOLEAN_CONFIG_KEYS)[number]

export const FLIPBOOK_BOOLEAN_CONFIG_LABELS: Record<FlipbookBooleanConfigKey, string> = {
  showControls: 'Vor/Zurück-Buttons',
  showCounter: 'Seitenzähler und Sprung',
  showThumbnails: 'Thumbnails',
  allowZoom: 'Zoom',
  allowFullscreen: 'Vollbild',
  allowSearch: 'Suche inkl. Kopieren des gefundenen Texts (im Frontend; Admins behalten sie)',
  allowTextSelect: 'Textauswahl-Modus: beliebigen Text markieren und kopieren (im Frontend; Admins behalten ihn)',
  keyboardNav: 'Tastaturnavigation',
  swipeNav: 'Wischen/Ziehen',
  loop: 'Endlos blättern',
}

export const FLIPBOOK_SELECT_OPTIONS = {
  spreadMode: [
    { label: 'Automatisch', value: 'auto' },
    { label: 'Einseitig', value: 'single' },
    { label: 'Zweiseitig', value: 'double' },
  ],
  coverMode: [
    { label: 'Cover und Rückseite einzeln', value: 'covers' },
    { label: 'Paare ab Seite 1', value: 'none' },
  ],
  direction: [
    { label: 'Links nach rechts', value: 'ltr' },
    { label: 'Rechts nach links', value: 'rtl' },
  ],
  theme: [
    { label: 'Vom App-Theme erben', value: 'inherit' },
    { label: 'Hell', value: 'light' },
    { label: 'Dunkel', value: 'dark' },
  ],
  engine: [
    { label: 'Automatisch', value: 'auto' },
    { label: 'DOM Strip-Curl', value: 'strip' },
    { label: 'WebGL Mesh-Curl', value: 'webgl' },
  ],
} as const
