const descriptionStyle = {
  marginBottom: 24,
} as const

export function AppFontAssetsDescription() {
  return (
    <p style={descriptionStyle}>
      Assets sind die geprüften physischen Fontdateien. Jedes Asset enthält eine unveränderliche TTF- oder
      OTF-Quelldatei, die analysierten Namen, Metriken, Achsen und Lizenzangaben sowie ein automatisch erzeugtes
      WOFF2-Webformat. Vor der Verwendung werden Assets zu Familien zusammengefasst.
    </p>
  )
}

export function AppFontFamiliesDescription() {
  return (
    <p style={descriptionStyle}>
      Familien bündeln alle Schnitte einer Schriftfamilie. Eine verwaltete Familie verbindet hochgeladene
      Regular-, Bold-, Italic- oder Variable-Font-Assets. Eine Adobe-Familie verweist auf ein offizielles Adobe
      Fonts Web Project. Bereite Familien werden in den Einstellungen semantischen Rollen zugewiesen.
    </p>
  )
}

export function AppFontSettingsDescription() {
  return (
    <p style={descriptionStyle}>
      Die Einstellungen steuern, welche Fontfamilien die Anwendung verwendet. Weise Familien den Rollen Primary,
      Secondary, Display, Mono oder eigenen Rollen zu und definiere Fallbacks sowie Ausgabeziele. Erst die
      Aktion „Font-Set veröffentlichen“ erzeugt eine neue unveränderliche Revision und aktiviert sie. Nicht
      gespeicherte oder unveröffentlichte Änderungen wirken sich nicht auf die laufende Anwendung aus. Nur Primary ist verpflichtend; Secondary
      übernimmt ohne eigene Zuweisung Primary. Nach allen gewählten Familien folgt automatisch die lokal gebündelte
      Inter Variable, dann statische Inter und zuletzt der generische System-Fallback.
    </p>
  )
}

export function AppFontSnapshotsDescription() {
  return (
    <p style={descriptionStyle}>
      Veröffentlichte Font-Sets sind unveränderliche Fontkonfigurationen. Jede Revision hält die exakten
      Asset-Hashes, Familien, Rollenzuweisungen, die gepinnte Inter-Fallbackversion, CSS- und Server-Bundles fest.
      Damit bleiben Ausgaben reproduzierbar
      und die Aktivierung einer früheren Revision nachvollziehbar. Revisionen entstehen ausschließlich durch
      „Font-Set veröffentlichen“ in den Einstellungen und werden niemals direkt bearbeitet.
    </p>
  )
}

