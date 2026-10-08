import { NextRequest, NextResponse } from 'next/server'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import type { W1PdfImageEdit } from '@werk1/w1-system-pdfedit/types'
import { currentImageEdits } from '@werk1/w1-system-pdfedit/host'
import { relationId } from '@/lib/flipbook'
import { ensureTextStyles } from '@/lib/pdfedit/textStyles'
import { ensureImageModel } from '@/lib/pdfedit/imageModel'
import { authenticateAdmin, unauthorized } from '@/lib/pdfedit/adminAuth'
import { ensureReadManifest } from '@/lib/pdfedit/readManifest'
import { errorJson, loadFlipbookOf, loadPdfedit, loadRecords } from '@/lib/pdfedit/context'
import type { MediaDoc } from '@/lib/pdfedit/context'

export const runtime = 'nodejs'

/**
 * Assembles the prepared `W1PdfEditInput` for a pdfedit document:
 * page images + text model from the flipbook's published revision and the
 * ordered records. Admin-only (editor tool).
 */

const mediaFileUrl = (filename: unknown): string | null =>
  typeof filename === 'string' && filename ? `/api/media/file/${filename}` : null

async function loadMediaMap(payload: Payload, ids: Array<string | number>): Promise<Map<string, MediaDoc>> {
  const map = new Map<string, MediaDoc>()
  if (!ids.length) return map
  const { docs } = await payload.find({
    collection: 'media',
    where: { id: { in: [...new Set(ids.map(String))] } } as never,
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
  if (!id) return errorJson(400, 'INVALID_REQUEST', 'id is required.')

  const doc = await loadPdfedit(payload, id)
  if (!doc) return errorJson(404, 'NOT_FOUND', 'Pdfedit not found.')

  const flipbook = await loadFlipbookOf(payload, doc)
  if (!flipbook || !Array.isArray(flipbook.pages) || !flipbook.publishedRevision) {
    return errorJson(422, 'NOT_READY', 'Flipbook has no published revision (convert it first).')
  }
  const flipbookPages = flipbook.pages

  // The records load beside the one-time fills of image model and text styles; those two
  // write the same flipbook and stay in sequence (no write conflict).
  const [[imageModel, styledModel], records] = await Promise.all([
    (async () => [await ensureImageModel(payload, flipbook), await ensureTextStyles(payload, flipbook)] as const)(),
    loadRecords(payload, doc.id),
  ])

  const mediaIds = [
    ...flipbookPages.map((p) => relationId(p.image)).filter((v): v is string => Boolean(v)),
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
  const storedImageEdits = imageModel ? currentImageEdits(doc.imageEdits, imageModel.revision) : []
  mediaIds.push(...storedImageEdits.filter((e) => !e.remove).map((e) => e.mediaId))
  const media = await loadMediaMap(payload, mediaIds)

  const pages = flipbookPages
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

  const pdfMedia = media.get(String(relationId(flipbook.publishedSourcePdf)))
  const textModel = styledModel ?? { revision: String(flipbook.publishedRevision), pages: [] }

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
  // `applied` counts only while the updated PDF of this revision is the one shown.
  const imageEdits: W1PdfImageEdit[] = storedImageEdits.flatMap<W1PdfImageEdit>(({ revision: _revision, applied, ...e }) => {
    void _revision
    const mark = applied && editedValid ? { applied: true } : {}
    if (e.remove) return [{ ...e, ...mark }]
    const mediaUrl = mediaFileUrl(media.get(e.mediaId)?.filename)
    // A deleted replacement media drops out of the editor (the writer skips it too).
    return mediaUrl ? [{ ...e, mediaUrl, ...mark }] : []
  })
  const editedPdfUrl = editedPdfId ? mediaFileUrl(media.get(String(editedPdfId))?.filename) : null
  // Text layer and links of the PDF the reader shows (non-fatal when missing).
  const manifestUrl = await ensureReadManifest(payload, doc, {
    readPdfId: editedPdfId ? String(editedPdfId) : relationId(flipbook.publishedSourcePdf),
    revision: String(flipbook.publishedRevision),
    pageLabels: flipbookPages.map((p) => (typeof p.label === 'string' ? p.label : '')),
  })

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
      ...(manifestUrl ? { manifestUrl } : {}),
    },
    revision: flipbook.publishedRevision,
  })
}
