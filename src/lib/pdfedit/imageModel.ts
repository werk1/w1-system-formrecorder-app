import { promises as fs } from 'fs'
import path from 'path'
import type { Payload } from 'payload'
import { extractImagePlacements } from '@werk1/w1-system-pdfedit/pdf'
import type { W1PdfImageModel } from '@werk1/w1-system-pdfedit/types'
import { relationId, W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'

type FlipbookLike = {
  id: string | number
  publishedSourcePdf?: unknown
  publishedRevision?: unknown
  imageModel?: unknown
}

const isModel = (model: unknown, revision: string): model is W1PdfImageModel =>
  Boolean(
    model &&
      typeof model === 'object' &&
      (model as W1PdfImageModel).revision === revision &&
      Array.isArray((model as W1PdfImageModel).images),
  )

/**
 * Image placements of the published revision. They are read from the source
 * PDF on first use and stored on the flipbook, bound to the revision: a new
 * revision makes the stored model stale and it is extracted again. Failures
 * return `null` — the editor then simply offers no image editing.
 */
export async function ensureImageModel(payload: Payload, flipbook: FlipbookLike): Promise<W1PdfImageModel | null> {
  const revision = typeof flipbook.publishedRevision === 'string' ? flipbook.publishedRevision : null
  if (!revision) return null
  if (isModel(flipbook.imageModel, revision)) return flipbook.imageModel
  const sourceId = relationId(flipbook.publishedSourcePdf)
  const staticDir = payload.collections.media?.config?.upload?.staticDir
  if (!sourceId || !staticDir) return null
  try {
    const source = (await payload.findByID({ collection: 'media', id: sourceId, depth: 0, overrideAccess: true })) as { filename?: unknown }
    if (typeof source.filename !== 'string' || !source.filename) return null
    const bytes = new Uint8Array(await fs.readFile(path.join(staticDir, source.filename)))
    const { images } = await extractImagePlacements(bytes)
    const model: W1PdfImageModel = { revision, images }
    await payload.update({
      collection: 'flipbooks' as never,
      id: flipbook.id,
      data: { imageModel: model } as never,
      overrideAccess: true,
      context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
    })
    return model
  } catch (error) {
    payload.logger.warn(`pdfedit: image extraction for ${flipbook.id} failed: ${String(error)}`)
    return null
  }
}
