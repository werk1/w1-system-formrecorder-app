'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { W1FormRecorderBlock } from '@werk1/w1-system-formrecorder'
import type {
  W1FormRecord,
  W1FormRecordBlock,
  W1FormRecorderInput,
  W1FormRecorderLabels,
} from '@werk1/w1-system-formrecorder/types'

/**
 * Payload admin view `/admin/formrecorder`: the formrecorder overlay editor.
 * Loads the prepared input from `/api/formrecorder-data`, renders
 * `W1FormRecorderBlock` and persists every callback through
 * `/api/formrecorder-records` (upsert/reorder/delete).
 *
 * The component keeps a local copy of `input.records` so edits feel instant;
 * the package only emits changes — this view is the persistence adapter.
 */

type ListEntry = { id: string; title: string }

const LABELS: W1FormRecorderLabels = {
  previous: 'Zurück',
  next: 'Weiter',
  pageStatus: (page, count) => `Seite ${page} / ${count}`,
  modeRead: 'Lesen',
  modeCapture: 'Erfassen',
  loading: 'PDF-Reader lädt…',
  records: 'Datensätze',
  moveUp: 'Nach oben',
  moveDown: 'Nach unten',
  captureHint: 'Textblöcke anklicken, dann einem Datensatz zuordnen – oder einen Block auf einen Datensatz ziehen',
  addRecord: 'Datensatz anlegen',
  deleteRecord: 'Datensatz löschen',
  recordSaved: 'Gespeichert',
  recordUnsaved: 'Ungespeicherte Änderungen',
  openPdf: 'PDF öffnen',
  imageError: 'Seite konnte nicht geladen werden',
  retry: 'Erneut versuchen',
  recordName: 'Name',
  recordNamePlaceholder: 'Name des Datensatzes',
  blockNamePlaceholder: 'Blockname (z. B. Hotel, Adresse)',
  blockTextLabel: 'Text',
  removeBlock: 'Block entfernen',
  showTexts: 'Texte einblenden',
  hideTexts: 'Texte ausblenden',
  charLimit: (max) => `Max. ${max} Zeichen`,
  dragBlock: 'Ziehen: Reihenfolge ändern oder in einen anderen Datensatz verschieben',
  noBlocks: 'Noch keine Blöcke: Blöcke auf der Seite anklicken und hier zuordnen.',
  selectionCount: (n) => (n === 1 ? '1 Block ausgewählt' : `${n} Blöcke ausgewählt`),
  addToRecord: 'Zum aktiven Datensatz',
  newRecordFromSelection: 'Neuer Datensatz aus Auswahl',
  clearSelection: 'Auswahl aufheben',
}

async function postJson(url: string, method: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error((detail as { error?: { message?: string } } | null)?.error?.message ?? `${method} ${res.status}`)
  }
  return (await res.json()) as Record<string, unknown>
}

export function FormrecorderEditor() {
  const searchParams = useSearchParams()
  const [list, setList] = useState<ListEntry[]>([])
  const [docId, setDocId] = useState<string | null>(searchParams.get('doc'))
  const [input, setInput] = useState<W1FormRecorderInput | null>(null)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [activeId, setActiveId] = useState('')

  useEffect(() => {
    void fetch('/api/formrecorders?limit=100&depth=0&sort=title', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data: { docs?: Array<{ id: string | number; title?: string }> }) => {
        setList(
          (data.docs ?? []).map((d) => ({ id: String(d.id), title: d.title ?? String(d.id) })),
        )
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!docId) return
    setError('')
    void fetch(`/api/formrecorder-data?id=${encodeURIComponent(docId)}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data?.error?.message ?? `HTTP ${r.status}`)
        setInput(data.input as W1FormRecorderInput)
      })
      .catch((e: Error) => setError(e.message))
  }, [docId])

  /** Replaces or appends a record in local state (keeps `order` sorting intact). */
  const upsertLocal = useCallback((record: W1FormRecord) => {
    setInput((current) => {
      if (!current) return current
      const rest = current.records.filter((r) => r.id !== record.id)
      return { ...current, records: [...rest, record] }
    })
  }, [])

  const persistRecord = useCallback(
    async (record: W1FormRecord) => {
      if (!docId) return
      await postJson('/api/formrecorder-records', 'POST', { formrecorderId: docId, record })
      setStatus(LABELS.recordSaved)
    },
    [docId],
  )

  const onRecordSave = useCallback(
    (record: W1FormRecord) => {
      upsertLocal(record)
      setStatus(LABELS.recordUnsaved)
      void persistRecord(record).catch((e: Error) => setStatus(`Fehler: ${e.message}`))
    },
    [persistRecord, upsertLocal],
  )

  const onRecordCreate = useCallback(
    ({ pageIndex, blocks }: { pageIndex: number; blocks: W1FormRecordBlock[] }) => {
      if (!docId || !input) return
      const order = input.records.reduce((max, r) => Math.max(max, r.order), -1) + 1
      void postJson('/api/formrecorder-records', 'POST', {
        formrecorderId: docId,
        record: { order, pageIndex, blocks },
      })
        .then(({ record }) => {
          if (record && typeof record === 'object') {
            upsertLocal(record as W1FormRecord)
            setActiveId((record as W1FormRecord).id)
          }
        })
        .catch((e: Error) => setStatus(`Fehler: ${e.message}`))
    },
    [docId, input, upsertLocal],
  )

  const onRecordDelete = useCallback(
    (recordId: string) => {
      setInput((current) =>
        current ? { ...current, records: current.records.filter((r) => r.id !== recordId) } : current,
      )
      void postJson('/api/formrecorder-records', 'DELETE', { recordId }).catch(
        (e: Error) => setStatus(`Fehler: ${e.message}`),
      )
    },
    [],
  )

  const onRecordReorder = useCallback(
    (ids: string[]) => {
      if (!docId || !input) return
      const byId = new Map(input.records.map((r) => [r.id, r]))
      const reordered = ids
        .map((id, index) => {
          const r = byId.get(id)
          return r ? { ...r, order: index } : null
        })
        .filter((r): r is W1FormRecord => r !== null)
      setInput({ ...input, records: reordered })
      void postJson('/api/formrecorder-records', 'PATCH', { formrecorderId: docId, ids }).catch(
        (e: Error) => setStatus(`Fehler: ${e.message}`),
      )
    },
    [docId, input],
  )

  const exportCsv = useMemo(
    () => (docId ? `/api/formrecorder-export?id=${encodeURIComponent(docId)}&format=csv` : '#'),
    [docId],
  )
  const exportJson = useMemo(
    () => (docId ? `/api/formrecorder-export?id=${encodeURIComponent(docId)}&format=json` : '#'),
    [docId],
  )

  if (!docId) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h2>Formrecorder</h2>
        <p>Dokument wählen:</p>
        <ul style={{ lineHeight: 2 }}>
          {list.map((entry) => (
            <li key={entry.id}>
              <a href={`/admin/formrecorder?doc=${entry.id}`} onClick={(e) => { e.preventDefault(); setDocId(entry.id) }}>
                {entry.title}
              </a>
            </li>
          ))}
          {list.length === 0 ? <li>Keine Formrecorder vorhanden.</li> : null}
        </ul>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Formrecorder</h2>
        <p>Fehler: {error}</p>
        <button type="button" onClick={() => { setDocId(null); setInput(null); setError('') }}>
          Zurück zur Auswahl
        </button>
      </div>
    )
  }

  if (!input) {
    return <div style={{ padding: 24 }}>{LABELS.loading}</div>
  }

  return (
    // Whole page fits the viewport height (like the flipbook reader): the
    // block runs in `fill` mode inside a viewport-sized column.
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 96px)', minHeight: 480 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <button type="button" onClick={() => { setDocId(null); setInput(null) }}>
          ← Auswahl
        </button>
        <a href={exportCsv}>CSV</a>
        <a href={exportJson}>JSON</a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
      <W1FormRecorderBlock
        fill
        input={{ ...input, config: { ...input.config, mode: 'capture' } }}
        labels={LABELS}
        recordId={activeId}
        onRecordChange={setActiveId}
        onRecordCreate={onRecordCreate}
        onRecordDelete={onRecordDelete}
        onRecordReorder={onRecordReorder}
        onRecordSave={onRecordSave}
        status={<span>{status}</span>}
      />
      </div>
    </div>
  )
}
