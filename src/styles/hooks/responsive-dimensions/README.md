# useResponsiveDimension Hook

`useResponsiveDimension` liest eine CSS-Massvariable passend zum aktuellen
Device-State und gibt sie als Zahl an React/JavaScript zurueck.

Der Hook gehoert lokal zu `w1-system-core-v2`. Er ist kein Bestandteil von
`@werk1/w1-system-device-info`: Das Device-Info-Package liefert nur die
Device-Erkennung, waehrend dieser Hook die Core-v2-CSS-Variablen ausliest.

## Fuer Dummies

Der Hook beantwortet diese Frage:

```text
Welcher Zahlenwert gilt fuer dieses CSS-Mass auf dem aktuellen Device?
```

Beispiel:

```ts
const headerHeight = useResponsiveDimension({
  baseName: "headerHeight",
});
```

Wenn das aktuelle Device `PP` ist, sucht der Hook zuerst:

```css
--measure_headerHeight_devicePP
```

Wenn diese Variable existiert, wird ihr Wert zurueckgegeben. Wenn sie nicht
existiert, sucht der Hook die Basisvariable:

```css
--measure_headerHeight
```

Aus `--measure_headerHeight_devicePP: 50px;` wird also die Zahl `50`.

## Wofuer der Hook gedacht ist

CSS kann Layout direkt stylen. Manchmal braucht eine Komponente denselben Wert
aber in JavaScript, zum Beispiel fuer:

- `react-spring` Animationen;
- Breitenberechnung wie `viewportWidth - headerWidth - textbarWidth`;
- Inline-Styles, die auf CSS-Designwerten basieren;
- device-spezifische Hoehen, Abstaende oder Schriftgroessen.

## Import

```ts
import { useResponsiveDimension } from "@/styles/hooks/responsive-dimensions/useResponsiveDimension";
```

## Verwendung

```tsx
function MyComponent() {
  const headerHeight = useResponsiveDimension({
    baseName: "headerHeight",
    deviceVariants: ["PP", "TP", "DS", "DM", "DL"],
  });

  const headerWidth = useResponsiveDimension({
    baseName: "headerWidth",
    deviceVariants: ["PL", "TL", "DM", "DL"],
  });

  return (
    <div style={{ height: headerHeight, width: headerWidth }}>Content</div>
  );
}
```

## Konfiguration

| Property         | Type                 | Default                            | Beschreibung                                               |
| ---------------- | -------------------- | ---------------------------------- | ---------------------------------------------------------- |
| `baseName`       | `string`             | required                           | Basisname der CSS-Variable, z.B. `headerHeight`.           |
| `deviceVariants` | `DeviceIdentifier[]` | alle aktuellen W1-Device-Varianten | Erlaubte Device-Varianten fuer diese Abfrage.              |
| `prefix`         | `string`             | `--measure_`                       | Prefix der CSS-Variable.                                   |
| `defaultValue`   | `number`             | `0`                                | Rueckgabewert, wenn keine passende Variable gefunden wird. |

## CSS-Namensschema

Der Hook verwendet dieses Pattern:

```css
:root {
  --measure_headerHeight_devicePP: 50px;
  --measure_headerHeight_deviceTP: 72px;
  --measure_headerHeight_deviceDS: 55px;
  --measure_headerWidth_deviceDM: 220px;
  --measure_headerWidth_deviceDL: 230px;
  --measure_headerWidth_devicePL: 260px;
}
```

Aus `baseName: 'headerHeight'` und Device `PP` wird:

```text
--measure_headerHeight_devicePP
```

## Fallback-Regeln

Der Hook versucht zuerst den spezifischsten Device-Wert und danach sinnvolle
Fallbacks:

| Aktuelles Device | Reihenfolge          |
| ---------------- | -------------------- |
| `PPSM`           | `PPSM -> PP -> base` |
| `PPXL`           | `PPXL -> PP -> base` |
| `PLSM`           | `PLSM -> PL -> base` |
| `PLXL`           | `PLXL -> PL -> base` |
| `TP`             | `TP -> DS -> D -> base` |
| `TL`             | `TL -> DL -> D -> base` |
| `DS`             | `DS -> D -> base`    |
| `DM`             | `DM -> D -> base`    |
| `DL`             | `DL -> D -> base`    |
| `PP`, `PL`, `D`  | Device-Wert -> base  |

`base` bedeutet die Variable ohne Device-Suffix, z.B.:

```css
--measure_headerHeight: 60px;
```

Wenn eine Device-Variante nicht in `deviceVariants` enthalten ist, wird diese
Variante uebersprungen. Dadurch kann eine Komponente explizit begrenzen, welche
Devices fuer ein bestimmtes Mass relevant sind.

## Wichtige Details

- `0px` ist ein gueltiger Wert. Der Hook erkennt also bewusst gesetzte
  Nullwerte.
- Der Hook reagiert auf `viewportWidth` und `viewportHeight`, damit sich Werte
  nach Resize oder Rotation aktualisieren.
- Die Rueckgabe ist immer eine Zahl. Die Umrechnung kommt aus
  `getCSSVariableNumber`.
