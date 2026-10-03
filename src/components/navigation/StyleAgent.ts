/**
 * StyleAgent Module
 *
 * This module provides a flexible way to generate device-specific CSS class names
 * for navigation components. It ensures consistent naming across different device types.
 */

import type { DeviceIdentifier } from '@werk1/w1-system-device-info'

/**
 * Represents the different device types supported by the StyleAgent.
 */
type DeviceSuffix = `_device${DeviceIdentifier}`

/**
 * Defines the structure of the StyleAgentType object, which contains
 * CSS class names for various navigation components.
 */
export type StyleAgentType = {
  navlink_main_item: string
  navlink_main_item_active: string
  navlink_main_subitem: string
  navlink_main_subicon: string
  navlink_animated_subcontainer: string
  navlink_sub_item: string
  navlink_sub_item_active: string
}

/**
 * Maps the StyleAgentType keys to their corresponding CSS class name prefixes.
 */
const styleMap: Record<keyof StyleAgentType, string> = {
  navlink_main_item: 'navlinkMainItem',
  navlink_main_item_active: 'navlinkMainItemActive',
  navlink_main_subitem: 'navlinkMainSubItem',
  navlink_main_subicon: 'navlinkMainSubIcon',
  navlink_animated_subcontainer: 'navlinkAnimatedSubContainer',
  navlink_sub_item: 'navlinkSubItem',
  navlink_sub_item_active: 'navlinkSubItemActive',
}

export function StyleAgent(
  device: DeviceSuffix,
  styles?: Record<string, string>,
): StyleAgentType {
  return Object.entries(styleMap).reduce((acc, [key, value]) => {
    const baseClassName = `${value}${device}`
    acc[key as keyof StyleAgentType] = styles
      ? styles[baseClassName] || baseClassName
      : baseClassName
    return acc
  }, {} as StyleAgentType)
}
