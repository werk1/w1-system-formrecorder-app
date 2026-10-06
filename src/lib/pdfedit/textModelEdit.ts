import type { Payload } from 'payload'
import { blockOwners, mergeTextBlocks, splitTextBlock } from '@werk1/w1-system-pdfedit/export'
import type { W1FormTextModel, W1PdfEditRecord } from '@werk1/w1-system-pdfedit/types'
import { relationId, W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'

export type TextModelOp =
  | { op: 'merge'; blockIds: string[] }
  | { op: 'split'; blockId: string }

export class TextModelEditError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'NO_TEXT_MODEL' | 'BLOCK_IN_USE' | 'INVALID',
    message: string,
  ) {
    super(message)
  }
}

/**
 * Merges or splits text blocks of the stored text model. Blocks that belong to
 * a record are refused: records and PDF edits address blocks by id and rect.
 * Returns the number of changed groups.
 */
export async function editTextModel(payload: Payload, pdfeditId: string | number, op: TextModelOp): Promise<{ changed: number }> {
  const doc = (await payload
    .findByID({ collection: 'pdfedits' as never, id: pdfeditId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: string | number; flipbook?: unknown } | null
  const flipbookId = doc ? relationId(doc.flipbook) : null
  const flipbook = flipbookId
    ? ((await payload.findByID({ collection: 'flipbooks' as never, id: flipbookId, depth: 0, overrideAccess: true }).catch(() => null)) as
        | { id: string | number; textModel?: unknown }
        | null)
    : null
  if (!doc || !flipbook) throw new TextModelEditError('NOT_FOUND', 'Pdfedit nicht gefunden.')
  const model = flipbook.textModel as W1FormTextModel | null
  if (!model || !Array.isArray(model.pages)) throw new TextModelEditError('NO_TEXT_MODEL', 'Das Dokument hat kein Textmodell.')

  const { docs } = await payload.find({
    collection: 'pdfeditrecords' as never,
    where: { pdfedit: { equals: doc.id } } as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const owners = blockOwners(
    (docs as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      order: 0,
      blocks: Array.isArray(r.blocks) ? (r.blocks as W1PdfEditRecord['blocks']) : [],
    })),
  )

  let next = model
  let changed = 0
  const guard = (ids: string[]) => {
    if (ids.some((id) => owners.has(id))) throw new TextModelEditError('BLOCK_IN_USE', 'Blöcke, die einem Datensatz gehören, können nicht verbunden oder getrennt werden.')
  }
  if (op.op === 'merge') {
    if (!Array.isArray(op.blockIds) || op.blockIds.length < 2) throw new TextModelEditError('INVALID', 'Mindestens zwei Blöcke nötig.')
    guard(op.blockIds)
    next = mergeTextBlocks(model, op.blockIds)
    changed = next === model ? 0 : 1
  } else if (op.op === 'split') {
    guard([op.blockId])
    next = splitTextBlock(model, op.blockId)
    changed = next === model ? 0 : 1
  }
  if (changed > 0) {
    await payload.update({
      collection: 'flipbooks' as never,
      id: flipbook.id,
      data: { textModel: next } as never,
      overrideAccess: true,
      context: { [W1_SKIP_FLIPBOOK_CONVERSION]: true },
    })
  }
  return { changed }
}
