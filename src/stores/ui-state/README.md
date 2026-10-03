# UI State Management

Zustand slice for managing global UI state including overlays, navigation, and device-specific dimensions.

## Features

- 🎨 **UI State** - Textbar, menu, overlays, debug panels
- 📐 **Dynamic Dimensions** - Device-aware CSS variable loading
- 🔄 **Auto-Updates** - Dimensions update on device changes
- 📱 **Device-Adaptive** - Tablet→Desktop mapping built-in
- ⚙️ **Configuration** - Static config from CSS variables
- 🔧 **Backward Compatible** - Legacy constants still supported

## Quick Start

```tsx
import { useBoundStore } from '@/stores/boundStore'

function MyComponent() {
  const { ui, updateDeviceSpecificDimensions } = useBoundStore()

  // Modern API (recommended)
  const width = ui.deviceSpecificDimensions.TEXTBAR_OPEN_WIDTH

  // Legacy API (deprecated but still works)
  const legacyWidth = device.is_deviceDL
    ? ui.constants.TEXTBAR_OPEN_WIDTH_deviceDL
    : ui.constants.TEXTBAR_OPEN_WIDTH_devicePL

  return <div style={{ width }}>{/* ... */}</div>
}
```

## State Structure

### Constants (Static Configuration)

```typescript
ui.constants = {
  ui_config: {
    HEADER_LANDSCAPE_POSITION: 'left' | 'center' | 'right'
    SCROLL_MODE: 'contentScroll' | 'pageScroll'
  }
  // Legacy device-specific constants (deprecated)
  TEXTBAR_OPEN_WIDTH_deviceDL: number
  TEXTBAR_OPEN_WIDTH_devicePL: number
  // ...
}
```

Loaded once on app start via `initializeConstants()`.

### Device-Specific Dimensions (Dynamic)

```typescript
ui.deviceSpecificDimensions = {
  TEXTBAR_OPEN_WIDTH: number     // Updates on device change
  TEXTBAR_CLOSED_WIDTH: number
  TEXTBAR_CLOSED_HEIGHT: number
  HEADER_HEIGHT: number
  HEADER_WIDTH: number
  POPUP_HEIGHT: number
  FOOTER_HEIGHT: number
}
```

Updated dynamically via `updateDeviceSpecificDimensions()`.

## Methods

### initializeConstants()

Loads static configuration from CSS variables (once on app start):

```typescript
const { initializeConstants } = useBoundStore()

useEffect(() => {
  initializeConstants()
}, [])
```

Reads:

- `--measure_headerLandscapePosition`
- `--measure_scrollMode`
- Legacy device-specific variables

### updateDeviceSpecificDimensions() ✨ NEW

Loads device-specific dimensions from CSS variables (call on device change):

```tsx
import { useBoundStore } from '@/stores/boundStore'
import { useEffect } from 'react'

function MyComponent() {
  const { device, updateDeviceSpecificDimensions } = useBoundStore()

  // Update dimensions when device changes
  useEffect(() => {
    updateDeviceSpecificDimensions()
  }, [device.deviceStyleSuffix])

  return <div>{/* ... */}</div>
}
```

#### Fallback Logic

For each dimension (e.g., `textbarOpenWidth`):

1. **Try exact device-specific**: `--measure_textbarOpenWidth_deviceDM`
2. **Fallback to device group**: `--measure_textbarOpenWidth_deviceD`
3. **Fallback to base**: `--measure_textbarOpenWidth`
4. **Final fallback**: `0`

Examples:

```text
DS -> D -> base
DM -> D -> base
DL -> D -> base
PPSM -> PP -> base
PPXL -> PP -> base
PLSM -> PL -> base
PLXL -> PL -> base
TP -> DS -> D -> base
TL -> DL -> D -> base
```

#### Tablet Mapping

Uses device flags and `deviceStyleSuffix` from **w1-system-device-info v2.2.0+**:

- Tablet Portrait (TP) → Uses Desktop Small (DS) styles
- Tablet Landscape (TL) → Uses Desktop Large (DL) styles
- Desktop Small (DS) → Uses Desktop base (D) as fallback
- Desktop Medium (DM) → Uses Desktop base (D) as fallback
- Desktop Large (DL) → Uses Desktop base (D) as fallback

```css
/* CSS Example */
--measure_textbarOpenWidth: 400px;              /* Base */
--measure_textbarOpenWidth_deviceD: 410px;      /* Desktop base */
--measure_textbarOpenWidth_devicePL: 350px;     /* Phone Landscape */
--measure_textbarOpenWidth_deviceDS: 380px;     /* Desktop Small (& Tablet Portrait) */
--measure_textbarOpenWidth_deviceDM: 400px;     /* Desktop Medium */
--measure_textbarOpenWidth_deviceDL: 420px;     /* Desktop Large (& Tablet Landscape) */
```

## UI State Properties

### Navigation & Panels

```typescript
ui.isTextbarOpen: boolean
ui.isMenuOpen: boolean
ui.isSubMenuOpen: boolean
ui.isDebugPanelOpen: boolean
ui.isMediaDebugOpen: boolean
```

### Overlays

```typescript
ui.showOverlay: boolean
ui.showLoadingOverlay: boolean
ui.showLandscapeOverlay: boolean
```

### Routing & Locale

```typescript
ui.currentRoute: string | null
ui.currentLocale: 'de' | 'en' | 'sl' | 'it' | ...
```

### Other

```typescript
ui.isHeroVisible: boolean
ui.audioUnlocked: boolean
```

## Complete Example

```tsx
import { useBoundStore } from '@/stores/boundStore'
import { useEffect } from 'react'

function DeviceAdaptiveComponent() {
  const {
    ui,
    device,
    initializeConstants,
    updateDeviceSpecificDimensions
  } = useBoundStore()

  // Initialize on mount
  useEffect(() => {
    initializeConstants()
    updateDeviceSpecificDimensions()
  }, [])

  // Update dimensions when device changes
  useEffect(() => {
    updateDeviceSpecificDimensions()
  }, [device.deviceStyleSuffix])

  const { deviceSpecificDimensions } = ui

  return (
    <div
      style={{
        width: deviceSpecificDimensions.TEXTBAR_OPEN_WIDTH,
        height: deviceSpecificDimensions.HEADER_HEIGHT
      }}
    >
      {/* Device-adaptive content */}
    </div>
  )
}
```

## Migration Guide

### From Legacy Constants (Old)

```typescript
// ❌ OLD - Manual device checking
const width = device.is_deviceDL
  ? ui.constants.TEXTBAR_OPEN_WIDTH_deviceDL
  : ui.constants.TEXTBAR_OPEN_WIDTH_devicePL
```

### To Device-Specific Dimensions (New)

```typescript
// ✅ NEW - Automatic, no checking needed
const width = ui.deviceSpecificDimensions.TEXTBAR_OPEN_WIDTH

// Make sure to call updateDeviceSpecificDimensions() when device changes
```

### Benefits of Migration

- ✅ No if/else logic in components
- ✅ Automatic updates on device change
- ✅ Tablet support included
- ✅ Fallback to base CSS variables
- ✅ Cleaner, more maintainable code

## Related

- [@werk1/w1-system-device-info](https://www.npmjs.com/package/@werk1/w1-system-device-info) - Device detection
- [useDeviceSpecificLayoutClasses](/src/styles/hooks/device-specific-layout-classes) - Layout classes hook
