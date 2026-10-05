import type { W1FormRect, W1PdfImageModel, W1PdfImagePlacement } from '@werk1/w1-system-pdfedit/types'

/** One persisted image replacement of a pdfedit document (`pdfedits.imageEdits`). */
export type StoredImageEdit = {
  imageId: string
  /** Flipbook revision whose image ids this edit references. */
  revision: string
  pageIndex: number
  /** Replacement media; empty when the image is removed. */
  mediaId: string
  /** The image is deleted from the PDF, not replaced. */
  remove?: true
  rect: W1FormRect
}

export class ImageEditError extends Error {
  constructor(
    readonly code: 'INVALID_REQUEST' | 'UNKNOWN_IMAGE' | 'NOT_EDITABLE' | 'BAD_MEDIA',
    message: string,
  ) {
    super(message)
  }
}

/** Largest overhang of the target box over the page (a replacement may bleed slightly). */
const MARGIN = 0.25
const MIN_SIDE = 0.005
// The media collection converts uploads to WebP; the PDF update converts it to PNG for embedding.
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const imageMimeAllowed = (mimeType: unknown): boolean => typeof mimeType === 'string' && IMAGE_MIME.has(mimeType)

/** Why an image cannot be replaced, or `null` when it can. Mirrors the editor's rules. */
export const notEditableReason = (image: W1PdfImagePlacement): string | null => {
  if (image.fullPage) return 'Ganzseitige Bilder (Scans) werden nicht ersetzt.'
  if (image.rotated) return 'Gedrehte oder geneigte Bilder werden nicht ersetzt.'
  return null
}

/** Validates the target box: finite, a sensible size, and (almost) on the page. */
export function sanitizeRect(raw: unknown): W1FormRect {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  if (!finite(r.x) || !finite(r.y) || !finite(r.w) || !finite(r.h)) {
    throw new ImageEditError('INVALID_REQUEST', 'rect {x,y,w,h} must be finite numbers.')
  }
  if (r.w < MIN_SIDE || r.h < MIN_SIDE || r.w > 1 + 2 * MARGIN || r.h > 1 + 2 * MARGIN) {
    throw new ImageEditError('INVALID_REQUEST', 'rect has an unusable size.')
  }
  if (r.x < -MARGIN || r.y < -MARGIN || r.x + r.w > 1 + MARGIN || r.y + r.h > 1 + MARGIN) {
    throw new ImageEditError('INVALID_REQUEST', 'rect lies outside the page.')
  }
  return { x: r.x, y: r.y, w: r.w, h: r.h }
}

/** Builds the stored edit for an image of the current model; throws `ImageEditError` otherwise. */
export function buildImageEdit(
  model: W1PdfImageModel,
  input: { imageId?: unknown; mediaId?: unknown; remove?: unknown; rect?: unknown },
): StoredImageEdit {
  if (typeof input.imageId !== 'string' || !input.imageId) throw new ImageEditError('INVALID_REQUEST', 'imageId is required.')
  const remove = input.remove === true
  if (!remove && (input.mediaId === undefined || input.mediaId === null || input.mediaId === '')) {
    throw new ImageEditError('INVALID_REQUEST', 'mediaId is required.')
  }
  const image = model.images.find((i) => i.id === input.imageId)
  if (!image) throw new ImageEditError('UNKNOWN_IMAGE', 'Image does not exist in the published revision.')
  const reason = notEditableReason(image)
  if (reason) throw new ImageEditError('NOT_EDITABLE', reason)
  return {
    imageId: image.id,
    revision: model.revision,
    pageIndex: image.pageIndex,
    mediaId: remove ? '' : String(input.mediaId),
    ...(remove ? { remove: true as const } : {}),
    rect: sanitizeRect(input.rect ?? image.rect),
  }
}

/** Reads the stored field defensively; entries of another revision are dropped. */
export function currentImageEdits(raw: unknown, revision: string): StoredImageEdit[] {
  if (!Array.isArray(raw)) return []
  const out: StoredImageEdit[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as Partial<StoredImageEdit>
    if (e.revision !== revision || typeof e.imageId !== 'string' || typeof e.pageIndex !== 'number' || !e.rect) continue
    if (e.remove === true) {
      out.push({ imageId: e.imageId, revision, pageIndex: e.pageIndex, mediaId: '', remove: true, rect: e.rect })
      continue
    }
    if (e.mediaId === undefined || e.mediaId === null || e.mediaId === '') continue
    out.push({ imageId: e.imageId, revision, pageIndex: e.pageIndex, mediaId: String(e.mediaId), rect: e.rect })
  }
  return out
}

/** Replaces the edit of the same image or appends it. */
export const upsertImageEdit = (edits: readonly StoredImageEdit[], edit: StoredImageEdit): StoredImageEdit[] => [
  ...edits.filter((e) => e.imageId !== edit.imageId),
  edit,
]
