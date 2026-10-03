import {
  getCSSVariableNumber,
  getCSSVariableString,
} from '@/styles/utils/getCSSVariables'
import { StateCreator } from 'zustand'
import { HeaderPosition, ScrollMode, UIStateSlice } from './uiStateTypes'

// Default constants (used for server rendering)
const DEFAULT_CONSTANTS = {
  ui_config: {
    HEADER_LANDSCAPE_POSITION: <HeaderPosition>'left',
    SCROLL_MODE: <ScrollMode>'pageScroll',
  },
  // Legacy device-specific constants (kept for backward compatibility)
  TEXTBAR_OPEN_WIDTH_deviceDL: 420,
  TEXTBAR_OPEN_WIDTH_devicePL: 350,
  TEXTBAR_CLOSED_WIDTH: 50,
  TEXTBAR_CLOSED_HEIGHT: 50,
  POPUP_HEIGHT_deviceDS: 180,
  POPUP_HEIGHT_devicePP: 230,
}

// Default device-specific dimensions (used for server rendering)
const DEFAULT_DIMENSIONS = {
  TEXTBAR_OPEN_WIDTH: 0,
  TEXTBAR_CLOSED_WIDTH: 0,
  TEXTBAR_CLOSED_HEIGHT: 0,
  HEADER_HEIGHT: 0,
  HEADER_WIDTH: 0,
  POPUP_HEIGHT: 0,
  FOOTER_HEIGHT: 0,
}

export const createUIStateSlice: StateCreator<UIStateSlice> = (set, get) => {
  // Auto-subscribe to store changes for overlay management
  // Initialize subscriptions after store is created
  const initializeSubscriptions = () => {
    // Import useBoundStore dynamically to avoid circular dependency
    import('../boundStore').then(({ useBoundStore }) => {
      // Subscribe to all store changes and update overlays automatically
      useBoundStore.subscribe((state) => {
        const deviceInfo = state.device
        const isFullscreen =
          (state as typeof state & { isFullscreen?: boolean }).isFullscreen || false

        // Get current UI state
        const currentState = get()
        const currentUI = currentState.ui

        // Calculate new overlay states - both can now be managed automatically
        const newShowLoadingOverlay = !deviceInfo?.isReady
        const newShowLandscapeOverlay =
          deviceInfo?.is_devicePL && !isFullscreen && !currentUI.suppressLandscapeOverlay

        // Handle loading overlay with simple delay
        if (currentUI.showLoadingOverlay !== newShowLoadingOverlay) {
          if (newShowLoadingOverlay) {
            // Show immediately when loading starts
            set((state) => ({
              ui: {
                ...state.ui,
                showLoadingOverlay: true,
              },
            }))
          } else {
            // Device-adaptive delay based on performance detection
            const performanceTier = deviceInfo?.performance?.tier || 'medium'

            const getPerformanceDelay = () => {
              switch (performanceTier) {
                case 'high':
                  return 300 // Fast devices - shorter delay
                case 'low':
                  return 600 // Slow devices - longer delay
                default:
                  return 450 // Medium devices - balanced delay
              }
            }

            setTimeout(() => {
              set((state) => ({
                ui: {
                  ...state.ui,
                  showLoadingOverlay: false,
                },
              }))
            }, getPerformanceDelay())
          }
        }

        // Handle landscape overlay immediately (no fade animation)
        if (currentUI.showLandscapeOverlay !== newShowLandscapeOverlay) {
          set((state) => ({
            ui: {
              ...state.ui,
              showLandscapeOverlay: newShowLandscapeOverlay,
            },
          }))
        }
      })
    })
  }

  // Initialize subscriptions on next tick
  setTimeout(initializeSubscriptions, 0)

  return {
    ui: {
      isTextbarOpen: false,
      isMenuOpen: false,
      isSubMenuOpen: false,
      textbarHeight: 0,
      isDebugPanelOpen: false,
      isMediaDebugOpen: false,
      isHeroVisible: true,
      currentRoute: null,
      currentLocale: 'de',
      showOverlay: false,
      showLoadingOverlay: false,
      showLandscapeOverlay: false,
      suppressLandscapeOverlay: false,
      audioUnlocked: false,
      constants: DEFAULT_CONSTANTS,
      deviceSpecificDimensions: DEFAULT_DIMENSIONS,
    },

    setTextbarOpen: (isOpen) =>
      set((state) => ({
        ui: {
          ...state.ui,
          isTextbarOpen: isOpen,
        },
      })),

    setMenuOpen: (isOpen) =>
      set((state) => ({
        ui: {
          ...state.ui,
          isMenuOpen: isOpen,
        },
      })),
    setSubMenuOpen: (isOpen) =>
      set((state) => ({
        ui: {
          ...state.ui,
          isSubMenuOpen: isOpen,
        },
      })),
    setTextbarHeight: (height) =>
      set((state) => ({
        ui: {
          ...state.ui,
          textbarHeight: height,
        },
      })),

    toggleTextbar: () =>
      set((state) => ({
        ui: {
          ...state.ui,
          isTextbarOpen: !state.ui.isTextbarOpen,
        },
      })),

    resetTextbarState: () =>
      set((state) => ({
        ui: {
          ...state.ui,
          isTextbarOpen: false,
        },
      })),

    toggleDebugPanel: () =>
      set((state) => {
        const newState = !state.ui.isDebugPanelOpen
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('debug_panel', String(newState))
        }
        return {
          ui: {
            ...state.ui,
            isDebugPanelOpen: newState,
          },
        }
      }),

    toggleMediaDebug: () =>
      set((state) => {
        const newState = !state.ui.isMediaDebugOpen
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('media_debug', String(newState))
        }
        return {
          ui: {
            ...state.ui,
            isMediaDebugOpen: newState,
          },
        }
      }),

    setDebugPanelOpen: (isOpen) =>
      set((state) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('debug_panel', String(isOpen))
        }
        return {
          ui: {
            ...state.ui,
            isDebugPanelOpen: isOpen,
          },
        }
      }),

    setMediaDebugOpen: (isOpen) =>
      set((state) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('media_debug', String(isOpen))
        }
        return {
          ui: {
            ...state.ui,
            isMediaDebugOpen: isOpen,
          },
        }
      }),

    setHeroVisible: (isVisible) =>
      set((state) => ({
        ui: {
          ...state.ui,
          isHeroVisible: isVisible,
        },
      })),

    setCurrentRoute: (route) =>
      set((state) => ({
        ui: {
          ...state.ui,
          currentRoute: route,
        },
      })),

    setLocale: (locale) =>
      set((state) => ({
        ui: {
          ...state.ui,
          currentLocale: locale,
        },
      })),

    setShowOverlay: (show: boolean) =>
      set((state) => ({
        ui: {
          ...state.ui,
          showOverlay: show,
        },
      })),

    setShowLoadingOverlay: (show: boolean) =>
      set((state) => ({
        ui: {
          ...state.ui,
          showLoadingOverlay: show,
        },
      })),

    setShowLandscapeOverlay: (show: boolean) =>
      set((state) => ({
        ui: {
          ...state.ui,
          showLandscapeOverlay: show,
        },
      })),

    setSuppressLandscapeOverlay: (suppress: boolean) =>
      set((state) => ({
        ui: {
          ...state.ui,
          suppressLandscapeOverlay: suppress,
        },
      })),

    setAudioUnlocked: (unlocked: boolean) =>
      set((state) => ({
        ui: {
          ...state.ui,
          audioUnlocked: unlocked,
        },
      })),

    updateLandscapeOverlay: () =>
      set((state) => {
        // Access device info from bound store with proper typing
        const deviceInfo = (state as typeof state & { device: { is_devicePL: boolean } }).device
        // Access video coordination state with proper typing
        const isFullscreen =
          (state as typeof state & { video?: { isFullscreen?: boolean } }).video?.isFullscreen ||
          false

        return {
          ui: {
            ...state.ui,
            showLandscapeOverlay:
              deviceInfo?.is_devicePL && !isFullscreen && !state.ui.suppressLandscapeOverlay,
          },
        }
      }),

    updateLoadingOverlay: () =>
      set((state) => {
        // Access device ready state from bound store
        const deviceInfo = (state as typeof state & { device: { isReady: boolean } }).device

        return {
          ui: {
            ...state.ui,
            showLoadingOverlay: !deviceInfo?.isReady, // Show loading when device is NOT ready
          },
        }
      }),

    /**
     * Initialize constants from CSS variables
     * @returns
     */
    initializeConstants: () =>
      set((state) => {
        if (typeof window === 'undefined') return { ui: state.ui }

        // Helper function to ensure value is a valid HeaderPosition
        const getHeaderPosition = (value: string): HeaderPosition => {
          if (value === 'center' || value === 'left' || value === 'right') {
            return value
          }
          // Default if invalid value
          return 'left'
        }

        // Helper function to ensure value is a valid ScrollMode
        const getScrollMode = (value: string): ScrollMode => {
          if (value === 'contentScroll' || value === 'pageScroll') {
            return value
          }
          // Default if invalid value
          return 'pageScroll'
        }

        const headerPosition = getHeaderPosition(
          getCSSVariableString('--measure_headerLandscapePosition'),
        )

        const scrollMode = getScrollMode(getCSSVariableString('--measure_scrollMode'))

        return {
          ui: {
            ...state.ui,
            constants: {
              ui_config: {
                HEADER_LANDSCAPE_POSITION: headerPosition,
                SCROLL_MODE: scrollMode,
              },
              TEXTBAR_OPEN_WIDTH_deviceDL: getCSSVariableNumber(
                '--measure_textbarOpenWidth_deviceDL',
              ),
              TEXTBAR_OPEN_WIDTH_devicePL: getCSSVariableNumber(
                '--measure_textbarOpenWidth_devicePL',
              ),
              TEXTBAR_CLOSED_WIDTH: getCSSVariableNumber('--measure_textbarClosedWidth'),
              TEXTBAR_CLOSED_HEIGHT: getCSSVariableNumber('--measure_textbarClosedHeight'),
              POPUP_HEIGHT_deviceDS: getCSSVariableNumber('--measure_navPopupMaxHeight_deviceDS'),
              POPUP_HEIGHT_devicePP: getCSSVariableNumber('--measure_navPopupMaxHeight_devicePP'),
            },
          },
        }
      }),

    /**
     * Update device-specific dimensions from CSS variables
     */
    updateDeviceSpecificDimensions: () =>
      set((state) => {
        if (typeof window === 'undefined') return { ui: state.ui }

        const device = (get() as typeof state & {
          device?: {
            deviceStyleSuffix?: string
            is_deviceDS?: boolean
            is_deviceDM?: boolean
            is_deviceDL?: boolean
            is_deviceD?: boolean
            is_devicePPSM?: boolean
            is_devicePPXL?: boolean
            is_devicePP?: boolean
            is_devicePLSM?: boolean
            is_devicePLXL?: boolean
            is_devicePL?: boolean
            is_deviceTP?: boolean
            is_deviceTL?: boolean
          }
        }).device

        const resolveMeasureCandidates = (): string[] => {
          if (device?.is_deviceDS) return ['DS', 'D']
          if (device?.is_deviceDM) return ['DM', 'D']
          if (device?.is_deviceDL) return ['DL', 'D']
          if (device?.is_deviceD) return ['D']
          if (device?.is_devicePPSM) return ['PPSM', 'PP']
          if (device?.is_devicePPXL) return ['PPXL', 'PP']
          if (device?.is_devicePP) return ['PP']
          if (device?.is_devicePLSM) return ['PLSM', 'PL']
          if (device?.is_devicePLXL) return ['PLXL', 'PL']
          if (device?.is_devicePL) return ['PL']
          if (device?.is_deviceTP) return ['TP', 'DS', 'D']
          if (device?.is_deviceTL) return ['TL', 'DL', 'D']

          const suffix = device?.deviceStyleSuffix
          if (suffix === 'DS') return ['DS', 'D']
          if (suffix === 'DM') return ['DM', 'D']
          if (suffix === 'DL') return ['DL', 'D']
          if (suffix === 'PPSM') return ['PPSM', 'PP']
          if (suffix === 'PPXL') return ['PPXL', 'PP']
          if (suffix === 'PLSM') return ['PLSM', 'PL']
          if (suffix === 'PLXL') return ['PLXL', 'PL']
          if (suffix) return [suffix]

          return []
        }

        const measureCandidates = resolveMeasureCandidates()

        const getDeviceSpecificDimension = (baseName: string) => {
          for (const candidate of measureCandidates) {
            const variableName = `--measure_${baseName}_device${candidate}`
            const rawValue = getCSSVariableString(variableName)
            if (rawValue && rawValue.trim() !== '') {
              return getCSSVariableNumber(variableName)
            }
          }

          const baseVariableName = `--measure_${baseName}`
          const baseRawValue = getCSSVariableString(baseVariableName)
          if (baseRawValue && baseRawValue.trim() !== '') {
            return getCSSVariableNumber(baseVariableName)
          }

          return 0
        }

        return {
          ui: {
            ...state.ui,
            deviceSpecificDimensions: {
              TEXTBAR_OPEN_WIDTH: getDeviceSpecificDimension('textbarOpenWidth'),
              TEXTBAR_CLOSED_WIDTH: getDeviceSpecificDimension('textbarClosedWidth'),
              TEXTBAR_CLOSED_HEIGHT: getDeviceSpecificDimension('textbarClosedHeight'),
              HEADER_HEIGHT: getDeviceSpecificDimension('headerHeight'),
              HEADER_WIDTH: getDeviceSpecificDimension('headerWidth'),
              POPUP_HEIGHT: getDeviceSpecificDimension('navPopupMaxHeight'),
              FOOTER_HEIGHT: getDeviceSpecificDimension('footerHeight'),
            },
          },
        }
      }),
  }
}
