import type { Payload } from 'payload'
import { applyTextStyles, W1_TEXT_STYLE_REVISION } from '@werk1/w1-system-pdfedit/extract'
import type { W1FormTextModel } from '@werk1/w1-system-pdfedit/types'
import { extractStyleLayout } from '@/lib/flipbook/pdfConverter'
import { relationId, W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'
import { findMedia, mediaPath } from './context'

type FlipbookLike = { id: string | number; publishedSourcePdf?: unknown; textModel?: unknown }

const hasBlocks = (model: W1FormTextModel): boolean => model.pages.some((p) => p.blocks.length > 0)

/**
 * Text models of documents converted before style extraction existed carry no
 * block styles, or styles of an older extraction version. This reads them from
 * the original PDF and stores the styled model on the flipbook; newer
 * conversions already include current styles.
 * Failures keep the unstyled model — the editor then uses its default look.
 */
export async function ensureTextStyles(payload: Payload, flipbook: FlipbookLike): Promise<W1FormTextModel | null> {
  const model = flipbook.textModel as W1FormTextModel | null
  if (!model || !Array.isArray(model.pages)) return null
  if (!hasBlocks(model) || (model.styled && model.spanned && model.styleRevision === W1_TEXT_STYLE_REVISION)) return model
  const sourceId = relationId(flipbook.publishedSourcePdf)
  if (!sourceId) return model
  try {
    const sourcePath = mediaPath(payload, await findMedia(payload, sourceId))
    if (!sourcePath) return model
    const styled = applyTextStyles(model, await extractStyleLayout(sourcePath))
    await payload.update({
      collection: 'flipbooks' as never,
      id: flipbook.id,
      data: { textModel: styled } as never,
      overrideAccess: true,
      context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
    })
    return styled
  } catch (error) {
    payload.logger.warn(`pdfedit: style extraction for ${flipbook.id} failed: ${String(error)}`)
    return model
  }
}
