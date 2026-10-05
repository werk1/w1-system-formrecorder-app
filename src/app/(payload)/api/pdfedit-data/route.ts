import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import type { W1PdfEditRecord, W1PdfImageEdit } from '@werk1/w1-system-pdfedit/types'
import { relationId } from '@/lib/flipbook'
import { ensureTextStyles } from '@/lib/pdfedit/textStyles'
import { ensureImageModel } from '@/lib/pdfedit/imageModel'
import { currentImageEdits } from '@/lib/pdfedit/imageEdits'

export const runtime = 'nodejs'

/**
 * Assembles the prepared `W1PdfEditInput` for a pdfedit document:
 * page images + text model from the flipbook's published revision and the
 * ordered records. Admin-only (editor tool).
 */

const unauthorized = () =>
  NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Admin login required.' } }, { status: 401 })

async function authenticateAdmin(payload: Payload, request: NextRequest): Promise<boolean> {
  try {
    const { user } = await payload.auth({ headers: request.headers })
    return Boolean(user) && Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

type MediaDoc = { id: string | number; filename?: unknown; alt?: unknown }
type PageRow = { image?: unknown; width?: unknown; height?: unknown; label?: unknown }
type FlipbookDoc = {
  id: string | number
  title?: unknown
  slug?: unknown
  publishedSourcePdf?: unknown
  publishedRevision?: unknown
  textModel?: unknown
  imageModel?: unknown
  pages?: PageRow[] | null
}
type PdfeditDoc = {
  id: string | number
  title?: unknown
  slug?: unknown
  flipbook?: unknown
  editedPdf?: unknown
  editedPages?: Array<{ pageIndex?: unknown; image?: unknown; width?: unknown; height?: unknown }> | null
  editedRevision?: unknown
  imageEdits?: unknown
}
type PdfeditrecordDoc = {
  id: string | number
  order?: unknown
  name?: unknown
  pageIndex?: unknown
  blocks?: unknown
}

const mediaFileUrl = (filename: unknown): string | null =>
  typeof filename === 'string' && filename ? `/api/media/file/${filename}` : null

async function loadMediaMap(payload: Payload, ids: Array<string | number>): Promise<Map<string, MediaDoc>> {
  const map = new Map<string, MediaDoc>()
  if (!ids.length) return map
  const { docs } = await payload.find({
    collection: 'media',
    where: { id: { in: ids } } as never,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const doc of docs as unknown as MediaDoc[]) map.set(String(doc.id), doc)
  return map
}

export async function GET(request: NextRequest) {
  const payload = await getPayload({ config: configPromise })
  if (!(await authenticateAdmin(payload, request))) return unauthorized()

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: { code: 'INVALID_REQUEST', message: 'id is required.' } }, { status: 400 })
  }

  const doc = (await payload
    .findByID({ collection: 'pdfedits' as never, id, depth: 0, overrideAccess: true })
    .catch(() => null)) as PdfeditDoc | null
  if (!doc) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Pdfedit not found.' } }, { status: 404 })
  }

  const flipbookId = relationId(doc.flipbook)
  const flipbook = flipbookId
    ? ((await payload
        .findByID({ collection: 'flipbooks' as never, id: flipbookId, depth: 0, overrideAccess: true })
        .catch(() => null)) as FlipbookDoc | null)
    : null
  if (!flipbook || !Array.isArray(flipbook.pages) || !flipbook.publishedRevision) {
    return NextResponse.json(
      { error: { code: 'NOT_READY', message: 'Flipbook has no published revision (convert it first).' } },
      { status: 422 },
    )
  }

  const mediaIds = [
    ...flipbook.pages.map((p) => relationId(p.image)).filter((v): v is string => Boolean(v)),
    relationId(flipbook.publishedSourcePdf),
  ].filter((v): v is string => Boolean(v))

  // The updated PDF is only valid for the revision it was built from.
  const editedValid = doc.editedRevision === flipbook.publishedRevision
  const editedRows = editedValid ? (doc.editedPages ?? []) : []
  const editedPdfId = editedValid ? relationId(doc.editedPdf) : null
  mediaIds.push(
    ...editedRows.map((p) => relationId(p.image)).filter((v): v is string => Boolean(v)),
    ...(editedPdfId ? [editedPdfId] : []),
  )
  const imageModel = await ensureImageModel(payload, flipbook)
  const storedImageEdits = imageModel ? currentImageEdits(doc.imageEdits, imageModel.revision) : []
  mediaIds.push(...storedImageEdits.map((e) => e.mediaId))
  const media = await loadMediaMap(payload, mediaIds)

  const pages = flipbook.pages
    .map((p, index) => {
      const img = media.get(String(relationId(p.image)))
      const imageUrl = mediaFileUrl(img?.filename)
      if (!imageUrl) return null
      return {
        id: String(relationId(p.image) ?? `page-${index}`),
        imageUrl,
        width: typeof p.width === 'number' ? p.width : 0,
        height: typeof p.height === 'number' ? p.height : 0,
        alt: typeof img?.alt === 'string' ? img.alt : `Seite ${index + 1}`,
        label: typeof p.label === 'string' ? p.label : undefined,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const { docs: recordDocs } = await payload.find({
    collection: 'pdfeditrecords' as never,
    where: { pdfedit: { equals: doc.id } } as never,
    sort: 'order',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const records = (recordDocs as unknown as PdfeditrecordDoc[]).map((r) => ({
    id: String(r.id),
    order: typeof r.order === 'number' ? r.order : 0,
    ...(typeof r.name === 'string' && r.name ? { name: r.name } : {}),
    pageIndex: typeof r.pageIndex === 'number' ? r.pageIndex : undefined,
    blocks: Array.isArray(r.blocks) ? (r.blocks as W1PdfEditRecord['blocks']) : [],
  }))

  const pdfMedia = media.get(String(relationId(flipbook.publishedSourcePdf)))
  const textModel = (await ensureTextStyles(payload, flipbook)) ?? { revision: String(flipbook.publishedRevision), pages: [] }

  const editedPages: Array<(typeof pages)[number] | null> = pages.map(() => null)
  for (const row of editedRows) {
    const index = typeof row.pageIndex === 'number' ? row.pageIndex : -1
    const img = media.get(String(relationId(row.image)))
    const imageUrl = mediaFileUrl(img?.filename)
    if (index < 0 || index >= pages.length || !imageUrl) continue
    editedPages[index] = {
      ...pages[index],
      id: String(relationId(row.image)),
      imageUrl,
      width: typeof row.width === 'number' ? row.width : pages[index].width,
      height: typeof row.height === 'number' ? row.height : pages[index].height,
      alt: `${pages[index].alt} (aktualisiert)`,
    }
  }
  const imageEdits: W1PdfImageEdit[] = storedImageEdits.flatMap((e) => {
    const mediaUrl = mediaFileUrl(media.get(e.mediaId)?.filename)
    // A deleted replacement media drops out of the editor (the writer skips it too).
    return mediaUrl ? [{ imageId: e.imageId, pageIndex: e.pageIndex, mediaId: e.mediaId, mediaUrl, rect: e.rect }] : []
  })
  const editedPdfUrl = editedPdfId ? mediaFileUrl(media.get(String(editedPdfId))?.filename) : null

  return NextResponse.json({
    input: {
      slug: typeof doc.slug === 'string' ? doc.slug : String(doc.id),
      title: typeof doc.title === 'string' ? doc.title : undefined,
      pages,
      pdfUrl: mediaFileUrl(pdfMedia?.filename) ?? '',
      textModel,
      records,
      ...(imageModel ? { imageModel, imageEdits } : {}),
      ...(editedPages.some(Boolean) ? { editedPages } : {}),
      ...(editedPdfUrl ? { editedPdfUrl } : {}),
    },
    revision: flipbook.publishedRevision,
  })
}
