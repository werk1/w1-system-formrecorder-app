import path from 'path'
import { NextResponse } from 'next/server'
import type { Payload } from 'payload'
import type { W1PdfEditRecord } from '@werk1/w1-system-pdfedit/types'
import { relationId } from '@/lib/flipbook/payloadFlipbookConversion'

/**
 * Shared loading of the pdfedit endpoints and services: the pdfedit document,
 * its flipbook, its records and files of the media collection. One place for
 * the defensive reads instead of a copy per route.
 */

export type IdLike = string | number

export type PdfeditDoc = {
  id: IdLike
  title?: unknown
  slug?: unknown
  flipbook?: unknown
  originalPdf?: unknown
  editedPdf?: unknown
  editedPages?: Array<{ pageIndex?: unknown; image?: unknown; width?: unknown; height?: unknown }> | null
  editedRevision?: unknown
  imageEdits?: unknown
  manifestUrl?: unknown
  manifestPdf?: unknown
  manifestMedia?: unknown
}

export type FlipbookDoc = {
  id: IdLike
  title?: unknown
  slug?: unknown
  publishedSourcePdf?: unknown
  publishedRevision?: unknown
  overrideSource?: unknown
  textModel?: unknown
  imageModel?: unknown
  pages?: Array<{ image?: unknown; width?: unknown; height?: unknown; label?: unknown }> | null
}

export type MediaDoc = { id: IdLike; filename?: unknown; alt?: unknown; mimeType?: unknown; generatedRevision?: unknown; url?: unknown }

export const errorJson = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status })

/** Upload directory of the media collection, or `null` when it has none. */
export const mediaStaticDir = (payload: Payload): string | null => payload.collections.media?.config?.upload?.staticDir ?? null

export const findMedia = (payload: Payload, id: IdLike): Promise<MediaDoc | null> =>
  payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true }).catch(() => null) as Promise<MediaDoc | null>

/** Absolute path of a media file, or `null` when the media, its file name or the upload directory is missing. */
export function mediaPath(payload: Payload, media: MediaDoc | null): string | null {
  const dir = mediaStaticDir(payload)
  return dir && media && typeof media.filename === 'string' && media.filename ? path.join(dir, media.filename) : null
}

export const loadPdfedit = (payload: Payload, id: IdLike): Promise<PdfeditDoc | null> =>
  payload.findByID({ collection: 'pdfedits' as never, id, depth: 0, overrideAccess: true }).catch(() => null) as Promise<PdfeditDoc | null>

export async function loadFlipbookOf(payload: Payload, doc: PdfeditDoc): Promise<FlipbookDoc | null> {
  const flipbookId = relationId(doc.flipbook)
  if (!flipbookId) return null
  return (await payload
    .findByID({ collection: 'flipbooks' as never, id: flipbookId, depth: 0, overrideAccess: true })
    .catch(() => null)) as FlipbookDoc | null
}

/** A stored record in the package shape. */
export const toRecord = (r: Record<string, unknown>): W1PdfEditRecord => ({
  id: String(r.id),
  order: typeof r.order === 'number' ? r.order : 0,
  ...(typeof r.name === 'string' && r.name ? { name: r.name } : {}),
  pageIndex: typeof r.pageIndex === 'number' ? r.pageIndex : undefined,
  blocks: Array.isArray(r.blocks) ? (r.blocks as W1PdfEditRecord['blocks']) : [],
})

/** The records of a pdfedit in export order. */
export async function loadRecords(payload: Payload, pdfeditId: IdLike): Promise<W1PdfEditRecord[]> {
  const { docs } = await payload.find({
    collection: 'pdfeditrecords' as never,
    where: { pdfedit: { equals: pdfeditId } } as never,
    sort: 'order',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return (docs as unknown as Array<Record<string, unknown>>).map(toRecord)
}

const chains = new Map<string, Promise<unknown>>()

/**
 * Runs `task` after every earlier task of the same key has finished: a
 * read-modify-write of one document (its `imageEdits`) never interleaves with
 * another. In-process only — several app instances need a database lock.
 */
export function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(task)
  const tail = run.catch(() => undefined)
  chains.set(key, tail)
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key)
  })
  return run
}

export const imageEditsKey = (pdfeditId: IdLike) => `pdfedit-image-edits:${String(pdfeditId)}`
