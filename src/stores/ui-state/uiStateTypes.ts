import type { LanguageCode } from '@/config/languages'

export type HeaderPosition = 'center' | 'left' | 'right'
export type ScrollMode = 'contentScroll' | 'pageScroll'

/**
 * UI Constants - Static configuration values
 * These values do not change based on device type
 */
export interface UIConstants {
  ui_config: {
    HEADER_LANDSCAPE_POSITION: HeaderPosition
    SCROLL_MODE: ScrollMode
  }
  // Legacy device-specific constants (deprecated - use deviceSpecificDimensions instead)
  TEXTBAR_OPEN_WIDTH_deviceDL: number
  TEXTBAR_OPEN_WIDTH_devicePL: number
  TEXTBAR_CLOSED_WIDTH: number
  TEXTBAR_CLOSED_HEIGHT: number
  POPUP_HEIGHT_deviceDS: number
  POPUP_HEIGHT_devicePP: number
}

/**
 * Device-Specific UI Dimensions - Dynamic values based on current device
 * These values update when device changes (rotation, resize)
 * Uses fallback logic: device-specific CSS variable → base CSS variable → 0
 *
 * @since Modern implementation (la-torre pattern)
 */
export interface UIDeviceSpecificDimensions {
  TEXTBAR_OPEN_WIDTH: number
  TEXTBAR_CLOSED_WIDTH: number
  TEXTBAR_CLOSED_HEIGHT: number
  HEADER_HEIGHT: number
  HEADER_WIDTH: number
  POPUP_HEIGHT: number
  FOOTER_HEIGHT: number
}

export interface UIState {
  isTextbarOpen: boolean
  isMenuOpen: boolean
  isSubMenuOpen: boolean
  textbarHeight: number | null
  isDebugPanelOpen: boolean
  isMediaDebugOpen: boolean
  isHeroVisible: boolean
  currentRoute: string | null
  audioUnlocked: boolean
  constants: UIConstants
  deviceSpecificDimensions: UIDeviceSpecificDimensions
}

export interface UIStateSlice {
  ui: {
    isTextbarOpen: boolean
    isMenuOpen: boolean
    isSubMenuOpen: boolean
    textbarHeight: number | null
    isDebugPanelOpen: boolean
    isMediaDebugOpen: boolean
    isHeroVisible: boolean
    currentRoute: string | null
    currentLocale: LanguageCode
    showOverlay: boolean
    showLoadingOverlay: boolean
    showLandscapeOverlay: boolean
    suppressLandscapeOverlay: boolean
    audioUnlocked: boolean
    constants: UIConstants
    deviceSpecificDimensions: UIDeviceSpecificDimensions
  }
  setTextbarOpen: (isOpen: boolean) => void
  setMenuOpen: (isOpen: boolean) => void
  setSubMenuOpen: (isOpen: boolean) => void
  setTextbarHeight: (height: number) => void
  toggleTextbar: () => void
  resetTextbarState: () => void
  toggleDebugPanel: () => void
  toggleMediaDebug: () => void
  setDebugPanelOpen: (isOpen: boolean) => void
  setMediaDebugOpen: (isOpen: boolean) => void
  setHeroVisible: (isVisible: boolean) => void
  setCurrentRoute: (route: string | null) => void
  setLocale: (locale: LanguageCode) => void
  setShowOverlay: (show: boolean) => void
  setShowLoadingOverlay: (show: boolean) => void
  setShowLandscapeOverlay: (show: boolean) => void
  setSuppressLandscapeOverlay: (suppress: boolean) => void
  setAudioUnlocked: (unlocked: boolean) => void
  updateLandscapeOverlay: () => void
  updateLoadingOverlay: () => void
  initializeConstants: () => void
  updateDeviceSpecificDimensions: () => void
}
