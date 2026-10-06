'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { W1PdfEditBlock, googleFontsCssUrl, mergeTextBlocks, splitTextBlock } from '@werk1/w1-system-pdfedit'
import type {
  W1PdfEditRecord,
  W1PdfEditRecordBlock,
  W1PdfEditInput,
  W1PdfEditLabels,
  W1PdfImageEdit,
  W1PdfImagePick,
} from '@werk1/w1-system-pdfedit/types'
import type { ReactNode } from 'react'

/**
 * The pdfedit overlay editor for one document: loads the prepared input from
 * `/api/pdfedit-data`, renders `W1PdfEditBlock` and persists every callback
 * through `/api/pdfedit-records`, `/api/pdfedit-textmodel`, `/api/pdfedit-pdf`
 * and `/api/pdfedit-images`. It is the only editor page: the start page mounts
 * it after an admin login (`PdfeditEditView`).
 *
 * The component keeps a local copy of `input.records` so edits feel instant;
 * the package only emits changes — this component is the persistence adapter.
 */

export type PdfeditMediaPicker = {
  pickFromMedia: () => Promise<W1PdfImagePick | null>
  uploadMedia: () => Promise<W1PdfImagePick | null>
  drawers: ReactNode
}

const LABELS: W1PdfEditLabels = {
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
  editTexts: 'Texte bearbeiten',
  hideTexts: 'Texte ausblenden',
  charLimit: (max) => `Max. ${max} Zeichen`,
  charOverflow: (max) => `Mehr als ${max} Zeichen: der Rest wird beim Aktualisieren des PDFs abgeschnitten`,
  applyPdf: 'PDF aktualisieren',
  applyPdfBusy: 'PDF wird aktualisiert …',
  styleBar: 'Stile des PDFs',
  dropStylesHint: 'Achtung: Stile gehen verloren, wenn der Text hier im Panel geändert wird. Zum Behalten den Text direkt über dem PDF bearbeiten.',
  dropStylesConfirm: 'Wenn du den Text hier änderst, gehen die Stile dieses Blocks verloren (fett, Farbe usw.). Zum Behalten den Text über dem PDF bearbeiten. Trotzdem ändern?',
  styleReset: 'Blockstil',
  frameMove: 'Textrahmen verschieben',
  frameReset: 'Zurück zum ursprünglichen Rahmen',
  textCut: (count) => `Text wird abgeschnitten: ${count} Zeichen passen nicht in den Rahmen`,
  fontUnknown: 'Keine Schriftinformation im PDF: Text in Standarddarstellung.',
  fontMissing: (family) => `Schrift „${family}“ ist hier nicht verfügbar: Ersatzschrift.`,
  pagesStatus: (first, last, count) => `Seiten ${first}–${last} / ${count}`,
  viewDouble: 'Doppelseite',
  viewSingle: 'Einzelseite',
  mergeStart: 'Blöcke verbinden',
  mergeBlocks: (count) => `Blöcke verbinden (${count})`,
  mergeCancel: 'Abbrechen',
  mergeBlockedByRecord: (name) => `Dieser Block gehört zum Datensatz „${name}“. Blöcke lassen sich nur verbinden, wenn sie keinem Datensatz angehören.`,
  mergeHint: 'Blöcke auswählen, dann erneut „Blöcke verbinden“ klicken. Blöcke, die einem Datensatz zugeordnet sind, lassen sich nicht verbinden.',
  splitBlock: 'Verbundenen Block trennen',
  splitHint: 'Verbundener Block: „Trennen“ stellt die Ursprungsblöcke wieder her.',
  splitBlockedByRecord: (name) => `Dieser verbundene Block gehört zum Datensatz „${name}“ und lässt sich nicht trennen. Zuerst aus dem Datensatz entfernen.`,
  restorePage: 'Seite auf Original zurücksetzen',
  restoreConfirm: (page) => `Seite ${page} auf das Original zurücksetzen? Alle bearbeiteten Texte dieser Seite gehen verloren (im PDF und in den Datensätzen). Das macht keinen einzelnen Schritt rückgängig.`,
  restorePdf: 'Original-PDF wiederherstellen',
  restorePdfConfirm: 'Das gesamte PDF auf das Original zurücksetzen? Alle bearbeiteten Texte und ersetzten oder entfernten Bilder im ganzen Dokument gehen verloren (im PDF und in den Datensätzen). Das macht keinen einzelnen Schritt rückgängig.',
  previewOriginal: 'Vorschau: Original',
  previewEdited: 'Vorschau: Bearbeitet',
  downloadEdited: 'Bearbeitetes PDF',
  dragBlock: 'Ziehen: Reihenfolge ändern oder in einen anderen Datensatz verschieben',
  noBlocks: 'Noch keine Blöcke: Blöcke auf der Seite anklicken und hier zuordnen.',
  selectionCount: (n) => (n === 1 ? '1 Block ausgewählt' : `${n} Blöcke ausgewählt`),
  addSelectedToRecord: (n) => `Ausgewählte Blöcke zum Datensatz hinzufügen (${n})`,
  addAllToRecord: (n) => `Alle freien Blöcke dieser Seite zum Datensatz hinzufügen (${n})`,
  newRecordFromSelection: 'Neuer Datensatz aus Auswahl',
  clearSelection: 'Auswahl aufheben',
  imageEdit: 'Bild bearbeiten',
  imageFromMedia: 'Aus Medien wählen',
  imageUpload: 'In Medien hochladen',
  imageAdjust: 'Verschieben / Skalieren',
  imageReset: 'Original wiederherstellen',
  imageRemove: 'Bild entfernen',
  imageRemoved: 'Bild entfernt',
  imageStack: (index, count) => `Bild ${index} von ${count} an dieser Stelle`,
  imageOk: 'OK',
  imageCancel: 'Abbrechen',
  imageSharedWarning: 'Dieses Bild kommt mehrfach im PDF vor: ersetzt wird nur diese Stelle, die anderen bleiben unverändert.',
  imageLockHint: 'Bild ziehen: im Rahmen verschieben · Mausrad / Regler: zoomen (um den Mauszeiger) · Ecken: Rahmengröße · ✥: Rahmen verschieben · Pfeiltasten: Bild, Alt+Pfeiltasten: Rahmen',
  imageMoveContainer: 'Rahmen verschieben',
  imageZoom: 'Zoom',
  imageFit: 'Einpassen',
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

export function PdfeditWorkspace({ docId, media }: { docId: string; media: PdfeditMediaPicker }) {
  const [input, setInput] = useState<W1PdfEditInput | null>(null)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [activeId, setActiveId] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const { pickFromMedia, uploadMedia, drawers } = media

  const loadInput = useCallback(async (id: string) => {
    const r = await fetch(`/api/pdfedit-data?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
    // An empty or broken body (the server restarting) is reported as such, not as a JSON syntax error.
    const data = await r.json().catch(() => null)
    if (!r.ok || !data) throw new Error(data?.error?.message ?? `Der Server hat nicht geantwortet (HTTP ${r.status}). Bitte neu laden.`)
    setInput(data.input as W1PdfEditInput)
  }, [])

  useEffect(() => {
    setInput(null)
    setError('')
    loadInput(docId).catch((e: Error) => setError(e.message))
  }, [docId, loadInput])

  // The editor's overlay mimics the PDF fonts; load them from Google Fonts.
  const fontsUrl = useMemo(() => (input ? googleFontsCssUrl(input.textModel) : null), [input])
  useEffect(() => {
    if (!fontsUrl || document.querySelector(`link[data-pdfedit-fonts][href="${fontsUrl}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontsUrl
    link.dataset.pdfeditFonts = ''
    document.head.appendChild(link)
  }, [fontsUrl])

  /** Writes the edited texts into the PDF (apply) or restores one page. */
  const runPdfUpdate = useCallback(
    async (body: { action: 'apply' } | { action: 'restore'; pageIndex: number } | { action: 'restore-all' }) => {
      setPdfBusy(true)
      setStatus(LABELS.applyPdfBusy ?? '')
      try {
        const result = (await postJson('/api/pdfedit-pdf', 'POST', { pdfeditId: docId, ...body })) as {
          applied: string[]
          skipped: Array<{ blockId: string; reason: string }>
          warnings: string[]
          editedPageIndexes: number[]
          appliedImages?: string[]
          skippedImages?: Array<{ imageId: string; reason: string }>
        }
        await loadInput(docId)
        const parts = [
          body.action === 'restore'
            ? `Seite ${body.pageIndex + 1} wiederhergestellt`
            : body.action === 'restore-all'
              ? 'Original-PDF wiederhergestellt'
              : `PDF aktualisiert: ${result.applied.length} Text(e)`,
          result.editedPageIndexes.length ? `Seiten: ${result.editedPageIndexes.map((i) => i + 1).join(', ')}` : '',
          result.skipped.length ? `${result.skipped.length} nicht ersetzbar (Text im Formular-Objekt, gedreht oder nicht gefunden)` : '',
          result.appliedImages?.length ? `${result.appliedImages.length} Bild(er) ersetzt` : '',
          result.skippedImages?.length ? `${result.skippedImages.length} Bild(er) nicht ersetzbar (${result.skippedImages.map((s) => s.reason).join(', ')})` : '',
          ...result.warnings,
        ].filter(Boolean)
        setStatus(parts.join(' · '))
      } catch (e) {
        setStatus(`Fehler: ${(e as Error).message}`)
      } finally {
        setPdfBusy(false)
      }
    },
    [docId, loadInput],
  )

  /** Replaces or appends a record in local state (keeps `order` sorting intact). */
  const upsertLocal = useCallback((record: W1PdfEditRecord) => {
    setInput((current) => {
      if (!current) return current
      const rest = current.records.filter((r) => r.id !== record.id)
      return { ...current, records: [...rest, record] }
    })
  }, [])

  /** Merges/splits text blocks on the server, then mirrors the change locally. */
  const editBlocks = useCallback(
    async (body: { op: 'merge'; blockIds: string[] } | { op: 'split'; blockId: string }) => {
      try {
        await postJson('/api/pdfedit-textmodel', 'POST', { pdfeditId: docId, ...body })
        setInput((current) => {
          if (!current) return current
          let model = current.textModel
          if (body.op === 'merge') model = mergeTextBlocks(model, body.blockIds)
          else if (body.op === 'split') model = splitTextBlock(model, body.blockId)
          return { ...current, textModel: model }
        })
      } catch (e) {
        setStatus(`Fehler: ${(e as Error).message}`)
      }
    },
    [docId],
  )

  const persistRecord = useCallback(
    async (record: W1PdfEditRecord) => {
      await postJson('/api/pdfedit-records', 'POST', { pdfeditId: docId, record })
      setStatus(LABELS.recordSaved)
    },
    [docId],
  )

  const onRecordSave = useCallback(
    (record: W1PdfEditRecord) => {
      upsertLocal(record)
      setStatus(LABELS.recordUnsaved)
      void persistRecord(record).catch((e: Error) => setStatus(`Fehler: ${e.message}`))
    },
    [persistRecord, upsertLocal],
  )

  const onRecordCreate = useCallback(
    ({ pageIndex, blocks }: { pageIndex: number; blocks: W1PdfEditRecordBlock[] }) => {
      if (!input) return
      const order = input.records.reduce((max, r) => Math.max(max, r.order), -1) + 1
      void postJson('/api/pdfedit-records', 'POST', {
        pdfeditId: docId,
        record: { order, pageIndex, blocks },
      })
        .then(({ record }) => {
          if (record && typeof record === 'object') {
            upsertLocal(record as W1PdfEditRecord)
            setActiveId((record as W1PdfEditRecord).id)
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
      void postJson('/api/pdfedit-records', 'DELETE', { recordId }).catch(
        (e: Error) => setStatus(`Fehler: ${e.message}`),
      )
    },
    [],
  )

  const onRecordReorder = useCallback(
    (ids: string[]) => {
      if (!input) return
      const byId = new Map(input.records.map((r) => [r.id, r]))
      const reordered = ids
        .map((id, index) => {
          const r = byId.get(id)
          return r ? { ...r, order: index } : null
        })
        .filter((r): r is W1PdfEditRecord => r !== null)
      setInput({ ...input, records: reordered })
      void postJson('/api/pdfedit-records', 'PATCH', { pdfeditId: docId, ids }).catch(
        (e: Error) => setStatus(`Fehler: ${e.message}`),
      )
    },
    [docId, input],
  )

  /** Stores an image replacement (optimistic), reloads the input when the server refuses it. */
  const onImageEditSave = useCallback(
    (edit: W1PdfImageEdit) => {
      setInput((current) =>
        current ? { ...current, imageEdits: [...(current.imageEdits ?? []).filter((e) => e.imageId !== edit.imageId), edit] } : current,
      )
      void postJson('/api/pdfedit-images', 'POST', {
        pdfeditId: docId,
        edit: {
          imageId: edit.imageId,
          mediaId: edit.mediaId,
          rect: edit.rect,
          ...(edit.remove ? { remove: true } : { zoom: edit.zoom, panX: edit.panX, panY: edit.panY }),
        },
      })
        // The page preview is a raster: the replacement only shows up for real once the PDF is written.
        .then(() => runPdfUpdate({ action: 'apply' }))
        .catch((e: Error) => {
          setStatus(`Fehler: ${e.message}`)
          void loadInput(docId).catch(() => undefined)
        })
    },
    [docId, loadInput, runPdfUpdate],
  )

  const onImageEditReset = useCallback(
    (imageId: string) => {
      setInput((current) =>
        current ? { ...current, imageEdits: (current.imageEdits ?? []).filter((e) => e.imageId !== imageId) } : current,
      )
      void postJson('/api/pdfedit-images', 'DELETE', { pdfeditId: docId, imageId })
        .then(() => runPdfUpdate({ action: 'apply' }))
        .catch((e: Error) => {
          setStatus(`Fehler: ${e.message}`)
          void loadInput(docId).catch(() => undefined)
        })
    },
    [docId, loadInput, runPdfUpdate],
  )

  const exportCsv = useMemo(
    () => `/api/pdfedit-export?id=${encodeURIComponent(docId)}&format=csv`,
    [docId],
  )
  const exportJson = useMemo(
    () => `/api/pdfedit-export?id=${encodeURIComponent(docId)}&format=json`,
    [docId],
  )

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Pdfedit</h2>
        <p>Fehler: {error}</p>
      </div>
    )
  }

  if (!input) {
    return <div style={{ padding: 24 }}>{LABELS.loading}</div>
  }

  return (
    // Whole page fits the viewport height (like the flipbook reader): the
    // block runs in `fill` mode inside a viewport-sized column.
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 480 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <a href={exportCsv}>CSV</a>
        <a href={exportJson}>JSON</a>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
      <W1PdfEditBlock
        fill
        input={{ ...input, config: { ...input.config, mode: 'capture' } }}
        labels={LABELS}
        recordId={activeId}
        onRecordChange={setActiveId}
        onRecordCreate={onRecordCreate}
        onRecordDelete={onRecordDelete}
        onRecordReorder={onRecordReorder}
        onRecordSave={onRecordSave}
        onMergeBlocks={(blockIds) => void editBlocks({ op: 'merge', blockIds })}
        onSplitBlock={(blockId) => void editBlocks({ op: 'split', blockId })}
        onApplyPdf={() => void runPdfUpdate({ action: 'apply' })}
        onRestorePage={(pageIndex) => void runPdfUpdate({ action: 'restore', pageIndex })}
        onRestorePdf={() => void runPdfUpdate({ action: 'restore-all' })}
        onPickImageFromMedia={pickFromMedia}
        onUploadImage={uploadMedia}
        onImageEditSave={onImageEditSave}
        onImageEditReset={onImageEditReset}
        pdfBusy={pdfBusy}
        status={<span>{status}</span>}
      />
      </div>
      {drawers}
    </div>
  )
}
