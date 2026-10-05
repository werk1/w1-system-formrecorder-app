'use client'

import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { W1PdfImagePick } from '@werk1/w1-system-pdfedit/types'
import type { PdfeditMediaPicker } from './PdfeditWorkspace'

/** Image types accepted by `/api/pdfedit-images` (WebP is converted when the PDF is updated). */
const PLACEABLE_MIME = ['image/jpeg', 'image/png', 'image/webp']

type MediaDoc = { id: string | number; filename?: string; alt?: string; url?: string; sizes?: { thumb?: { url?: string } } }
type Resolver = (pick: W1PdfImagePick | null) => void

const toPick = (doc: MediaDoc): W1PdfImagePick | null =>
  doc.filename ? { mediaId: String(doc.id), mediaUrl: `/api/media/file/${encodeURIComponent(doc.filename)}` } : null

/**
 * Frontend counterpart of the admin `usePdfeditMediaPicker`: the Payload
 * drawers need the admin providers, which the start page does not have. This
 * one lists `/api/media` (JPEG/PNG/WebP) in a plain dialog and uploads through
 * the REST API with the login cookie. Same contract: both functions resolve
 * with the chosen image or `null`.
 */
export function useFrontendMediaPicker(): PdfeditMediaPicker {
  const pending = useRef<Resolver | null>(null)
  const [docs, setDocs] = useState<MediaDoc[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const settle = useCallback((pick: W1PdfImagePick | null) => {
    const resolve = pending.current
    pending.current = null
    setOpen(false)
    resolve?.(pick)
  }, [])

  const ask = useCallback(
    (start: () => void) =>
      new Promise<W1PdfImagePick | null>((resolve) => {
        pending.current?.(null)
        pending.current = resolve
        start()
      }),
    [],
  )

  const pickFromMedia = useCallback(
    () =>
      ask(() => {
        setError('')
        setDocs(null)
        setOpen(true)
        const params = new URLSearchParams({ limit: '60', depth: '0', sort: '-createdAt' })
        PLACEABLE_MIME.forEach((mime, i) => params.set(`where[or][${i}][mimeType][equals]`, mime))
        void fetch(`/api/media?${params}`, { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then((data: { docs?: MediaDoc[] }) => setDocs(data.docs ?? []))
          .catch((e: Error) => setError(e.message))
      }),
    [ask],
  )

  const uploadMedia = useCallback(
    () =>
      ask(() => {
        const input = fileInput.current
        if (!input) return settle(null)
        input.value = ''
        // A closed file dialog fires `cancel`: resolve with null instead of hanging.
        input.addEventListener('cancel', () => settle(null), { once: true })
        input.click()
      }),
    [ask, settle],
  )

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('_payload', JSON.stringify({ alt: file.name }))
        const res = await fetch('/api/media', { method: 'POST', body: form, credentials: 'same-origin' })
        const data = (await res.json().catch(() => null)) as { doc?: MediaDoc; errors?: Array<{ message?: string }> } | null
        if (!res.ok || !data?.doc) throw new Error(data?.errors?.[0]?.message ?? `HTTP ${res.status}`)
        settle(toPick(data.doc))
      } catch (e) {
        setError((e as Error).message)
        setOpen(true)
        settle(null)
      }
    },
    [settle],
  )

  const drawers: ReactNode = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={PLACEABLE_MIME.join(',')}
        hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {open ? (
        <div style={overlay} onClick={() => settle(null)} role="presentation">
          <div style={dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Aus Medien wählen">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong>Aus Medien wählen</strong>
              <button type="button" onClick={() => settle(null)}>Abbrechen</button>
            </div>
            {error ? <p>Fehler: {error}</p> : null}
            {!docs && !error ? <p>Lädt…</p> : null}
            {docs && docs.length === 0 ? <p>Keine Bilder vorhanden.</p> : null}
            <div style={grid}>
              {(docs ?? []).map((doc) => (
                <button key={String(doc.id)} type="button" style={tile} onClick={() => settle(toPick(doc))} title={doc.filename}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={doc.sizes?.thumb?.url ?? doc.url} alt={doc.alt ?? doc.filename ?? ''} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
                  <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{doc.filename}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )

  return { pickFromMedia, uploadMedia, drawers }
}

const overlay = { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center' } as const
const dialog = { background: 'var(--w1-flipbook-toolbar, #fff)', color: 'inherit', padding: 16, borderRadius: 8, width: 'min(720px, 92vw)', maxHeight: '80vh', overflowY: 'auto' } as const
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 } as const
const tile = { display: 'flex', flexDirection: 'column', gap: 4, padding: 4, textAlign: 'left', cursor: 'pointer', background: 'transparent', border: '1px solid var(--w1-flipbook-border, #b9b5ad)', borderRadius: 4, color: 'inherit' } as const
