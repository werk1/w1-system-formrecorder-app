import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import type { Payload } from 'payload'
import { buildManifest, chunkPdf, extractPdfData } from '@werk1/w1-system-flipbook/pdf/server'
import { deleteMediaByIds } from '@/lib/flipbook/cleanup'
import { relationId, W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'
import { retryWriteConflict } from './retryWrite'
import { findMedia, mediaPath, PDFEDIT_GENERATOR } from './context'
import type { FlipbookDoc, IdLike, MediaDoc } from './context'

type PdfeditLike = {
  id: IdLike
  manifestUrl?: unknown
  manifestPdf?: unknown
  manifestMedia?: unknown
}

const inflight = new Map<string, Promise<string | null>>()

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

const mediaUrl = (doc: MediaDoc | null, fallbackName: string): string =>
  typeof doc?.url === 'string' && doc.url ? doc.url : `/api/media/file/${String(doc?.filename ?? fallbackName)}`

async function createArtifact(
  payload: Payload,
  params: { pdfeditId: IdLike; revision: string; filename: string; data: Buffer },
): Promise<{ id: IdLike; url: string }> {
  // Explicit mimetype: Payload sniffs it from content, which does not recognise JSON text.
  const mimetype = params.filename.endsWith('.json') ? 'application/json' : 'application/pdf'
  const created = (await payload.create({
    collection: 'media',
    data: {
      generatedBy: PDFEDIT_GENERATOR,
      generatedFor: String(params.pdfeditId),
      generatedRevision: params.revision,
    } as never,
    file: { data: params.data, mimetype, name: params.filename, size: params.data.byteLength },
    overrideAccess: true,
  })) as MediaDoc
  return { id: created.id, url: mediaUrl(created, params.filename) }
}

/**
 * Offers the manifest to the flipbook reader (module-neutral `overrideManifestUrl`/
 * `overrideManifestFor`) while the flipbook still shows this updated PDF.
 */
async function publishToFlipbook(payload: Payload, flipbookId: IdLike, readPdfId: string, manifestUrl: string): Promise<void> {
  const flipbook = (await payload
    .findByID({ collection: 'flipbooks' as never, id: flipbookId, depth: 0, overrideAccess: true, select: { pdfOverride: true, overrideManifestFor: true } as never })
    .catch(() => null)) as (FlipbookDoc & { pdfOverride?: unknown; overrideManifestFor?: unknown }) | null
  if (!flipbook || relationId(flipbook.pdfOverride) !== readPdfId || flipbook.overrideManifestFor === readPdfId) return
  await retryWriteConflict(() =>
    payload.update({
      collection: 'flipbooks' as never,
      id: flipbookId,
      data: { overrideManifestUrl: manifestUrl, overrideManifestFor: readPdfId } as never,
      overrideAccess: true,
      context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
    }),
  )
}

/** Removes the pdfedit's own manifest (no updated PDF any more: the reading view uses the flipbook's). */
async function release(payload: Payload, pdfedit: PdfeditLike): Promise<void> {
  const previous = Array.isArray(pdfedit.manifestMedia) ? (pdfedit.manifestMedia as IdLike[]) : []
  await retryWriteConflict(() =>
    payload.update({
      collection: 'pdfedits' as never,
      id: pdfedit.id,
      data: { manifestUrl: null, manifestPdf: null, manifestMedia: [] } as never,
      overrideAccess: true,
    }),
  )
  await deleteMediaByIds(payload, previous)
}

async function build(
  payload: Payload,
  pdfedit: PdfeditLike,
  readPdfId: string,
  revision: string,
  pageLabels: string[],
  flipbookId: IdLike,
): Promise<string | null> {
  const createdIds: IdLike[] = []
  try {
    const pdfMedia = await findMedia(payload, readPdfId)
    const filePath = mediaPath(payload, pdfMedia)
    if (!pdfMedia || !filePath) return null
    const bytes = await fs.readFile(filePath)
    const sha = sha256(bytes)
    const extracted = await extractPdfData(filePath)
    const chunkResult = await chunkPdf(filePath, extracted.pageCount)

    const chunkUrls: string[] = []
    const chunkSha256s: string[] = []
    for (const chunk of chunkResult.chunks) {
      const artifact = await createArtifact(payload, {
        pdfeditId: pdfedit.id,
        revision,
        filename: `fb-pdfedit-${String(pdfedit.id)}-${sha.slice(0, 8)}-chunk-${chunk.startPage}-${chunk.endPage}.pdf`,
        data: chunk.data,
      })
      createdIds.push(artifact.id)
      chunkUrls.push(artifact.url)
      chunkSha256s.push(sha256(chunk.data))
    }

    const manifest = buildManifest({
      publicationId: `pdfedit-${String(pdfedit.id)}`,
      revision,
      sourceSha256: sha,
      sourceUrl: mediaUrl(pdfMedia, ''),
      extracted,
      chunkResult,
      chunkUrls,
      chunkSha256s,
      pageLabels,
    })
    const manifestArtifact = await createArtifact(payload, {
      pdfeditId: pdfedit.id,
      revision,
      filename: `fb-pdfedit-${String(pdfedit.id)}-${sha.slice(0, 8)}-manifest.json`,
      data: Buffer.from(JSON.stringify(manifest)),
    })
    createdIds.push(manifestArtifact.id)

    const previous = Array.isArray(pdfedit.manifestMedia) ? (pdfedit.manifestMedia as IdLike[]) : []
    // Only the manifest fields are written, so a repeat after a write conflict
    // (another save of this pdfedit at the same time) loses nothing.
    await retryWriteConflict(() =>
      payload.update({
        collection: 'pdfedits' as never,
        id: pdfedit.id,
        data: { manifestUrl: manifestArtifact.url, manifestPdf: readPdfId, manifestMedia: createdIds } as never,
        overrideAccess: true,
      }),
    )
    await deleteMediaByIds(payload, previous)
    await publishToFlipbook(payload, flipbookId, readPdfId, manifestArtifact.url)
    return manifestArtifact.url
  } catch (error) {
    payload.logger.warn(
      `pdfedit: manifest for ${String(pdfedit.id)} failed (non-fatal): ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    )
    await deleteMediaByIds(payload, createdIds).catch(() => undefined)
    return null
  }
}

/**
 * URL of the PDF.js manifest (text layer, links) of the PDF the reading view
 * shows. Without an updated PDF that is the published source, whose manifest
 * the flipbook conversion builds (`flipbooks.manifestUrl`): no copy is made,
 * and an own manifest left from an earlier update is released. With an
 * updated PDF the pdfedit builds its manifest itself, in the background (the
 * call returns `null` meanwhile, so neither the editor load nor the PDF update
 * waits for chunking and extraction), and offers it to the flipbook reader.
 * Non-fatal: without a manifest the reader works without text selection and
 * PDF links.
 */
export async function ensureReadManifest(
  payload: Payload,
  pdfedit: PdfeditLike,
  params: { editedPdfId: string | null; flipbook: Pick<FlipbookDoc, 'id' | 'manifestUrl'>; revision: string; pageLabels: string[] },
): Promise<string | null> {
  const { editedPdfId, flipbook, revision, pageLabels } = params
  const key = String(pdfedit.id)
  const own = typeof pdfedit.manifestUrl === 'string' && pdfedit.manifestUrl ? pdfedit.manifestUrl : null
  if (!editedPdfId) {
    if ((own || (Array.isArray(pdfedit.manifestMedia) && pdfedit.manifestMedia.length > 0)) && !inflight.has(key)) {
      void release(payload, pdfedit).catch((error) => payload.logger.warn(`pdfedit: releasing the manifest of ${key} failed: ${String(error)}`))
    }
    return typeof flipbook.manifestUrl === 'string' && flipbook.manifestUrl ? flipbook.manifestUrl : null
  }
  if (own && relationId(pdfedit.manifestPdf) === editedPdfId) {
    void publishToFlipbook(payload, flipbook.id, editedPdfId, own).catch(() => undefined)
    return own
  }
  if (!inflight.has(key)) {
    const job = build(payload, pdfedit, editedPdfId, revision, pageLabels, flipbook.id).finally(() => inflight.delete(key))
    inflight.set(key, job)
  }
  return null
}
