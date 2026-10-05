import { promises as fs } from 'fs'
import path from 'path'
import type { Payload } from 'payload'
import { hasStyledSpans, spansText } from '@werk1/w1-system-pdfedit/export'
import { applyImageEdits, applyTextEdits } from '@werk1/w1-system-pdfedit/pdf'
import type { W1PdfFontProvider, W1PdfTextEdit } from '@werk1/w1-system-pdfedit/pdf'
import type { W1FormTextBlock, W1FormTextModel, W1PdfEditRecord } from '@werk1/w1-system-pdfedit/types'
import { createJobDir, removeJobDir, renderPage } from '@/lib/flipbook/pdfConverter'
import { deleteMediaByIds } from '@/lib/flipbook/cleanup'
import { relationId, W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'
import { createGoogleFontProvider } from './googleFonts'
import { currentImageEdits } from './imageEdits'
import { loadReplacement } from './imageFiles'

export const PDFEDIT_GENERATOR = 'pdfedit'

type IdLike = string | number

export type PdfUpdateAction = { type: 'apply' } | { type: 'restore'; pageIndex: number }

export type PdfUpdateResult = {
  /** Block ids whose text now lives in the PDF. */
  applied: string[]
  skipped: Array<{ blockId: string; reason: string }>
  warnings: string[]
  /** Pages (0-based) that differ from the original after the update. */
  editedPageIndexes: number[]
  /** Records that were reset by a page restore. */
  resetRecordIds: string[]
  /** Image ids whose replacement now lives in the PDF. */
  appliedImages: string[]
  skippedImages: Array<{ imageId: string; reason: string }>
}

export class PdfUpdateError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NOT_READY' | 'BUSY' | 'NO_TEXT_MODEL' | 'FAILED',
    message: string,
  ) {
    super(message)
  }
}

type MediaDoc = { id: IdLike; filename?: unknown }
type PdfeditDoc = {
  id: IdLike
  flipbook?: unknown
  originalPdf?: unknown
  editedPdf?: unknown
  editedPages?: Array<{ image?: unknown }> | null
  imageEdits?: unknown
}
type FlipbookDoc = {
  id: IdLike
  publishedSourcePdf?: unknown
  publishedRevision?: unknown
  overrideSource?: unknown
  textModel?: unknown
  pages?: Array<{ width?: unknown; height?: unknown }> | null
}

const busy = new Set<string>()

const mediaDir = (payload: Payload): string => {
  const dir = payload.collections.media?.config?.upload?.staticDir
  if (!dir) throw new Error('media collection has no upload.staticDir')
  return dir
}

const readMedia = (payload: Payload, id: IdLike) =>
  payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true }) as Promise<MediaDoc>

/** Line breaks vs. spaces are not an edit. */
const sameText = (a: string, b: string): boolean => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

/** Source text of a block id inside the model. */
const blockIndex = (model: W1FormTextModel): Map<string, W1FormTextBlock> => {
  const map = new Map<string, W1FormTextBlock>()
  for (const page of model.pages) for (const block of page.blocks) map.set(block.id, block)
  return map
}

/**
 * Edits for all record blocks whose text differs from the PDF source text.
 * `onlyPages` limits the result (used for diagnostics); unknown block ids are dropped.
 */
export function collectEdits(model: W1FormTextModel, records: readonly W1PdfEditRecord[]): W1PdfTextEdit[] {
  const index = blockIndex(model)
  const edits: W1PdfTextEdit[] = []
  for (const record of records) {
    for (const block of record.blocks) {
      const source = index.get(block.blockId)
      if (!source || source.level !== 'block') continue
      // A restyle alone (same text, styled spans) is an edit too.
      const styled = hasStyledSpans(block.spans) && sameText(spansText(block.spans ?? []), block.text)
      if (!block.edited || (sameText(block.text, source.text) && !styled)) continue
      edits.push({
        blockId: source.id,
        pageIndex: source.pageIndex,
        rect: source.rect,
        text: block.text,
        ...(styled ? { spans: block.spans } : {}),
        style: source.style,
        lineCount: Math.max(1, source.childIds?.length ?? 1),
      })
    }
  }
  return edits
}

/** Resets the record blocks on one page to their source text; returns the changed records. */
export function resetPageBlocks(
  model: W1FormTextModel,
  records: readonly W1PdfEditRecord[],
  pageIndex: number,
): W1PdfEditRecord[] {
  const index = blockIndex(model)
  const changed: W1PdfEditRecord[] = []
  for (const record of records) {
    let touched = false
    const blocks = record.blocks.map((block) => {
      const source = index.get(block.blockId)
      if (!source || source.pageIndex !== pageIndex || !(block.edited || block.text !== source.text || block.spans)) return block
      touched = true
      const { spans: _spans, ...plain } = block
      void _spans
      return { ...plain, text: source.text, edited: false }
    })
    if (touched) changed.push({ ...record, blocks })
  }
  return changed
}

const createPdfMedia = async (payload: Payload, params: { filePath: string; alt: string; pdfeditId: IdLike; revision: string }) =>
  (await payload.create({
    collection: 'media',
    data: { alt: params.alt, generatedBy: PDFEDIT_GENERATOR, generatedFor: String(params.pdfeditId), generatedRevision: params.revision } as never,
    filePath: params.filePath,
    overrideAccess: true,
  })) as MediaDoc

/**
 * Writes the edited record texts into the PDF and recomputes the previews of
 * the changed pages. The original PDF (the flipbook source) is never touched:
 * a backup copy is made on first use, and every run starts from it, so runs
 * never stack. A `restore` first resets the texts of one page to the source
 * and then runs the same update — that page returns to the original.
 */
export async function updatePdfedit(
  payload: Payload,
  pdfeditId: IdLike,
  action: PdfUpdateAction,
  options: { fontProvider?: W1PdfFontProvider } = {},
): Promise<PdfUpdateResult> {
  const lockKey = String(pdfeditId)
  if (busy.has(lockKey)) throw new PdfUpdateError('BUSY', 'Für dieses Dokument läuft bereits eine PDF-Aktualisierung.')
  busy.add(lockKey)
  const createdIds: IdLike[] = []
  let jobDir: string | null = null
  try {
    const doc = (await payload
      .findByID({ collection: 'pdfedits' as never, id: pdfeditId, depth: 0, overrideAccess: true })
      .catch(() => null)) as PdfeditDoc | null
    if (!doc) throw new PdfUpdateError('NOT_FOUND', 'Pdfedit nicht gefunden.')
    const flipbookId = relationId(doc.flipbook)
    const flipbook = flipbookId
      ? ((await payload.findByID({ collection: 'flipbooks' as never, id: flipbookId, depth: 0, overrideAccess: true }).catch(() => null)) as FlipbookDoc | null)
      : null
    const revision = typeof flipbook?.publishedRevision === 'string' ? flipbook.publishedRevision : null
    const sourceId = relationId(flipbook?.publishedSourcePdf)
    if (!flipbook || !revision || !sourceId) throw new PdfUpdateError('NOT_READY', 'Das Flipbook ist nicht konvertiert.')
    const model = flipbook.textModel as W1FormTextModel | null
    if (!model || !Array.isArray(model.pages)) throw new PdfUpdateError('NO_TEXT_MODEL', 'Das Dokument hat kein Textmodell.')

    const { docs } = await payload.find({
      collection: 'pdfeditrecords' as never,
      where: { pdfedit: { equals: doc.id } } as never,
      sort: 'order',
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    let records: W1PdfEditRecord[] = (docs as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      order: typeof r.order === 'number' ? r.order : 0,
      ...(typeof r.name === 'string' && r.name ? { name: r.name } : {}),
      pageIndex: typeof r.pageIndex === 'number' ? r.pageIndex : undefined,
      blocks: Array.isArray(r.blocks) ? (r.blocks as W1PdfEditRecord['blocks']) : [],
    }))

    const resetRecordIds: string[] = []
    if (action.type === 'restore') {
      const changed = resetPageBlocks(model, records, action.pageIndex)
      for (const record of changed) {
        await payload.update({
          collection: 'pdfeditrecords' as never,
          id: record.id,
          data: { blocks: record.blocks } as never,
          overrideAccess: true,
        })
        resetRecordIds.push(record.id)
      }
      records = records.map((r) => changed.find((c) => c.id === r.id) ?? r)
    }

    // Image replacements of the current revision; a page restore drops those of that page.
    let imageEdits = currentImageEdits(doc.imageEdits, revision)
    if (action.type === 'restore' && imageEdits.some((e) => e.pageIndex === action.pageIndex)) {
      imageEdits = imageEdits.filter((e) => e.pageIndex !== action.pageIndex)
      await payload.update({ collection: 'pdfedits' as never, id: doc.id, data: { imageEdits } as never, overrideAccess: true })
    }

    // The flipbook source file is the pristine original; keep a backup copy once.
    const source = await readMedia(payload, sourceId)
    if (typeof source.filename !== 'string' || !source.filename) throw new PdfUpdateError('FAILED', 'Die Quell-PDF-Datei fehlt.')
    const sourcePath = path.join(mediaDir(payload), source.filename)
    let originalBackupId = relationId(doc.originalPdf)
    const backupRevision = originalBackupId
      ? ((await payload.findByID({ collection: 'media', id: originalBackupId, depth: 0, overrideAccess: true }).catch(() => null)) as { generatedRevision?: unknown } | null)?.generatedRevision
      : null
    if (!originalBackupId || backupRevision !== revision) {
      const created = await createPdfMedia(payload, { filePath: sourcePath, alt: 'PDF-Original (Sicherung)', pdfeditId, revision })
      if (originalBackupId) await deleteMediaByIds(payload, [originalBackupId])
      originalBackupId = String(created.id)
    }
    const backup = await readMedia(payload, originalBackupId)
    const original = await fs.readFile(path.join(mediaDir(payload), String(backup.filename)))

    // Images first (they work on the original's paint operators), then the texts on top of that result.
    const skippedImages: PdfUpdateResult['skippedImages'] = []
    const replacements = []
    for (const edit of imageEdits) {
      const loaded = await loadReplacement(payload, edit)
      if (loaded.ok) replacements.push(loaded.replacement)
      else skippedImages.push({ imageId: loaded.imageId, reason: loaded.reason })
    }
    const imageResult = replacements.length
      ? await applyImageEdits(new Uint8Array(original), replacements)
      : { bytes: new Uint8Array(original), applied: [] as string[], skipped: [], warnings: [] as string[] }
    skippedImages.push(...imageResult.skipped.map((s) => ({ imageId: s.imageId, reason: s.reason })))
    const appliedImageSet = new Set(imageResult.applied)
    const imagePages = replacements.filter((r) => appliedImageSet.has(r.imageId)).map((r) => r.pageIndex)

    const edits = collectEdits(model, records)
    const result = await applyTextEdits(imageResult.bytes, edits, { fontProvider: options.fontProvider })
    result.warnings.unshift(...imageResult.warnings)
    const appliedSet = new Set(result.applied)
    const editedPageIndexes = [
      ...new Set([...edits.filter((e) => appliedSet.has(e.blockId)).map((e) => e.pageIndex), ...imagePages]),
    ].sort((a, b) => a - b)

    // Previous generated edited files are replaced after the new ones exist.
    const previousIds: IdLike[] = [
      ...(relationId(doc.editedPdf) ? [relationId(doc.editedPdf) as IdLike] : []),
      ...((doc.editedPages ?? []).map((p) => relationId(p.image)).filter((v): v is string => Boolean(v))),
    ]

    let editedPdfId: IdLike | null = null
    const editedPages: Array<{ pageIndex: number; image: IdLike; width: number; height: number }> = []
    if (editedPageIndexes.length > 0) {
      jobDir = await createJobDir()
      const editedPath = path.join(jobDir, `pdfedit-${pdfeditId}-edited.pdf`)
      await fs.writeFile(editedPath, result.bytes)
      const editedMedia = await createPdfMedia(payload, { filePath: editedPath, alt: 'PDF (aktualisiert)', pdfeditId, revision })
      createdIds.push(editedMedia.id)
      editedPdfId = editedMedia.id
      for (const pageIndex of editedPageIndexes) {
        const rendered = await renderPage(path.join(jobDir, `pdfedit-${pdfeditId}-edited.pdf`), pageIndex + 1, jobDir)
        const target = path.join(jobDir, `pdfedit-${pdfeditId}-p${String(pageIndex + 1).padStart(4, '0')}.png`)
        await fs.rename(rendered.filePath, target)
        const image = (await payload.create({
          collection: 'media',
          data: {
            alt: `Seite ${pageIndex + 1} (aktualisiert)`,
            generatedBy: PDFEDIT_GENERATOR,
            generatedFor: String(pdfeditId),
            generatedRevision: revision,
          } as never,
          filePath: target,
          overrideAccess: true,
        })) as MediaDoc
        createdIds.push(image.id)
        editedPages.push({ pageIndex, image: image.id, width: rendered.width, height: rendered.height })
      }
    }

    await payload.update({
      collection: 'pdfedits' as never,
      id: pdfeditId,
      data: {
        originalPdf: originalBackupId,
        editedPdf: editedPdfId,
        editedPages,
        editedAt: editedPageIndexes.length > 0 ? new Date().toISOString() : null,
        editedRevision: editedPageIndexes.length > 0 ? revision : null,
      } as never,
      overrideAccess: true,
    })
    // Mirror the updated pages onto the flipbook so the reader shows them
    // (module-neutral `pageOverrides`/`pdfOverride`). A pdfedit without edits
    // only clears overrides it wrote itself.
    const hasEdits = editedPageIndexes.length > 0
    if (hasEdits || String(flipbook.overrideSource ?? '') === String(pdfeditId)) {
      await payload.update({
        collection: 'flipbooks' as never,
        id: flipbook.id,
        data: {
          pageOverrides: editedPages.map((p) => ({ pageIndex: p.pageIndex, image: p.image, width: p.width, height: p.height })),
          pdfOverride: editedPdfId,
          overrideRevision: hasEdits ? revision : null,
          overrideSource: hasEdits ? String(pdfeditId) : null,
        } as never,
        overrideAccess: true,
        context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
      })
    }
    createdIds.length = 0
    await deleteMediaByIds(payload, previousIds)

    return {
      applied: result.applied,
      skipped: result.skipped,
      warnings: result.warnings,
      editedPageIndexes,
      resetRecordIds,
      appliedImages: imageResult.applied,
      skippedImages,
    }
  } catch (error) {
    await deleteMediaByIds(payload, createdIds)
    if (error instanceof PdfUpdateError) throw error
    throw new PdfUpdateError('FAILED', error instanceof Error ? error.message : String(error))
  } finally {
    if (jobDir) await removeJobDir(jobDir).catch(() => undefined)
    busy.delete(lockKey)
  }
}

/** Font provider from the environment (`APP_FONTS_GOOGLE_API_KEY`). */
export const envFontProvider = (): W1PdfFontProvider =>
  createGoogleFontProvider({ apiKey: process.env.APP_FONTS_GOOGLE_API_KEY || process.env.GOOGLE_FONTS_API_KEY })
