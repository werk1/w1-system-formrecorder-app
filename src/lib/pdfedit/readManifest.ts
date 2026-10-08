import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import type { Payload } from 'payload'
import { buildManifest, chunkPdf, extractPdfData } from '@werk1/w1-system-flipbook/pdf/server'
import { deleteMediaByIds } from '@/lib/flipbook/cleanup'
import { relationId } from '@/lib/flipbook/payloadFlipbookConversion'
import { PDFEDIT_GENERATOR } from './pdfUpdate'
import { retryWriteConflict } from './retryWrite'
import { findMedia, mediaPath } from './context'
import type { IdLike, MediaDoc } from './context'

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

async function build(
  payload: Payload,
  pdfedit: PdfeditLike,
  readPdfId: string,
  revision: string,
  pageLabels: string[],
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
 * URL of the PDF.js manifest (text layer, links) of the PDF the reader shows.
 * Built on first use (awaited) and rebuilt when that PDF changes (an update
 * replaces the edited PDF): the rebuild runs in the background and returns
 * `null` meanwhile, so loading the editor after an update does not wait for
 * chunking and extraction, and the reader never gets the text layer of the
 * previous PDF. Non-fatal: without a manifest the reader works without text
 * selection and PDF links.
 */
export async function ensureReadManifest(
  payload: Payload,
  pdfedit: PdfeditLike,
  params: { readPdfId: string | null; revision: string; pageLabels: string[] },
): Promise<string | null> {
  const { readPdfId, revision, pageLabels } = params
  if (!readPdfId) return null
  const current = typeof pdfedit.manifestUrl === 'string' && pdfedit.manifestUrl ? pdfedit.manifestUrl : null
  if (current && relationId(pdfedit.manifestPdf) === readPdfId) return current
  const key = String(pdfedit.id)
  let job = inflight.get(key)
  if (!job) {
    job = build(payload, pdfedit, readPdfId, revision, pageLabels).finally(() => inflight.delete(key))
    inflight.set(key, job)
  }
  return current ? null : job
}
