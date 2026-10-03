'use client'

import { Banner, Button, SelectInput, useFormModified } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

type ActionState =
  | { status: 'idle' }
  | { status: 'working'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; issues?: AppFontIssue[] }

type SnapshotHistory = {
  snapshotId: string
  revision: number
  publishedAt: string
  current: boolean
}

type PreviewNumericRange = { min: number; default: number; max: number }
type PreviewFace = {
  faceId: string
  label: string
  weight: PreviewNumericRange
  style: 'normal' | 'italic' | 'oblique'
  stretch: PreviewNumericRange
  variableAxes: Array<PreviewNumericRange & { tag: string; name?: string }>
  published: boolean
}
type PreviewFontSetRole = {
  roleKey: string
  roleLabel: string
  familyName: string
  publishesAllFaces: boolean
  faces: PreviewFace[]
  weightSubstitutions: Array<{ requestedWeight: number; replacementWeight: number }>
}
type AppFontIssue = {
  code?: string
  message: string
  path?: string
}

export function AppFontPublishAction() {
  const formModified = useFormModified()
  const [state, setState] = useState<ActionState>({ status: 'idle' })
  const [previewCss, setPreviewCss] = useState('')
  const [previewRoles, setPreviewRoles] = useState<string[]>([])
  const [previewFontSetRoles, setPreviewFontSetRoles] = useState<PreviewFontSetRole[]>([])
  const [history, setHistory] = useState<SnapshotHistory[]>([])
  const [rollbackSnapshotId, setRollbackSnapshotId] = useState('')

  useEffect(() => {
    void loadHistory()
  }, [])

  useEffect(() => {
    if (!formModified) return
    setPreviewCss('')
    setPreviewRoles([])
    setPreviewFontSetRoles([])
    setState({ status: 'idle' })
  }, [formModified])

  async function loadHistory() {
    const response = await fetch('/api/app-fonts/history', { credentials: 'same-origin', cache: 'no-store' })
    const body = await response.json().catch(() => null) as { snapshots?: SnapshotHistory[] } | null
    if (response.ok) setHistory(body?.snapshots ?? [])
  }

  async function validateDraft() {
    setState({ status: 'working', message: 'Das gespeicherte Font-Set wird geprüft …' })
    try {
      const response = await fetch('/api/app-fonts/preview', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const body = await response.json().catch(() => null) as {
        css?: string
        roles?: string[]
        fontSetRoles?: PreviewFontSetRole[]
        error?: string
        issues?: AppFontIssue[]
      } | null
      if (!response.ok || typeof body?.css !== 'string') {
        throw appFontResponseError(body, `Die Validierung ist mit HTTP ${response.status} fehlgeschlagen.`)
      }
      setPreviewCss(body.css)
      setPreviewRoles(body.roles ?? [])
      setPreviewFontSetRoles(body.fontSetRoles ?? [])
      setState({ status: 'success', message: 'Das gespeicherte Font-Set ist vollständig und kann veröffentlicht werden.' })
    } catch (error) {
      setPreviewCss('')
      setPreviewRoles([])
      setPreviewFontSetRoles([])
      setState(errorState(error, 'Die Validierung ist fehlgeschlagen.'))
    }
  }

  async function publish() {
    setState({ status: 'working', message: 'Das Font-Set wird veröffentlicht …' })
    try {
      const response = await fetch('/api/app-fonts/publish', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      })
      const body = await response.json().catch(() => null) as { revision?: number; error?: string; issues?: AppFontIssue[] } | null
      if (!response.ok) throw appFontResponseError(body, `Die Veröffentlichung ist mit HTTP ${response.status} fehlgeschlagen.`)
      await loadHistory()
      setState({
        status: 'success',
        message: `${typeof body?.revision === 'number' ? `Font-Set Revision ${body.revision}` : 'Das neue Font-Set'} wurde veröffentlicht und ist jetzt aktiv. Lade das Frontend neu, um es zu verwenden.`,
      })
    } catch (error) {
      setState(errorState(error, 'Die Veröffentlichung ist fehlgeschlagen.'))
    }
  }

  async function rollback() {
    if (!rollbackSnapshotId) return
    setState({ status: 'working', message: 'Das gespeicherte Font-Set wird geprüft und aktiviert …' })
    try {
      const response = await fetch('/api/app-fonts/rollback', {
        method: 'POST',
        body: JSON.stringify({ snapshotId: rollbackSnapshotId }),
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      })
      const body = await response.json().catch(() => null) as { revision?: number; error?: string } | null
      if (!response.ok) throw new Error(body?.error || `Die Aktivierung ist mit HTTP ${response.status} fehlgeschlagen.`)
      setRollbackSnapshotId('')
      await loadHistory()
      setState({
        status: 'success',
        message: `${typeof body?.revision === 'number' ? `Font-Set Revision ${body.revision}` : 'Das gewählte Font-Set'} ist wieder aktiv.`,
      })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Die Aktivierung ist fehlgeschlagen.' })
    }
  }

  const busy = state.status === 'working'
  const selectedSnapshot = history.find((snapshot) => snapshot.snapshotId === rollbackSnapshotId)

  return (
    <div className="app-font-publish">
      <section className="app-font-publish__section">
        <h3>Font-Set prüfen und veröffentlichen</h3>
        <p>Speichere Änderungen zuerst mit dem Payload-Button „Speichern“. Prüfung und Veröffentlichung verwenden ausschließlich das gespeicherte Font-Set.</p>
        {formModified ? (
          <Banner className="app-font-publish__dirty-state" type="info">
            Dieses Font-Set enthält ungespeicherte Änderungen. Speichere es zuerst, um es prüfen oder veröffentlichen zu können.
          </Banner>
        ) : null}
        <div className="app-font-publish__actions">
          <Button buttonStyle="secondary" disabled={busy || formModified} margin={false} onClick={validateDraft}>
            Font-Set prüfen
          </Button>
          <Button disabled={busy || formModified} margin={false} onClick={publish}>
            Font-Set veröffentlichen
          </Button>
        </div>
      </section>

      {previewCss ? (
        <div className="app-font-publish__preview" id="w1-app-font-draft-preview">
          <style>{previewCss}</style>
          <p className="app-font-publish__preview-primary">
            Primary: Franz jagt im komplett verwahrlosten Taxi quer durch Bayern.
          </p>
          <p className="app-font-publish__preview-secondary">
            Secondary: ÄÖÜ äöü ß – 0123456789 · AV To Wa.
          </p>
          <small>Vorschau · Geprüfte Rollen: {previewRoles.join(', ')}</small>
          <section className="app-font-publish__font-set-inventory">
            <h4>Geprüfter Inhalt des Font-Sets</h4>
            <p>Diese Daten stammen aus dem gespeicherten Entwurf und werden unverändert in der nächsten veröffentlichten Revision festgehalten.</p>
            <div className="app-font-publish__font-set-roles">
              {previewFontSetRoles.map((role) => (
                <article className="app-font-publish__font-set-role" key={role.roleKey}>
                  <header>
                    <strong>{role.roleLabel}</strong>
                    <span>{role.familyName}</span>
                  </header>
                  <p>
                    {role.publishesAllFaces
                      ? 'Alle erkannten Schnitte werden veröffentlicht.'
                      : `${role.faces.filter((face) => face.published).length} von ${role.faces.length} erkannten Schnitten werden veröffentlicht.`}
                  </p>
                  <div className="app-font-publish__font-set-faces">
                    {role.faces.map((face) => (
                      <div className={face.published ? '' : 'is-not-published'} key={face.faceId}>
                        <strong>{face.label}</strong>
                        <span>{describePreviewFace(face)}</span>
                        {face.variableAxes.length > 0 ? (
                          <small>{face.variableAxes.map((axis) => `${axis.tag} ${formatPreviewRange(axis)}`).join(' · ')}</small>
                        ) : null}
                        <em>{face.published ? 'veröffentlicht' : 'nicht veröffentlicht'}</em>
                      </div>
                    ))}
                  </div>
                  {role.weightSubstitutions.length > 0 ? (
                    <div className="app-font-publish__font-set-substitutions">
                      <strong>Ersetzungen für fehlende Weights</strong>
                      {role.weightSubstitutions.map((substitution) => (
                        <span key={substitution.requestedWeight}>
                          {substitution.requestedWeight} → {substitution.replacementWeight}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <small>Keine Weight-Ersetzung notwendig.</small>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="app-font-publish__section app-font-publish__history">
          <h3>Gespeichertes Font-Set aktivieren</h3>
          <p>Wähle eine frühere veröffentlichte Revision. Vor der Aktivierung werden Font-Set, CSS und gespeicherte Fontdateien erneut geprüft.</p>
          <SelectInput
            name="app-font-rollback-snapshot"
            path="app-font-rollback-snapshot"
            label="Veröffentlichte Revision"
            value={rollbackSnapshotId}
            isClearable
            options={history.map((snapshot) => ({
              label: `Revision ${snapshot.revision} · ${formatPublishedAt(snapshot.publishedAt)}${snapshot.current ? ' · aktuell' : ''}`,
              value: snapshot.snapshotId,
            }))}
            onChange={(option) => {
              const value = Array.isArray(option) ? option[0]?.value : option?.value
              setRollbackSnapshotId(typeof value === 'string' ? value : '')
            }}
          />
          <div className="app-font-publish__actions">
            <Button
              buttonStyle="secondary"
              disabled={busy || formModified || !rollbackSnapshotId || selectedSnapshot?.current === true}
              margin={false}
              onClick={rollback}
            >
              Gespeichertes Font-Set aktivieren
            </Button>
          </div>
        </section>
      ) : null}

      {state.status === 'working' ? <Banner type="info">{state.message}</Banner> : null}
      {state.status === 'success' ? <Banner type="success">{state.message}</Banner> : null}
      {state.status === 'error' ? (
        <Banner type="error">
          <p>{state.message}</p>
          {state.issues?.length ? (
            <ul>
              {state.issues.map((issue, index) => (
                <li key={`${issue.code ?? 'issue'}-${issue.path ?? index}`}>
                  {issue.path ? `${issue.path}: ` : ''}{issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Banner>
      ) : null}
    </div>
  )
}

function appFontResponseError(
  body: { error?: string; issues?: AppFontIssue[] } | null,
  fallback: string,
): Error & { issues?: AppFontIssue[] } {
  const error = new Error(body?.error || fallback) as Error & { issues?: AppFontIssue[] }
  if (Array.isArray(body?.issues)) error.issues = body.issues
  return error
}

function errorState(error: unknown, fallback: string): Extract<ActionState, { status: 'error' }> {
  const maybeIssues = error as { issues?: unknown }
  return {
    status: 'error',
    message: error instanceof Error ? error.message : fallback,
    ...(Array.isArray(maybeIssues.issues) ? { issues: maybeIssues.issues as AppFontIssue[] } : {}),
  }
}

function formatPublishedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function describePreviewFace(face: PreviewFace): string {
  return `Weight ${formatPreviewRange(face.weight)} · ${styleLabel(face.style)} · Stretch ${formatPreviewRange(face.stretch)} · ${face.variableAxes.length > 0 ? 'Variable Font' : 'statisch'}`
}

function formatPreviewRange(range: PreviewNumericRange): string {
  return range.min === range.max ? String(range.default) : `${range.min}–${range.max}`
}

function styleLabel(style: PreviewFace['style']): string {
  if (style === 'italic') return 'kursiv'
  if (style === 'oblique') return 'schräg'
  return 'normal'
}
