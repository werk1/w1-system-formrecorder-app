import { promises as fs } from 'fs'
import path from 'path'
import type { Payload } from 'payload'
import { collectEdits, currentImageEdits, markAppliedImageEdits, resetPageBlocks } from '@werk1/w1-system-pdfedit/host'
import type { StoredImageEdit } from '@werk1/w1-system-pdfedit/host'
import { applyImageEdits, applyTextEdits } from '@werk1/w1-system-pdfedit/pdf'
import type { W1PdfFontProvider, W1PdfImageReplacement } from '@werk1/w1-system-pdfedit/pdf'
import type { W1FormTextModel } from '@werk1/w1-system-pdfedit/types'
import { createJobDir, removeJobDir, renderPage } from '@/lib/flipbook/pdfConverter'
import { deleteMediaByIds } from '@/lib/flipbook/cleanup'
import { relationId, W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'
import { createGoogleFontProvider } from './googleFonts'
import { loadReplacement } from './imageFiles'
import { findMedia, imageEditsKey, loadFlipbookOf, loadPdfedit, loadRecords, mediaPath, PDFEDIT_GENERATOR, serialize } from './context'
import { ensureReadManifest } from './readManifest'
import type { IdLike, MediaDoc } from './context'

export { PDFEDIT_GENERATOR } from './context'

export type PdfUpdateAction = { type: 'apply' } | { type: 'restore'; pageIndex: number } | { type: 'restoreAll' }

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

// In-process guard: a second update of the same document is refused while one runs.
// Several app instances would need a lock in the database.
const busy = new Set<string>()

/** A generated media file of this pdfedit (backup, updated PDF, page preview). */
const createGeneratedMedia = async (payload: Payload, params: { filePath: string; alt: string; pdfeditId: IdLike; revision: string }) =>
  (await payload.create({
    collection: 'media',
    data: { alt: params.alt, generatedBy: PDFEDIT_GENERATOR, generatedFor: String(params.pdfeditId), generatedRevision: params.revision } as never,
    filePath: params.filePath,
    overrideAccess: true,
  })) as MediaDoc

/**
 * Writes the edited record texts and the image edits into the PDF and
 * recomputes the previews of the changed pages. The original PDF (the
 * flipbook source) is never touched: a backup copy is made on first use, and
 * every run starts from it, so runs never stack. A `restore` writes the PDF
 * without the texts and images of one page (`restoreAll`: of all pages); the
 * records and image edits are reset only once that PDF exists.
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
    const doc = await loadPdfedit(payload, pdfeditId)
    if (!doc) throw new PdfUpdateError('NOT_FOUND', 'Pdfedit nicht gefunden.')
    const flipbook = await loadFlipbookOf(payload, doc)
    const revision = typeof flipbook?.publishedRevision === 'string' ? flipbook.publishedRevision : null
    const sourceId = relationId(flipbook?.publishedSourcePdf)
    if (!flipbook || !revision || !sourceId) throw new PdfUpdateError('NOT_READY', 'Das Flipbook ist nicht konvertiert.')
    const model = flipbook.textModel as W1FormTextModel | null
    if (!model || !Array.isArray(model.pages)) throw new PdfUpdateError('NO_TEXT_MODEL', 'Das Dokument hat kein Textmodell.')

    // A restore resets texts and image edits — in memory first, stored only after the PDF was written.
    const storedRecords = await loadRecords(payload, doc.id)
    const resetRecords =
      action.type === 'restore' ? resetPageBlocks(model, storedRecords, action.pageIndex) : action.type === 'restoreAll' ? resetPageBlocks(model, storedRecords) : []
    const records = storedRecords.map((r) => resetRecords.find((c) => c.id === r.id) ?? r)
    const droppedByRestore = (e: { pageIndex: number }) => action.type === 'restoreAll' || (action.type === 'restore' && e.pageIndex === action.pageIndex)
    const imageEdits = currentImageEdits(doc.imageEdits, revision).filter((e) => !droppedByRestore(e))

    // The flipbook source file is the pristine original; keep a backup copy once per revision.
    const sourcePath = mediaPath(payload, await findMedia(payload, sourceId))
    if (!sourcePath) throw new PdfUpdateError('FAILED', 'Die Quell-PDF-Datei fehlt.')
    const previousBackupId = relationId(doc.originalPdf)
    let backup = previousBackupId ? await findMedia(payload, previousBackupId) : null
    if (!backup || backup.generatedRevision !== revision || !mediaPath(payload, backup)) {
      backup = await createGeneratedMedia(payload, { filePath: sourcePath, alt: 'PDF-Original (Sicherung)', pdfeditId, revision })
      if (previousBackupId) await deleteMediaByIds(payload, [previousBackupId])
    }
    const backupPath = mediaPath(payload, backup)
    if (!backupPath) throw new PdfUpdateError('FAILED', 'Die Sicherung des Original-PDFs fehlt.')
    const original = new Uint8Array(await fs.readFile(backupPath))

    // Images first (they work on the original's paint operators), then the texts on top of that result.
    const skippedImages: PdfUpdateResult['skippedImages'] = []
    const replacements: W1PdfImageReplacement[] = []
    for (const edit of imageEdits) {
      if (edit.remove) {
        replacements.push({ imageId: edit.imageId, pageIndex: edit.pageIndex, rect: edit.rect, remove: true })
        continue
      }
      const loaded = await loadReplacement(payload, edit)
      if (loaded.ok) replacements.push(loaded.replacement)
      else skippedImages.push({ imageId: loaded.imageId, reason: loaded.reason })
    }
    const imageResult = replacements.length
      ? await applyImageEdits(original, replacements)
      : { bytes: original, applied: [] as string[], skipped: [], warnings: [] as string[] }
    skippedImages.push(...imageResult.skipped.map((s) => ({ imageId: s.imageId, reason: s.reason })))
    const appliedImageSet = new Set(imageResult.applied)
    const writtenImageEdits: StoredImageEdit[] = imageEdits.filter((e) => appliedImageSet.has(e.imageId))

    const edits = collectEdits(model, records)
    const result = await applyTextEdits(imageResult.bytes, edits, { fontProvider: options.fontProvider })
    result.warnings.unshift(...imageResult.warnings)
    const appliedSet = new Set(result.applied)
    const editedPageIndexes = [
      ...new Set([...edits.filter((e) => appliedSet.has(e.blockId)).map((e) => e.pageIndex), ...writtenImageEdits.map((e) => e.pageIndex)]),
    ].sort((a, b) => a - b)

    // Previous generated edited files are replaced after the new ones exist.
    const previousEditedPdf = relationId(doc.editedPdf)
    const previousIds: IdLike[] = [
      ...(previousEditedPdf ? [previousEditedPdf] : []),
      ...(doc.editedPages ?? []).map((p) => relationId(p.image)).filter((v): v is string => Boolean(v)),
    ]

    let editedPdfId: IdLike | null = null
    const editedPages: Array<{ pageIndex: number; image: IdLike; width: number; height: number }> = []
    if (editedPageIndexes.length > 0) {
      jobDir = await createJobDir()
      const editedPath = path.join(jobDir, `pdfedit-${pdfeditId}-edited.pdf`)
      await fs.writeFile(editedPath, result.bytes)
      const editedMedia = await createGeneratedMedia(payload, { filePath: editedPath, alt: 'PDF (aktualisiert)', pdfeditId, revision })
      createdIds.push(editedMedia.id)
      editedPdfId = editedMedia.id
      for (const pageIndex of editedPageIndexes) {
        const rendered = await renderPage(editedPath, pageIndex + 1, jobDir)
        const target = path.join(jobDir, `pdfedit-${pdfeditId}-p${String(pageIndex + 1).padStart(4, '0')}.png`)
        await fs.rename(rendered.filePath, target)
        const image = await createGeneratedMedia(payload, { filePath: target, alt: `Seite ${pageIndex + 1} (aktualisiert)`, pdfeditId, revision })
        createdIds.push(image.id)
        editedPages.push({ pageIndex, image: image.id, width: rendered.width, height: rendered.height })
      }
    }

    // The PDF exists: store it, and mark the image edits it contains. The edits are read
    // again under the image-edit lock, so a save made during this update is kept (pending).
    await serialize(imageEditsKey(doc.id), async () => {
      const fresh = await loadPdfedit(payload, doc.id)
      const stored = currentImageEdits(fresh?.imageEdits, revision).filter((e) => !droppedByRestore(e))
      await payload.update({
        collection: 'pdfedits' as never,
        id: doc.id,
        data: {
          originalPdf: backup.id,
          editedPdf: editedPdfId,
          editedPages,
          editedAt: editedPageIndexes.length > 0 ? new Date().toISOString() : null,
          editedRevision: editedPageIndexes.length > 0 ? revision : null,
          imageEdits: markAppliedImageEdits(stored, writtenImageEdits),
        } as never,
        overrideAccess: true,
      })
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
          pageOverrides: editedPages,
          pdfOverride: editedPdfId,
          overrideRevision: hasEdits ? revision : null,
          overrideSource: hasEdits ? String(pdfeditId) : null,
          // The manifest of the new PDF follows in the background (see below).
          overrideManifestUrl: null,
          overrideManifestFor: null,
        } as never,
        overrideAccess: true,
        context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
      })
    }
    createdIds.length = 0
    await deleteMediaByIds(payload, previousIds)

    // Restored texts go back to the records last: the PDF without them is stored by now.
    const resetRecordIds: string[] = []
    for (const record of resetRecords) {
      await payload.update({ collection: 'pdfeditrecords' as never, id: record.id, data: { blocks: record.blocks } as never, overrideAccess: true })
      resetRecordIds.push(record.id)
    }

    // Text layer and links of the updated PDF for the reader and the reading view:
    // built in the background, the response does not wait for it.
    if (editedPdfId) {
      const fresh = await loadPdfedit(payload, doc.id)
      if (fresh) {
        void ensureReadManifest(payload, fresh, {
          editedPdfId: String(editedPdfId),
          flipbook,
          revision,
          pageLabels: (flipbook.pages ?? []).map((p) => (typeof p.label === 'string' ? p.label : '')),
        })
      }
    }

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
