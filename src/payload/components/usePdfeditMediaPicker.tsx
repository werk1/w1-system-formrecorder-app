'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useDocumentDrawer, useListDrawer } from '@payloadcms/ui'
import type { W1PdfImagePick } from '@werk1/w1-system-pdfedit/types'

/** Image types accepted by `/api/pdfedit-images` (WebP is converted when the PDF is updated). */
const PLACEABLE_MIME = ['image/jpeg', 'image/png', 'image/webp']

// Module-level on purpose: Payload's list drawer re-fetches whenever the
// identity of `filterOptions` changes, so an inline object loops forever.
const LIST_DRAWER_ARGS: Parameters<typeof useListDrawer>[0] = {
  collectionSlugs: ['media'],
  selectedCollection: 'media',
  uploads: true,
  filterOptions: { media: { mimeType: { in: PLACEABLE_MIME } } },
}

type Resolver = (pick: W1PdfImagePick | null) => void

const toPick = (doc: { id?: unknown; filename?: unknown } | undefined): W1PdfImagePick | null =>
  doc && doc.id !== undefined && typeof doc.filename === 'string' && doc.filename
    ? { mediaId: String(doc.id), mediaUrl: `/api/media/file/${encodeURIComponent(doc.filename)}` }
    : null

/**
 * Bridges Payload's media drawers to the promise callbacks of the pdfedit
 * image editor: `pickFromMedia` opens the media list (JPEG/PNG/WebP only),
 * `uploadMedia` the "create media" form. Both resolve with the chosen image,
 * or `null` when the drawer is closed without a choice. Render `drawers`
 * once inside the admin view.
 */
export function usePdfeditMediaPicker(): {
  pickFromMedia: () => Promise<W1PdfImagePick | null>
  uploadMedia: () => Promise<W1PdfImagePick | null>
  drawers: ReactNode
} {
  const pending = useRef<Resolver | null>(null)
  const settle = useCallback((pick: W1PdfImagePick | null) => {
    const resolve = pending.current
    pending.current = null
    resolve?.(pick)
  }, [])

  const [ListDrawer, , list] = useListDrawer(LIST_DRAWER_ARGS)
  const [DocumentDrawer, , create] = useDocumentDrawer({ collectionSlug: 'media' })

  // Closing a drawer without a choice resolves the pending promise with null.
  useEffect(() => {
    if (!list.isDrawerOpen && !create.isDrawerOpen) settle(null)
  }, [list.isDrawerOpen, create.isDrawerOpen, settle])

  const ask = useCallback(
    (open: () => void) =>
      new Promise<W1PdfImagePick | null>((resolve) => {
        settle(null)
        pending.current = resolve
        open()
      }),
    [settle],
  )

  const drawers = (
    <>
      <ListDrawer
        onSelect={({ doc }) => {
          settle(toPick(doc))
          list.closeDrawer()
        }}
      />
      <DocumentDrawer
        // Stay in the editor: by default Payload navigates to the new media page after creating it.
        redirectAfterCreate={false}
        redirectAfterDuplicate={false}
        redirectAfterDelete={false}
        onSave={async ({ doc, result }) => {
          // `result` is not always set; the saved document is the reliable source of the file name.
          let filename = (result as { filename?: unknown } | undefined)?.filename
          if (typeof filename !== 'string' || !filename) {
            const saved = await fetch(`/api/media/${encodeURIComponent(String(doc.id))}?depth=0`, { credentials: 'same-origin' })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
            filename = (saved as { filename?: unknown } | null)?.filename
          }
          settle(toPick({ id: doc.id, filename }))
          create.closeDrawer()
        }}
      />
    </>
  )

  return {
    pickFromMedia: () => ask(list.openDrawer),
    uploadMedia: () => ask(create.openDrawer),
    drawers,
  }
}
