import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { ensureImageModel } from '@/lib/pdfedit/imageModel'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { errorJson, findMedia, imageEditsKey, loadFlipbookOf, loadPdfedit, serialize } from '@/lib/pdfedit/context'
import type { IdLike } from '@/lib/pdfedit/context'
import {
  ImageEditError,
  buildImageEdit,
  currentImageEdits,
  imageMimeAllowed,
  upsertImageEdit,
} from '@werk1/w1-system-pdfedit/host'
import type { StoredImageEdit } from '@werk1/w1-system-pdfedit/host'
import type { W1PdfImageModel } from '@werk1/w1-system-pdfedit/types'

export const runtime = 'nodejs'

/**
 * Image replacements of the pdfedit editor. Admin-only. Only stores the
 * intent (which image gets which media at which box); the PDF is written by
 * `pdfedit-pdf` ("PDF aktualisieren"). A stored edit is pending until that
 * update marks it `applied`.
 *
 * POST   { pdfeditId, edit: { imageId, mediaId, rect?, zoom?, panX?, panY? } } → upsert; returns the stored edit.
 *        `rect` is the container (defaults to the image's current box); `zoom`/`panX`/`panY` position
 *        the image inside it (see `W1PdfImageEdit`).
 *        `{ imageId, remove: true }` deletes the image from the PDF instead (no media).
 * DELETE { pdfeditId, imageId } → back to the original image.
 */

type Body = {
  pdfeditId?: string | number
  edit?: { imageId?: unknown; mediaId?: unknown; remove?: unknown; rect?: unknown; zoom?: unknown; panX?: unknown; panY?: unknown }
  imageId?: unknown
}

async function loadModel(payload: Payload, pdfeditId: IdLike) {
  const doc = await loadPdfedit(payload, pdfeditId)
  if (!doc) return { error: errorJson(404, 'NOT_FOUND', 'Pdfedit not found.') }
  const flipbook = await loadFlipbookOf(payload, doc)
  if (!flipbook?.publishedRevision) return { error: errorJson(422, 'NOT_READY', 'Flipbook has no published revision.') }
  const model = await ensureImageModel(payload, flipbook)
  if (!model) return { error: errorJson(422, 'NO_IMAGE_MODEL', 'Images of the PDF could not be read.') }
  return { doc, model }
}

/**
 * Read-modify-write of the stored edits, serialized per document: two saves
 * at once (or a save during a PDF update) never drop each other's edit.
 */
const changeImageEdits = (payload: Payload, pdfeditId: IdLike, model: W1PdfImageModel, change: (edits: StoredImageEdit[]) => StoredImageEdit[]) =>
  serialize(imageEditsKey(pdfeditId), async () => {
    const fresh = await loadPdfedit(payload, pdfeditId)
    await payload.update({
      collection: 'pdfedits' as never,
      id: pdfeditId,
      data: { imageEdits: change(currentImageEdits(fresh?.imageEdits, model.revision)) } as never,
      overrideAccess: true,
    })
  })

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as Body | null
  if (body?.pdfeditId === undefined || !body.edit) return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and edit are required.')

  const ctx = await loadModel(payload, body.pdfeditId)
  if ('error' in ctx) return ctx.error
  try {
    const edit = buildImageEdit(ctx.model, body.edit)
    if (!edit.remove) {
      const media = await findMedia(payload, edit.mediaId)
      if (!media) throw new ImageEditError('BAD_MEDIA', 'Media not found.')
      if (!imageMimeAllowed(media.mimeType)) throw new ImageEditError('BAD_MEDIA', 'Only JPEG, PNG and WebP images can be placed in a PDF.')
    }
    await changeImageEdits(payload, ctx.doc.id, ctx.model, (edits) => upsertImageEdit(edits, edit))
    return NextResponse.json({ edit })
  } catch (error) {
    if (error instanceof ImageEditError) return errorJson(error.code === 'NOT_EDITABLE' ? 422 : 400, error.code, error.message)
    return errorJson(500, 'STORE_FAILED', String(error instanceof Error ? error.message : error))
  }
}

export async function DELETE(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const body = (await request.json().catch(() => null)) as Body | null
  if (body?.pdfeditId === undefined || typeof body.imageId !== 'string') {
    return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and imageId are required.')
  }
  const imageId = body.imageId
  const ctx = await loadModel(payload, body.pdfeditId)
  if ('error' in ctx) return ctx.error
  try {
    await changeImageEdits(payload, ctx.doc.id, ctx.model, (edits) => edits.filter((e) => e.imageId !== imageId))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorJson(500, 'STORE_FAILED', String(error instanceof Error ? error.message : error))
  }
}
