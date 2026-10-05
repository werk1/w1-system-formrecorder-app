import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import { relationId } from '@/lib/flipbook'
import { ensureImageModel } from '@/lib/pdfedit/imageModel'
import {
  ImageEditError,
  buildImageEdit,
  currentImageEdits,
  imageMimeAllowed,
  upsertImageEdit,
} from '@/lib/pdfedit/imageEdits'

export const runtime = 'nodejs'

/**
 * Image replacements of the pdfedit editor. Admin-only. Only stores the
 * intent (which image gets which media at which box); the PDF is written by
 * `pdfedit-pdf` ("PDF aktualisieren").
 *
 * POST   { pdfeditId, edit: { imageId, mediaId, rect? } } → upsert; returns the stored edit.
 *        `rect` defaults to the image's current box.
 * DELETE { pdfeditId, imageId } → back to the original image.
 */

const errorJson = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status })

async function authenticateAdmin(payload: Payload, request: NextRequest): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    return Boolean(user) && Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

type Body = {
  pdfeditId?: string | number
  edit?: { imageId?: unknown; mediaId?: unknown; rect?: unknown }
  imageId?: unknown
}

type FlipbookDoc = {
  id: string | number
  publishedSourcePdf?: unknown
  publishedRevision?: unknown
  imageModel?: unknown
}

async function loadContext(payload: Payload, pdfeditId: string | number) {
  const doc = (await payload
    .findByID({ collection: 'pdfedits' as never, id: pdfeditId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: string | number; flipbook?: unknown; imageEdits?: unknown } | null
  if (!doc) return { error: errorJson(404, 'NOT_FOUND', 'Pdfedit not found.') }
  const flipbookId = relationId(doc.flipbook)
  const flipbook = flipbookId
    ? ((await payload
        .findByID({ collection: 'flipbooks' as never, id: flipbookId, depth: 0, overrideAccess: true })
        .catch(() => null)) as FlipbookDoc | null)
    : null
  if (!flipbook?.publishedRevision) return { error: errorJson(422, 'NOT_READY', 'Flipbook has no published revision.') }
  const model = await ensureImageModel(payload, flipbook)
  if (!model) return { error: errorJson(422, 'NO_IMAGE_MODEL', 'Images of the PDF could not be read.') }
  return { doc, model }
}

export async function POST(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return errorJson(401, 'UNAUTHORIZED', 'Admin login required.')

  const body = (await request.json().catch(() => null)) as Body | null
  if (body?.pdfeditId === undefined || !body.edit) return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and edit are required.')

  const ctx = await loadContext(payload, body.pdfeditId)
  if ('error' in ctx) return ctx.error
  try {
    const edit = buildImageEdit(ctx.model, body.edit)
    const media = (await payload
      .findByID({ collection: 'media', id: edit.mediaId, depth: 0, overrideAccess: true })
      .catch(() => null)) as { mimeType?: unknown } | null
    if (!media) throw new ImageEditError('BAD_MEDIA', 'Media not found.')
    if (!imageMimeAllowed(media.mimeType)) throw new ImageEditError('BAD_MEDIA', 'Only JPEG, PNG and WebP images can be placed in a PDF.')
    const next = upsertImageEdit(currentImageEdits(ctx.doc.imageEdits, ctx.model.revision), edit)
    await payload.update({
      collection: 'pdfedits' as never,
      id: ctx.doc.id,
      data: { imageEdits: next } as never,
      overrideAccess: true,
    })
    return NextResponse.json({ edit })
  } catch (error) {
    if (error instanceof ImageEditError) return errorJson(error.code === 'NOT_EDITABLE' ? 422 : 400, error.code, error.message)
    return errorJson(500, 'STORE_FAILED', String(error instanceof Error ? error.message : error))
  }
}

export async function DELETE(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return errorJson(401, 'UNAUTHORIZED', 'Admin login required.')

  const body = (await request.json().catch(() => null)) as Body | null
  if (body?.pdfeditId === undefined || typeof body.imageId !== 'string') {
    return errorJson(400, 'INVALID_REQUEST', 'pdfeditId and imageId are required.')
  }
  const ctx = await loadContext(payload, body.pdfeditId)
  if ('error' in ctx) return ctx.error
  const next = currentImageEdits(ctx.doc.imageEdits, ctx.model.revision).filter((e) => e.imageId !== body.imageId)
  await payload.update({
    collection: 'pdfedits' as never,
    id: ctx.doc.id,
    data: { imageEdits: next } as never,
    overrideAccess: true,
  })
  return NextResponse.json({ ok: true })
}
