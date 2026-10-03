'use client'

/**
 * @file useDeviceSpecificLayoutClasses.ts
 * @description A custom React hook that provides device-specific styling and layout functionality.
 * This hook manages responsive styles and device-specific class names across the application.
 *
 * Key Features:
 * - Provides device-specific CSS classes for content, header, footer, and textbar components
 * - Handles navigation styling with support for different device types
 * - Manages device state and suffix generation for consistent styling
 * - Supports both automatic device detection and forced device styling
 * - Generic helper function for creating device-aware CSS modules
 *
 * Device Types Supported:
 * - PP: Phone Portrait
 * - PL: Phone Landscape
 * - PPSM: Phone Portrait Small (adds PP fallback)
 * - PPXL: Phone Portrait X-Large (adds PP fallback)
 * - PLSM: Phone Landscape Small (adds PL fallback)
 * - PLXL: Phone Landscape X-Large (adds PL fallback)
 * - D: Desktop base
 * - DS: Desktop Small
 * - DM: Desktop Medium
 * - DL: Desktop Large
 * - TP: Tablet Portrait (maps to DS for CSS)
 * - TL: Tablet Landscape (maps to DL for CSS)
 */

import { useBoundStore } from '@/stores/boundStore'
import stylesDeviceLayout from '@/styles/modules/AppLayout.module.css'
import stylesContent from '@/styles/modules/Content.module.css'
import stylesFooter from '@/styles/modules/Footer.module.css'
import stylesLogo from '@/styles/modules/navigation/LogoNav.module.css'

/**
 * useDeviceSpecificLayoutClasses Hook
 *
 * Provides device-specific CSS classes and utilities for responsive layout management.
 *
 * @returns An object containing device-specific classes and utility functions
 *
 * @property {string} deviceLayoutClass - Device-specific class for device layout wrapper
 * @property {string} contentClass - Device-specific class for content container
 * @property {string} footerClass - Device-specific class for footer
 * @property {Object} logoClass - Device-specific classes for logo (base, object)
 * @property {Object} deviceState - Current device state from the bound store
 * @property {string} deviceSpecificSuffix - Current device suffix for styling (e.g., '_devicePL')
 * @property {Function} getDeviceSpecificClasses - Unified helper to get device-specific classes
 *
 * @example
 * ```tsx
 * const { footerClass } = useDeviceSpecificLayoutClasses()
 * <footer className={footerClass.container}>
 * ```
 */
export function useDeviceSpecificLayoutClasses() {
  const deviceState = useBoundStore((state) => state.device)

  /**
   * Get the appropriate device suffix for the current device state
   * Uses deviceStyleSuffix from w1-system-device-info.
   * Generates progressive fallback chains:
   * DS/DM/DL -> D, PPSM/PPXL -> PP, PLSM/PLXL -> PL.
   * Tablet suffixes can include desktop fallbacks: TP -> DS, TL -> DL.
   * @returns The primary device suffix string with underscore prefix, e.g. '_devicePP'
   */
  const resolvedDeviceSuffixes = (() => {
    const suffix = deviceState.deviceStyleSuffix || 'DL'
    if (suffix === 'DS') return ['D', 'DS']
    if (suffix === 'DM') return ['D', 'DM']
    if (suffix === 'DL') return ['D', 'DL']
    if (suffix === 'PPSM') return ['PP', 'PPSM']
    if (suffix === 'PPXL') return ['PP', 'PPXL']
    if (suffix === 'PLSM') return ['PL', 'PLSM']
    if (suffix === 'PLXL') return ['PL', 'PLXL']
    if (suffix === 'TP') return ['DS', 'TP']
    if (suffix === 'TL') return ['DL', 'TL']
    return [suffix]
  })()

  const deviceSpecificSuffix = `_device${resolvedDeviceSuffixes[resolvedDeviceSuffixes.length - 1]}`

  /**
   * Unified helper function for device-specific classes with automatic fallback
   * Can handle both single class strings and complex objects with multiple properties
   *
   * Behavior:
   * - Always includes the base class for inheritance
   * - Adds device-specific class if it exists (for partial overrides)
   * - Returns combined classes: "baseClass baseClass_devicePL"
   *
   * This allows you to:
   * 1. Define only base styles → works for all devices
   * 2. Define device-specific overrides → only write what's different
   * 3. Define complete device styles → full control if needed
   *
   * @param styles - CSS module styles object
   * @param config - String, array of strings, or array of objects (or mixed)
   * @returns Either a string class name or an object with class name properties
   *
   * @example
   * ```typescript
   * // Single string
   * getDeviceSpecificClasses(styles, 'container')
   * // → "container container_devicePL"
   *
   * // Array of strings (auto property = baseClassName)
   * getDeviceSpecificClasses(styles, ['icons', 'copyright'])
   * // → { icons: 'icons icons_devicePL', copyright: 'copyright copyright_devicePL' }
   *
   * // Array of objects (manual property override)
   * getDeviceSpecificClasses(styles, [{ property: 'container', baseClassName: 'containerFooter' }])
   * // → { container: 'containerFooter containerFooter_devicePL' }
   *
   * // Mixed array (strings + objects)
   * getDeviceSpecificClasses(styles, [
   *   { property: 'container', baseClassName: 'containerFooter' },
   *   'icons',
   *   'copyright'
   * ])
   * // → { container: '...', icons: '...', copyright: '...' }
   * ```
   */
  const getDeviceSpecificClasses = <T extends string | Record<string, string>>(
    styles: Record<string, string>,
    config:
      | string
      | Array<string | { property: keyof T & string; baseClassName: string }>,
  ): T => {
    // Simple case: return a single string class
    if (typeof config === 'string') {
      const baseClass = styles[config] || ''
      const deviceClasses = resolvedDeviceSuffixes
        .map((suffix) => styles[`${config}_device${suffix}`] || '')
        .filter(Boolean)
      // Combine both, filter empty strings, join with space
      return [baseClass, ...deviceClasses].filter(Boolean).join(' ') as T
    }

    // Complex case: return an object with multiple class properties
    const result = {} as Record<string, string>

    config.forEach((item) => {
      // If item is a string, auto-map property = baseClassName
      if (typeof item === 'string') {
        const baseClass = styles[item] || ''
        const deviceClasses = resolvedDeviceSuffixes
          .map((suffix) => styles[`${item}_device${suffix}`] || '')
          .filter(Boolean)
        result[item] = [baseClass, ...deviceClasses].filter(Boolean).join(' ')
      } else {
        // If item is an object, use manual property/baseClassName mapping
        const { property, baseClassName } = item
        const baseClass = styles[baseClassName] || ''
        const deviceClasses = resolvedDeviceSuffixes
          .map((suffix) => styles[`${baseClassName}_device${suffix}`] || '')
          .filter(Boolean)
        result[property] = [baseClass, ...deviceClasses].filter(Boolean).join(' ')
      }
    })

    return result as T
  }

  // Simple single class usage
  const deviceLayoutClass = getDeviceSpecificClasses<string>(
    stylesDeviceLayout,
    'containerDeviceLayout',
  )
  const contentClass = getDeviceSpecificClasses<string>(stylesContent, 'containerContent')
  const footerClass = getDeviceSpecificClasses<string>(stylesFooter, 'containerFooter')

  // Complex object class usage
  const logoClass = getDeviceSpecificClasses<{
    base: string
    object: string
  }>(stylesLogo, [
    { property: 'base', baseClassName: 'logoBase' },
    { property: 'object', baseClassName: 'logoObject' },
  ])

  /**
   * Gets the current device-specific suffix for styling purposes
   * Uses deviceStyleSuffix from w1-system-device-info v2.2.0+
   * @returns {string} The device suffix (e.g., '_devicePP', '_devicePL')
   */
  const getDeviceSpecificSuffix = () => deviceSpecificSuffix

  return {
    deviceLayoutClass,
    contentClass,
    footerClass,
    logoClass,
    deviceState,
    deviceSpecificSuffix: getDeviceSpecificSuffix(),
    getDeviceSpecificClasses,
  }
}
