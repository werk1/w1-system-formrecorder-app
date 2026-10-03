'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  COLOR_SCHEME_TOKENS,
  DEFAULT_COLOR_SCHEMES,
  isSafeCssValue,
  schemeModePreviewCss,
  type ColorSchemeMode,
  type ColorSchemeTokenKey,
} from '@/lib/theme/colorSchemeTokens'
import styles from './DevTools.module.css'

type Mode = 'light' | 'dark'

interface SchemeDoc {
  id: string
  name: string
  key?: string | null
  light: ColorSchemeMode
  dark: ColorSchemeMode
}

interface Draft {
  id?: string
  name: string
  light: ColorSchemeMode
  dark: ColorSchemeMode
}

const PREVIEW_STYLE_ID = 'dev-color-scheme-preview'
const HEX = /^#[0-9a-f]{6}$/i

function applyPreview(draft: Draft | null, mode: Mode): void {
  let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null
  if (!draft) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('style')
    el.id = PREVIEW_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = schemeModePreviewCss(draft[mode], mode)
}

/**
 * Editor state of this browser session. It outlives the component, so closing
 * and reopening the dev panel (or a toolbar remount on rotation) continues
 * with the chosen scheme, mode and unsaved edits instead of the active scheme.
 */
const session: { draft: Draft | null; mode: Mode | null; preview: boolean; newName: string } = {
  draft: null,
  mode: null,
  preview: true,
  newName: '',
}

function toDraft(doc: SchemeDoc): Draft {
  return { id: doc.id, name: doc.name, light: { ...doc.light }, dark: { ...doc.dark } }
}

/**
 * Dev colour editor (dev tools, tab "Farben"): edits a scheme of the Payload
 * collection "Farbschemata" with a live preview on the real reader and saves
 * it through the REST API (requires an admin login in this browser). The
 * preview forces the edited mode (light/dark) regardless of the system.
 */
export function ColorSchemeEditor() {
  const [schemes, setSchemes] = useState<SchemeDoc[]>([])
  const [draft, setDraft] = useState<Draft | null>(session.draft)
  const [mode, setMode] = useState<Mode>(
    () =>
      session.mode ??
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  )
  const [preview, setPreview] = useState(session.preview)
  const [newName, setNewName] = useState(session.newName)
  const [status, setStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)

  const activeId = typeof document !== 'undefined' ? document.documentElement.dataset.colorSchemeId : undefined

  useEffect(() => {
    Object.assign(session, { draft, mode, preview, newName })
  }, [draft, mode, preview, newName])

  // Load the schemes once; start with the active one unless this session
  // already works on a scheme.
  useEffect(() => {
    let cancelled = false
    fetch('/api/color-schemes?limit=100&depth=0&sort=name', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { docs: SchemeDoc[] }) => {
        if (cancelled) return
        setSchemes(data.docs)
        if (session.draft) return
        const start = data.docs.find((d) => d.id === activeId) ?? data.docs[0]
        setDraft(start ? toDraft(start) : { name: DEFAULT_COLOR_SCHEMES.graphite.name, light: { ...DEFAULT_COLOR_SCHEMES.graphite.light }, dark: { ...DEFAULT_COLOR_SCHEMES.graphite.dark } })
      })
      .catch((error: Error) => !cancelled && setStatus(`Schemata konnten nicht geladen werden (${error.message}).`))
    return () => {
      cancelled = true
    }
  }, [activeId])

  // Live preview of the edited mode on the real page.
  useEffect(() => {
    applyPreview(preview ? draft : null, mode)
  }, [draft, mode, preview])

  const invalid = useMemo(() => {
    if (!draft) return new Set<string>()
    const bad = new Set<string>()
    for (const m of ['light', 'dark'] as Mode[]) {
      for (const { key } of COLOR_SCHEME_TOKENS) if (!isSafeCssValue(draft[m][key])) bad.add(`${m}.${key}`)
    }
    return bad
  }, [draft])

  const setToken = (key: ColorSchemeTokenKey, value: string) => {
    setDraft((d) => (d ? { ...d, [mode]: { ...d[mode], [key]: value } } : d))
    setStatus('')
  }

  const save = async (asNew: boolean) => {
    if (!draft) return
    if (invalid.size > 0) {
      setStatus('Ungültige Werte (rot markiert) – nur Farben oder Verläufe.')
      return
    }
    const name = asNew ? newName.trim() || `${draft.name} Kopie` : draft.name
    setBusy(true)
    setStatus('')
    try {
      const res = await fetch(asNew || !draft.id ? '/api/color-schemes' : `/api/color-schemes/${draft.id}`, {
        method: asNew || !draft.id ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, light: draft.light, dark: draft.dark }),
      })
      if (res.status === 401 || res.status === 403) {
        setStatus('Nicht angemeldet: bitte unter /admin einloggen und erneut speichern.')
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus(`Speichern fehlgeschlagen (${res.status}${data?.errors?.[0]?.message ? `: ${data.errors[0].message}` : ''}).`)
        return
      }
      const doc = data.doc as SchemeDoc
      setSchemes((list) => [...list.filter((s) => s.id !== doc.id), doc].sort((a, b) => a.name.localeCompare(b.name)))
      setDraft(toDraft(doc))
      setNewName('')
      setStatus(
        doc.id === activeId
          ? 'Gespeichert. Aktives Schema – nach dem Neuladen auch ohne Vorschau sichtbar.'
          : 'Gespeichert. Aktivieren in den Seiteneinstellungen (Farbschema).',
      )
    } catch (error) {
      setStatus(`Speichern fehlgeschlagen (${(error as Error).message}).`)
    } finally {
      setBusy(false)
    }
  }

  if (!draft) return <p className={styles.note}>{status || 'Lade Farbschemata …'}</p>

  return (
    <>
      <label className={styles.field}>
        <span className={styles.row}>
          <span>Schema</span>
        </span>
        <select
          value={draft.id ?? ''}
          onChange={(e) => {
            const doc = schemes.find((s) => s.id === e.currentTarget.value)
            if (doc) setDraft(toDraft(doc))
            setStatus('')
          }}
        >
          {schemes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === activeId ? ' (aktiv)' : ''}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.row}>
          <span>Name</span>
        </span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })} />
      </label>

      <div className={styles.segment} role="group" aria-label="Modus">
        {(['light', 'dark'] as Mode[]).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'light' ? 'Hell' : 'Dunkel'}
          </button>
        ))}
        <label className={styles.check}>
          <input type="checkbox" checked={preview} onChange={(e) => setPreview(e.currentTarget.checked)} /> Vorschau
        </label>
      </div>

      {COLOR_SCHEME_TOKENS.map(({ key, label, hint }) => {
        const value = draft[mode][key]
        const bad = invalid.has(`${mode}.${key}`)
        return (
          <label key={key} className={styles.field}>
            <span className={styles.row}>
              <span>{label}</span>
            </span>
            <span className={styles.colorRow}>
              {/* Swatch for plain hex colours; rgba and gradients via the text field. */}
              <input
                type="color"
                aria-label={`${label} wählen`}
                value={HEX.test(value) ? value : '#000000'}
                disabled={!HEX.test(value)}
                onChange={(e) => setToken(key, e.currentTarget.value)}
              />
              <input
                type="text"
                className={bad ? styles.invalid : undefined}
                value={value}
                onChange={(e) => setToken(key, e.currentTarget.value)}
              />
            </span>
            {hint ? <span className={styles.hint}>{hint}</span> : null}
          </label>
        )
      })}

      <div className={styles.actions}>
        <button type="button" disabled={busy || !draft.id} onClick={() => save(false)}>
          Speichern
        </button>
        <button
          type="button"
          onClick={() => {
            const doc = schemes.find((s) => s.id === draft.id)
            if (doc) setDraft(toDraft(doc))
            setStatus('')
          }}
        >
          Verwerfen
        </button>
      </div>
      <div className={styles.colorRow}>
        <input type="text" placeholder="Name für neues Schema" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
        <button type="button" className={styles.inlineButton} disabled={busy} onClick={() => save(true)}>
          Als neues Schema
        </button>
      </div>
      {status ? <p className={styles.status}>{status}</p> : null}
    </>
  )
}
