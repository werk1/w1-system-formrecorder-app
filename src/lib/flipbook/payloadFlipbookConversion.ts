import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { Payload } from 'payload'
import { resolveCoverImageId, type FlipbookCoverSettings } from './cover'
import {
  deleteGeneratedPages,
  deleteMediaByIds,
  FLIPBOOK_GENERATOR,
  markRevisionReleased,
  scheduleSupersededCleanup,
  sweepGeneratedMedia,
} from './cleanup'
import { applyTextStyles, parseBboxLayout } from '@werk1/w1-system-pdfedit/extract'
import {
  clearTempRoot,
  createJobDir,
  extractStyleLayout,
  extractTextLayout,
  FLIPBOOK_PAGE_TIMEOUT_MS,
  FLIPBOOK_RENDER_CONCURRENCY,
  FlipbookConversionError,
  isPdfToolingAvailable,
  probePdf,
  readPdfSignature,
  removeJobDir,
  renderPage,
  sha256File,
  toUserMessage,
  type RenderedPage,
} from './pdfConverter'
import { buildManifest, chunkPdf, extractPdfData } from '@werk1/w1-system-flipbook/pdf/server'

/**
 * Payload orchestration for the flipbook conversion pipeline.
 *
 * Unit documentation: src/lib/flipbook/README.md
 *
 * Serial in-process queue modelled on video-optimization: no persistence, no
 * automatic retry, single app instance assumed. A failed or interrupted
 * conversion ends in `error` and an admin restarts it. The last published
 * revision stays readable during re-runs; it is switched with a single update
 * only after a fully successful conversion.
 */

export const W1_SKIP_FLIPBOOK_CONVERSION = 'w1SkipFlipbookConversion'
export const FLIPBOOK_INTERRUPTED_MESSAGE = 'Konvertierung abgebrochen – bitte neu starten'

type IdLike = string | number

type FlipbookDoc = {
  id: IdLike
  sourcePdf?: unknown
  sourceRevision?: unknown
  status?: unknown
  publishedRevision?: unknown
  publishedSourcePdf?: unknown
  pages?: Array<{ image?: unknown; label?: unknown }> | null
  textModel?: unknown
  manifestUrl?: unknown
  cover?: unknown
}

type MediaDoc = {
  id: IdLike
  filename?: unknown
  filesize?: unknown
  updatedAt?: unknown
  width?: unknown
  height?: unknown
}

export type FlipbookConverter = {
  createJobDir: typeof createJobDir
  removeJobDir: typeof removeJobDir
  isToolingAvailable: typeof isPdfToolingAvailable
  readPdfSignature: typeof readPdfSignature
  sha256File: typeof sha256File
  probePdf: typeof probePdf
  renderPage: typeof renderPage
  extractTextLayout: typeof extractTextLayout
  /** Optional: adds font/size/colour to the text blocks. A failure keeps the unstyled model. */
  extractStyleLayout?: typeof extractStyleLayout
}

export const defaultFlipbookConverter: FlipbookConverter = {
  createJobDir,
  removeJobDir,
  isToolingAvailable: isPdfToolingAvailable,
  readPdfSignature,
  sha256File,
  probePdf,
  renderPage,
  extractTextLayout,
  extractStyleLayout,
}

const hasTextModel = (model: unknown): boolean =>
  Boolean(model && typeof model === 'object' && Array.isArray((model as { pages?: unknown }).pages) && (model as { pages: unknown[] }).pages.length > 0)

/**
 * Text artifact of a revision (pdfedit/search): one bbox-layout extraction for
 * the whole document, styled when the style extraction works. A failure must
 * not break the flipbook conversion — it logs and returns `null`, and the next
 * conversion can fill the model in.
 */
async function extractTextModel(
  payload: Payload,
  flipbookId: IdLike,
  converter: FlipbookConverter,
  filePath: string,
  revision: string,
): Promise<unknown> {
  let textModel: unknown = null
  try {
    textModel = parseBboxLayout(await converter.extractTextLayout(filePath), { revision })
  } catch (error) {
    payload.logger.warn(`flipbook: text extraction for ${flipbookId} failed: ${String(error)}`)
  }
  if (textModel && converter.extractStyleLayout) {
    try {
      textModel = applyTextStyles(textModel as ReturnType<typeof parseBboxLayout>, await converter.extractStyleLayout(filePath))
    } catch (error) {
      payload.logger.warn(`flipbook: style extraction for ${flipbookId} failed: ${String(error)}`)
    }
  }
  return textModel
}

export type FlipbookConversionOutcome =
  | 'ready'
  | 'already-published'
  | 'superseded'
  | 'failed'
  | 'missing'
  | 'no-source'

class SupersededError extends Error {}

const waitingIds = new Set<string>()
/** Newest source a waiting job must see; a collapsed duplicate updates it. */
const waitingExpectedSource = new Map<string, string | undefined>()
const runningIds = new Set<string>()
let queueTail: Promise<void> = Promise.resolve()

export const isFlipbookJobActive = (flipbookId: IdLike): boolean =>
  waitingIds.has(String(flipbookId)) || runningIds.has(String(flipbookId))

export const relationId = (value: unknown): string | null => {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null
}

/**
 * Cheap identity of the stored PDF file. Uses file name and size (not
 * `updatedAt`), so editing only metadata such as `alt` does not count as a
 * changed source; replacing the file changes name and/or size.
 */
export const stampOfMedia = (media: MediaDoc): string => `${String(media.filesize ?? '')}:${String(media.filename ?? '')}`

const resolveMediaStaticDir = (payload: Payload): string => {
  const staticDir = payload.collections.media?.config?.upload?.staticDir
  if (!staticDir) throw new Error('media collection has no upload.staticDir')
  return staticDir
}

type LocaleInfo = { defaultLocale: string; locales: string[] }

const readLocales = (payload: Payload): LocaleInfo => {
  const localization = payload.config.localization
  if (!localization) return { defaultLocale: 'en', locales: ['en'] }
  const locales = localization.locales.map((locale) => (typeof locale === 'string' ? locale : locale.code))
  return { defaultLocale: localization.defaultLocale, locales }
}

const ALT_PATTERNS: Record<string, (page: number, title: string) => string> = {
  de: (page, title) => `Seite ${page} von ${title}`,
  en: (page, title) => `Page ${page} of ${title}`,
}

export const buildPageAlt = (locale: string, page: number, title: string): string =>
  (ALT_PATTERNS[locale] ?? ALT_PATTERNS.en)(page, title)

const updateFlipbook = (payload: Payload, id: IdLike, data: Record<string, unknown>) =>
  payload.update({
    collection: 'flipbooks' as never,
    id,
    data: data as never,
    overrideAccess: true,
    context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
  }) as Promise<FlipbookDoc>

const readFlipbook = async (payload: Payload, id: IdLike): Promise<FlipbookDoc | null> =>
  (await payload
    .findByID({ collection: 'flipbooks' as never, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as FlipbookDoc | null

const LOAD_ATTEMPTS = 25
const LOAD_DELAY_MS = 200

/**
 * The job is enqueued from `afterChange`, i.e. possibly before the surrounding
 * transaction commits (MongoDB replica set). It therefore waits until the
 * committed document exists and shows the source the trigger saw; otherwise
 * it would convert (or skip as "already published") the previous source.
 */
const loadFlipbookForJob = async (
  payload: Payload,
  id: IdLike,
  expectedSourceId: string | undefined,
): Promise<{ doc: FlipbookDoc | null; sourceMatches: boolean }> => {
  let doc: FlipbookDoc | null = null
  for (let attempt = 0; attempt < LOAD_ATTEMPTS; attempt += 1) {
    doc = await readFlipbook(payload, id)
    if (doc && (!expectedSourceId || relationId(doc.sourcePdf) === expectedSourceId)) {
      return { doc, sourceMatches: true }
    }
    await new Promise((resolve) => setTimeout(resolve, LOAD_DELAY_MS))
  }
  return { doc, sourceMatches: false }
}

function sha256Buffer(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Writes `data` to `jobDir/${filename}` and uploads it to the media collection
 * as a non-image artifact (chunk PDF or manifest JSON). Returns the media doc
 * id and the public URL (taken from the created doc's `url` field).
 */
async function createArtifactMedia(
  payload: Payload,
  params: {
    flipbookId: IdLike
    revision: string
    filename: string
    data: Buffer
  },
): Promise<{ id: IdLike; url: string }> {
  // The file is passed with an explicit mimetype: Payload sniffs it from
  // content (`file-type`), which does not recognise JSON text, so a `filePath`
  // upload of the manifest would fail the collection's MIME validation.
  const mimetype = params.filename.endsWith('.json') ? 'application/json' : 'application/pdf'
  const created = (await payload.create({
    collection: 'media',
    data: {
      generatedBy: FLIPBOOK_GENERATOR,
      generatedFor: String(params.flipbookId),
      generatedRevision: params.revision,
    } as never,
    file: { data: params.data, mimetype, name: params.filename, size: params.data.byteLength },
    overrideAccess: true,
  })) as MediaDoc & { url?: unknown }

  const url =
    typeof created.url === 'string' && created.url
      ? created.url
      : `/api/media/file/${String(created.filename ?? params.filename)}`

  return { id: created.id, url }
}

/** Flipbook title per locale (page alt texts), read once per conversion job. */
async function loadTitles(payload: Payload, flipbookId: IdLike): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  for (const locale of readLocales(payload).locales) {
    const doc = (await payload
      .findByID({
        collection: 'flipbooks' as never,
        id: flipbookId,
        depth: 0,
        locale: locale as never,
        overrideAccess: true,
        select: { title: true } as never,
      })
      .catch(() => null)) as { title?: unknown } | null
    titles.set(locale, typeof doc?.title === 'string' && doc.title ? doc.title : String(flipbookId))
  }
  return titles
}

async function createPageMedia(
  payload: Payload,
  params: {
    flipbookId: IdLike
    revision: string
    revision8: string
    pageNumber: number
    filePath: string
    jobDir: string
    titles: Map<string, string>
  },
): Promise<IdLike> {
  const { defaultLocale, locales } = readLocales(payload)
  const filename = `fb-${params.flipbookId}-${params.revision8}-p${String(params.pageNumber).padStart(4, '0')}.png`
  const target = path.join(params.jobDir, filename)
  await fs.rename(params.filePath, target)

  const titleFor = (locale: string): string => params.titles.get(locale) ?? String(params.flipbookId)

  const created = (await payload.create({
    collection: 'media',
    data: {
      alt: buildPageAlt(defaultLocale, params.pageNumber, titleFor(defaultLocale)),
      generatedBy: FLIPBOOK_GENERATOR,
      generatedFor: String(params.flipbookId),
      generatedRevision: params.revision,
    } as never,
    filePath: target,
    locale: defaultLocale as never,
    overrideAccess: true,
  })) as MediaDoc

  for (const locale of locales.filter((code) => code !== defaultLocale)) {
    await payload.update({
      collection: 'media',
      id: created.id,
      locale: locale as never,
      data: { alt: buildPageAlt(locale, params.pageNumber, titleFor(locale)) } as never,
      overrideAccess: true,
    })
  }
  return created.id
}

/**
 * Builds and uploads the PDF manifest (page geometry, text/link/outline
 * capabilities, page-group chunks) for a published revision. Non-fatal: page
 * images work without it, so a failure is logged and returns null.
 */
async function publishManifest(
  payload: Payload,
  converter: FlipbookConverter,
  params: { flipbookId: IdLike; revision: string; sha: string; sourceId: string; filePath: string; pageLabels: string[] },
): Promise<string | null> {
  const { flipbookId, revision, sha, sourceId, filePath, pageLabels } = params
  const createdArtifactIds: IdLike[] = []
  try {
    const extracted = await extractPdfData(filePath)
    const chunkResult = await chunkPdf(filePath, extracted.pageCount)

    // Upload chunk files
    const chunkUrls: string[] = []
    const chunkSha256s: string[] = []
    for (const chunk of chunkResult.chunks) {
      const chunkFilename = `fb-${String(flipbookId)}-${sha.slice(0, 8)}-chunk-${chunk.startPage}-${chunk.endPage}.pdf`
      const chunkSha = sha256Buffer(chunk.data)
      const artifact = await createArtifactMedia(payload, {
        flipbookId,
        revision,
        filename: chunkFilename,
        data: chunk.data,
      })
      createdArtifactIds.push(artifact.id)
      chunkUrls.push(artifact.url)
      chunkSha256s.push(chunkSha)
    }

    // Determine source PDF public URL (best-effort)
    const sourcePdfDoc = (await payload
      .findByID({ collection: 'media', id: sourceId, depth: 0, overrideAccess: true })
      .catch(() => null)) as (MediaDoc & { url?: unknown }) | null
    const sourceUrl =
      typeof sourcePdfDoc?.url === 'string' && sourcePdfDoc.url
        ? sourcePdfDoc.url
        : `/api/media/file/${String(sourcePdfDoc?.filename ?? '')}`

    const manifest = buildManifest({
      publicationId: String(flipbookId),
      revision,
      sourceSha256: sha,
      sourceUrl,
      extracted,
      chunkResult,
      chunkUrls,
      chunkSha256s,
      pageLabels,
    })

    const manifestJson = Buffer.from(JSON.stringify(manifest))
    const manifestFilename = `fb-${String(flipbookId)}-${sha.slice(0, 8)}-manifest.json`
    const manifestArtifact = await createArtifactMedia(payload, {
      flipbookId,
      revision,
      filename: manifestFilename,
      data: manifestJson,
    })
    createdArtifactIds.push(manifestArtifact.id)
    return manifestArtifact.url
  } catch (extractionError) {
    payload.logger.warn(
      `flipbook: manifest/extraction for ${String(flipbookId)} failed (non-fatal): ${extractionError instanceof Error ? (extractionError.stack ?? extractionError.message) : String(extractionError)}`,
    )
    await deleteMediaByIds(payload, createdArtifactIds).catch(() => undefined)
    return null
  }
}

export async function runFlipbookConversion(
  payload: Payload,
  flipbookId: IdLike,
  converter: FlipbookConverter = defaultFlipbookConverter,
  options: { expectedSourceId?: string; pageTimeoutMs?: number } = {},
): Promise<FlipbookConversionOutcome> {
  const { doc: flipbook, sourceMatches } = await loadFlipbookForJob(payload, flipbookId, options.expectedSourceId)
  if (!flipbook) return 'missing'
  // The triggering change never became visible (rolled back or replaced by a
  // newer change, which enqueues its own job): nothing to do for this job.
  if (!sourceMatches) return 'superseded'
  const sourceId = relationId(flipbook.sourcePdf)
  if (!sourceId) return 'no-source'

  const createdPageIds: IdLike[] = []
  let jobDir: string | null = null
  /** Page renders started ahead and not yet consumed, by 1-based page number. */
  const renders = new Map<number, Promise<RenderedPage>>()

  try {
    if (!(await converter.isToolingAvailable())) throw new FlipbookConversionError('unavailable')

    const source = (await payload.findByID({ collection: 'media', id: sourceId, depth: 0, overrideAccess: true })) as MediaDoc
    if (typeof source.filename !== 'string' || !source.filename) throw new FlipbookConversionError('damaged', 'Datei fehlt')
    const filePath = path.join(resolveMediaStaticDir(payload), source.filename)

    if (!(await converter.readPdfSignature(filePath))) throw new FlipbookConversionError('damaged', 'keine PDF-Signatur')
    const sha = await converter.sha256File(filePath)
    const revision = `${sourceId}:${sha}`
    const stamp = stampOfMedia(source)

    if (flipbook.publishedRevision === revision && relationId(flipbook.publishedSourcePdf) === sourceId) {
      if (flipbook.status !== 'ready') {
        await updateFlipbook(payload, flipbookId, { status: 'ready', progress: null, errorMessage: null, sourceRevision: revision, sourceStamp: stamp })
      }
      // Converted before text extraction existed (or the extraction failed):
      // a restart fills in the text model of the published revision without
      // touching its pages — search and the pdfedit editor depend on it.
      if (!hasTextModel(flipbook.textModel)) {
        const textModel = await extractTextModel(payload, flipbookId, converter, filePath, revision)
        if (textModel) await updateFlipbook(payload, flipbookId, { textModel })
      }
      // Converted before the PDF manifest existed (or its build failed): a
      // restart adds it to the published revision, again without touching pages.
      if (typeof flipbook.manifestUrl !== 'string' || !flipbook.manifestUrl) {
        // Show the run in the admin (status line, button polling), then restore.
        const pageTotal = (flipbook.pages ?? []).length
        await updateFlipbook(payload, flipbookId, { status: 'converting', progress: 'Extrahiere PDF-Daten …' })
        const manifestUrl = await publishManifest(payload, converter, {
          flipbookId,
          revision,
          sha,
          sourceId,
          filePath,
          pageLabels: (flipbook.pages ?? []).map((p) => (typeof p.label === 'string' ? p.label : '')),
        })
        await updateFlipbook(payload, flipbookId, {
          status: 'ready',
          progress: pageTotal > 0 ? `${pageTotal}/${pageTotal}` : null,
          ...(manifestUrl ? { manifestUrl } : {}),
        })
      }
      return 'already-published'
    }

    await sweepGeneratedMedia(payload).catch(() => undefined)
    await updateFlipbook(payload, flipbookId, {
      status: 'converting',
      progress: 'Prüfe PDF …',
      errorMessage: null,
      sourceRevision: revision,
      sourceStamp: stamp,
    })

    const probe = await converter.probePdf(filePath)
    // Job limit grows with the document: per-page timeout × page count. Each
    // pdftoppm call is additionally capped by the per-page timeout.
    const deadline = Date.now() + (options.pageTimeoutMs ?? FLIPBOOK_PAGE_TIMEOUT_MS) * probe.pageCount
    jobDir = await converter.createJobDir()
    const renderDir = jobDir
    const pages: Array<{ image: IdLike; width: number; height: number }> = []
    const progressEvery = Math.max(1, Math.ceil(probe.pageCount / 20))
    const titles = await loadTitles(payload, flipbookId)

    // Pages render ahead in parallel (FLIPBOOK_RENDER_CONCURRENCY pdftoppm
    // processes); media docs are still created strictly in page order.
    let nextRender = 1
    const fillRenders = (pageNumber: number) => {
      while (nextRender <= probe.pageCount && nextRender < pageNumber + FLIPBOOK_RENDER_CONCURRENCY) {
        const rendering = converter.renderPage(filePath, nextRender, renderDir)
        rendering.catch(() => undefined)
        renders.set(nextRender, rendering)
        nextRender += 1
      }
    }

    for (let pageNumber = 1; pageNumber <= probe.pageCount; pageNumber += 1) {
      if (Date.now() > deadline) throw new FlipbookConversionError('timeout', `Jobgrenze bei Seite ${pageNumber}`)
      fillRenders(pageNumber)
      const rendered = await renders.get(pageNumber)!
      renders.delete(pageNumber)
      const imageId = await createPageMedia(payload, {
        flipbookId,
        revision,
        revision8: sha.slice(0, 8),
        pageNumber,
        filePath: rendered.filePath,
        jobDir,
        titles,
      })
      createdPageIds.push(imageId)
      pages.push({ image: imageId, width: rendered.width, height: rendered.height })

      if (pageNumber % progressEvery === 0 && pageNumber < probe.pageCount) {
        const updated = await updateFlipbook(payload, flipbookId, { progress: `${pageNumber}/${probe.pageCount}` })
        if (relationId(updated.sourcePdf) !== sourceId) throw new SupersededError()
      }
    }

    const current = await readFlipbook(payload, flipbookId)
    if (!current || relationId(current.sourcePdf) !== sourceId) throw new SupersededError()
    const currentSource = (await payload
      .findByID({ collection: 'media', id: sourceId, depth: 0, overrideAccess: true })
      .catch(() => null)) as MediaDoc | null
    if (!currentSource || stampOfMedia(currentSource) !== stamp) {
      await deleteMediaByIds(payload, createdPageIds)
      await updateFlipbook(payload, flipbookId, {
        status: 'error',
        progress: null,
        errorMessage: 'Die Quelle wurde während der Konvertierung geändert – bitte neu starten.',
      })
      return 'superseded'
    }

    const textModel = await extractTextModel(payload, flipbookId, converter, filePath, revision)

    // PDF manifest + chunks (non-fatal): see publishManifest.
    await updateFlipbook(payload, flipbookId, { progress: 'Extrahiere PDF-Daten …' })
    const manifestUrl = await publishManifest(payload, converter, {
      flipbookId,
      revision,
      sha,
      sourceId,
      filePath,
      pageLabels: (pages as Array<{ label?: unknown }>).map((p) => (typeof p.label === 'string' ? p.label : '')),
    })

    const previousRevision = typeof current.publishedRevision === 'string' ? current.publishedRevision : null
    await updateFlipbook(payload, flipbookId, {
      publishedSourcePdf: sourceId,
      publishedRevision: revision,
      pages,
      pageCount: pages.length,
      textModel,
      coverImage: resolveCoverImageId(current.cover as FlipbookCoverSettings, pages),
      status: 'ready',
      progress: `${pages.length}/${pages.length}`,
      errorMessage: null,
      ...(manifestUrl !== null ? { manifestUrl } : {}),
    })
    if (previousRevision && previousRevision !== revision) {
      await markRevisionReleased(payload, flipbookId, previousRevision).catch((error) => {
        payload.logger.error(`flipbook: marking revision ${previousRevision} released failed: ${String(error)}`)
      })
      scheduleSupersededCleanup(payload, flipbookId, previousRevision)
    }
    payload.logger.info(`flipbook: ${flipbookId} ready (${pages.length} pages)`)
    return 'ready'
  } catch (error) {
    await deleteMediaByIds(payload, createdPageIds)
    if (error instanceof SupersededError) return 'superseded'
    const message = toUserMessage(error)
    payload.logger.error(`flipbook: conversion of ${flipbookId} failed: ${message}`)
    await updateFlipbook(payload, flipbookId, { status: 'error', progress: null, errorMessage: message }).catch(() => undefined)
    return 'failed'
  } finally {
    // Renders started ahead of a failure still write into the job dir.
    await Promise.allSettled(renders.values())
    if (jobDir) await converter.removeJobDir(jobDir).catch(() => undefined)
  }
}

export type EnqueueResult = 'queued' | 'already-queued' | 'already-running'

/**
 * Serial global queue. At most one job per flipbook is *waiting*; a job that
 * is already running does not block a follow-up job (source replaced mid-job).
 */
export function enqueueFlipbookConversion(
  payload: Payload,
  flipbookId: IdLike,
  options: { converter?: FlipbookConverter; rejectIfRunning?: boolean; expectedSourceId?: string } = {},
): { result: EnqueueResult; done: Promise<FlipbookConversionOutcome | null> } {
  const key = String(flipbookId)
  if (waitingIds.has(key)) {
    waitingExpectedSource.set(key, options.expectedSourceId)
    return { result: 'already-queued', done: Promise.resolve(null) }
  }
  if (options.rejectIfRunning && runningIds.has(key)) return { result: 'already-running', done: Promise.resolve(null) }
  waitingIds.add(key)
  waitingExpectedSource.set(key, options.expectedSourceId)

  const job = queueTail.then(async () => {
    const expectedSourceId = waitingExpectedSource.get(key)
    waitingIds.delete(key)
    waitingExpectedSource.delete(key)
    runningIds.add(key)
    try {
      return await runFlipbookConversion(payload, flipbookId, options.converter, { expectedSourceId })
    } catch (error) {
      payload.logger.error(`flipbook: unexpected error for ${key}: ${String(error)}`)
      return 'failed' as const
    } finally {
      runningIds.delete(key)
    }
  })
  queueTail = job.then(() => undefined)
  return { result: 'queued', done: job }
}

export function maybeScheduleFlipbookConversion(
  params: { doc: FlipbookDoc; previousDoc?: FlipbookDoc | null; operation: string },
  payload: Payload,
): void {
  const next = relationId(params.doc.sourcePdf)
  if (!next) return
  const previous = params.operation === 'create' ? null : relationId(params.previousDoc?.sourcePdf)
  if (next === previous) return
  void enqueueFlipbookConversion(payload, params.doc.id, { expectedSourceId: next }).done
}

/** `onInit`: interrupted jobs end in `error`, temp files and stale pages are cleaned. */
export async function resetInterruptedFlipbookJobs(payload: Payload): Promise<number> {
  if (!payload.collections.flipbooks) return 0
  await clearTempRoot().catch(() => undefined)

  const { docs } = await payload.find({
    collection: 'flipbooks' as never,
    where: { status: { equals: 'converting' } } as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const doc of docs as FlipbookDoc[]) {
    await updateFlipbook(payload, doc.id, { status: 'error', progress: null, errorMessage: FLIPBOOK_INTERRUPTED_MESSAGE })
    // Partial pages of the interrupted job are orphaned; the sweep removes them after retention.
  }
  void sweepGeneratedMedia(payload).catch((error) => {
    payload.logger.error(`flipbook: startup sweep failed: ${String(error)}`)
  })
  return docs.length
}

export async function deleteFlipbookGeneratedPages(payload: Payload, flipbookId: IdLike): Promise<void> {
  await deleteGeneratedPages(payload, flipbookId)
}
