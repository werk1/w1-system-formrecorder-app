# Device-Specific Layout Hooks

Lokale Hooks fuer device-aware Styling in `w1-system-core-v2`.

## useDeviceSpecificLayoutClasses

`useDeviceSpecificLayoutClasses` kombiniert CSS-Module mit dem aktuellen
`deviceStyleSuffix` aus `@werk1/w1-system-device-info`.

Rueckgabe:

```ts
{
  deviceLayoutClass: string
  contentClass: string
  footerClass: string
  logoClass: {
    base: string
    object: string
  }
  deviceState: DeviceInfo
  deviceSpecificSuffix: string
  getDeviceSpecificClasses: (styles, config) => string | Record<string, string>
}
```

CSS-Module folgen der W1-Konvention:

```css
.containerContent {
  display: flex;
}

.containerContent_deviceD {
  margin-left: var(--measure_headerWidth_deviceD);
}

.containerContent_deviceDM {
  margin-left: var(--measure_headerWidth_deviceDM);
}
```

Der Helper gibt immer die Basis-Klasse und danach vorhandene Device-Klassen
zurueck. Fuer `DM` waere das zum Beispiel:

```text
containerContent containerContent_deviceD containerContent_deviceDM
```

## useResponsiveDimension

`useResponsiveDimension` liest numerische CSS-Variablen passend zum Device-State,
zum Beispiel `--measure_headerHeight_devicePP`. Details stehen in
`responsive-dimensions/README.md`.

## Aktuelle Device-Namen

Gueltige Device-Namen kommen aus `DeviceIdentifier`:

```text
D, DS, DM, DL, PP, PPSM, PPXL, PL, PLSM, PLXL, TP, TL
```

`D`, `PP` und `PL` sind Basisgruppen. `DS/DM/DL`, `PPSM/PPXL` und
`PLSM/PLXL` sind Verfeinerungen. Alte Landscape-Positionssuffixe sind keine
Device-Namen mehr; Header-Positionen werden separat ueber die App-Konfiguration
gesteuert.
