import { promises as fs } from 'fs'
import type { Payload } from 'payload'
import type { W1PdfImageReplacement } from '@werk1/w1-system-pdfedit/pdf'
import type { StoredImageEdit } from '@werk1/w1-system-pdfedit/host'
import { findMedia, mediaPath } from './context'

export type LoadedReplacement = { ok: true; replacement: W1PdfImageReplacement } | { ok: false; imageId: string; reason: 'media-missing' | 'media-unreadable' }

/**
 * Reads the replacement image of a stored edit from the media storage. JPEG
 * and PNG go to the PDF as they are; everything else the media collection
 * produces (WebP) is converted to PNG with `sharp` — pdf-lib embeds only
 * JPEG and PNG.
 */
export async function loadReplacement(payload: Payload, edit: StoredImageEdit): Promise<LoadedReplacement> {
  const media = await findMedia(payload, edit.mediaId)
  const filePath = mediaPath(payload, media)
  if (!media || !filePath) return { ok: false, imageId: edit.imageId, reason: 'media-missing' }
  try {
    const file = await fs.readFile(filePath)
    let bytes: Uint8Array = new Uint8Array(file)
    let format: 'jpeg' | 'png'
    if (media.mimeType === 'image/jpeg') format = 'jpeg'
    else if (media.mimeType === 'image/png') format = 'png'
    else {
      const { default: sharp } = await import('sharp')
      bytes = new Uint8Array(await sharp(file).png().toBuffer())
      format = 'png'
    }
    return {
      ok: true,
      replacement: { imageId: edit.imageId, pageIndex: edit.pageIndex, rect: edit.rect, bytes, format, zoom: edit.zoom, panX: edit.panX, panY: edit.panY },
    }
  } catch {
    return { ok: false, imageId: edit.imageId, reason: 'media-unreadable' }
  }
}
