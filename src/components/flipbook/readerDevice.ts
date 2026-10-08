import type { DeviceInfo } from '@werk1/w1-system-device-info'

/**
 * Reader structure per device class. Phone portrait, phone landscape, tablet
 * portrait and tablet landscape are designed separately; desktop uses the
 * default structure. Size variants (PPSM, PLSM) keep their layout and adapt
 * through the `w1-flipbook_device<identifier>` class.
 */
export type FlipbookReaderLayout = 'default' | 'phonePortrait' | 'phoneLandscape' | 'tabletPortrait' | 'tabletLandscape'

export type FlipbookReaderDevice = Partial<
  Pick<DeviceInfo, 'isReady' | 'is_devicePP' | 'is_devicePL' | 'is_deviceTP' | 'is_deviceTL' | 'deviceIdentifier'>
>

const LAYOUT_CLASS: Partial<Record<FlipbookReaderLayout, string>> = {
  phonePortrait: 'w1-flipbook_devicePP',
  phoneLandscape: 'w1-flipbook_devicePL',
  tabletPortrait: 'w1-flipbook_deviceTP',
  tabletLandscape: 'w1-flipbook_deviceTL',
}

/** Until device-info is ready (server render, first client render) the default structure applies. */
export function resolveReaderLayout(device: FlipbookReaderDevice | undefined): FlipbookReaderLayout {
  if (!device?.isReady) return 'default'
  if (device.is_devicePL) return 'phoneLandscape'
  if (device.is_devicePP) return 'phonePortrait'
  if (device.is_deviceTL) return 'tabletLandscape'
  if (device.is_deviceTP) return 'tabletPortrait'
  return 'default'
}

/** Phone and tablet landscape put the chrome beside the pages (`chromeLayout="side"`). */
export function isSideLayout(layout: FlipbookReaderLayout): boolean {
  return layout === 'phoneLandscape' || layout === 'tabletLandscape'
}

/**
 * Device classes on the reader root: `w1-flipbook_deviceReady`, the layout
 * class (`w1-flipbook_devicePP` / `_devicePL` / `_deviceTP` / `_deviceTL`)
 * and the exact device-info identifier (e.g. `w1-flipbook_devicePPSM`,
 * `w1-flipbook_deviceDL`). The identifier keeps tablets as `TP`/`TL`; the
 * device-info style suffix would map them to desktop (`DS`/`DL`).
 */
export function readerDeviceClassNames(device: FlipbookReaderDevice | undefined, layout: FlipbookReaderLayout): string[] {
  if (!device?.isReady) return []
  const identifier = device.deviceIdentifier?.replace(/[^a-zA-Z0-9]/g, '')
  const names = ['w1-flipbook_deviceReady']
  const layoutClass = LAYOUT_CLASS[layout]
  if (layoutClass) names.push(layoutClass)
  if (identifier) names.push(`w1-flipbook_device${identifier}`)
  return Array.from(new Set(names))
}
