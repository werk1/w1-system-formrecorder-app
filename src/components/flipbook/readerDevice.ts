import type { DeviceInfo } from '@werk1/w1-system-device-info'

/**
 * Reader structure per device class. Phone portrait and phone landscape are
 * designed separately; everything else (desktop, tablet) uses the default
 * structure. Size variants (PPSM, PLSM, PPXL, PLXL) keep their layout and
 * adapt through the `w1-flipbook_device<suffix>` class.
 */
export type FlipbookReaderLayout = 'default' | 'phonePortrait' | 'phoneLandscape'

export type FlipbookReaderDevice = Partial<
  Pick<DeviceInfo, 'isReady' | 'is_devicePP' | 'is_devicePL' | 'deviceStyleSuffix'>
>

/** Until device-info is ready (server render, first client render) the default structure applies. */
export function resolveReaderLayout(device: FlipbookReaderDevice | undefined): FlipbookReaderLayout {
  if (!device?.isReady) return 'default'
  if (device.is_devicePL) return 'phoneLandscape'
  if (device.is_devicePP) return 'phonePortrait'
  return 'default'
}

/**
 * Device classes on the reader root: `w1-flipbook_deviceReady`, the layout
 * class (`w1-flipbook_devicePP` / `w1-flipbook_devicePL`) and the exact
 * device-info style suffix (e.g. `w1-flipbook_devicePPSM`, `w1-flipbook_deviceDL`).
 */
export function readerDeviceClassNames(device: FlipbookReaderDevice | undefined, layout: FlipbookReaderLayout): string[] {
  if (!device?.isReady) return []
  const suffix = device.deviceStyleSuffix?.replace(/[^a-zA-Z0-9]/g, '')
  const names = ['w1-flipbook_deviceReady']
  if (layout === 'phonePortrait') names.push('w1-flipbook_devicePP')
  if (layout === 'phoneLandscape') names.push('w1-flipbook_devicePL')
  if (suffix) names.push(`w1-flipbook_device${suffix}`)
  return Array.from(new Set(names))
}
