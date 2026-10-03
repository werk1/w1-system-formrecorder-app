export function AppFontSystemFallbackHint() {
  return (
    <div className="field-type app-font-system-fallback" aria-label="Automatischer System-Fallback">
      <div className="field-label">Automatischer System-Fallback</div>
      <div className="app-font-system-fallback__control" aria-disabled="true">
        <span>Inter Variable</span>
        <span aria-hidden="true">→</span>
        <span>Inter Static</span>
        <span aria-hidden="true">→</span>
        <span>system-ui</span>
        <span aria-hidden="true">→</span>
        <span>sans-serif</span>
      </div>
      <div className="field-description">
        Wird automatisch nach den oben gewählten Fallback-Familien angefügt und kann nicht entfernt werden.
      </div>
    </div>
  )
}

