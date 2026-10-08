import type { Payload } from 'payload'
import { blockOwners, mergeTextBlocks, splitTextBlock } from '@werk1/w1-system-pdfedit/export'
import type { W1FormTextModel } from '@werk1/w1-system-pdfedit/types'
import { W1_SKIP_FLIPBOOK_CONVERSION } from '@/lib/flipbook/payloadFlipbookConversion'
import { loadFlipbookOf, loadPdfedit, loadRecords } from './context'

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
 * Returns the number of changed groups; nothing is written without a change.
 */
export async function editTextModel(payload: Payload, pdfeditId: string | number, op: TextModelOp): Promise<{ changed: number }> {
  const doc = await loadPdfedit(payload, pdfeditId)
  const flipbook = doc ? await loadFlipbookOf(payload, doc) : null
  if (!doc || !flipbook) throw new TextModelEditError('NOT_FOUND', 'Pdfedit nicht gefunden.')
  const model = flipbook.textModel as W1FormTextModel | null
  if (!model || !Array.isArray(model.pages)) throw new TextModelEditError('NO_TEXT_MODEL', 'Das Dokument hat kein Textmodell.')

  const owners = blockOwners(await loadRecords(payload, doc.id))
  const guard = (ids: string[]) => {
    if (ids.some((id) => owners.has(id))) throw new TextModelEditError('BLOCK_IN_USE', 'Blöcke, die einem Datensatz gehören, können nicht verbunden oder getrennt werden.')
  }
  let next = model
  if (op.op === 'merge') {
    if (!Array.isArray(op.blockIds) || op.blockIds.length < 2) throw new TextModelEditError('INVALID', 'Mindestens zwei Blöcke nötig.')
    guard(op.blockIds)
    next = mergeTextBlocks(model, op.blockIds)
  } else if (op.op === 'split') {
    guard([op.blockId])
    next = splitTextBlock(model, op.blockId)
  }
  // Both return the very same model when nothing changes.
  const changed = next === model ? 0 : 1
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
