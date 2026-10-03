/**
 * Cover resolution for flipbooks (pure, no Payload imports).
 *
 * Default is page 1. Admins can pick another page (1-based) or upload an own
 * image. A page beyond the published page count falls back to page 1; an
 * `upload` cover without an image falls back to the page choice.
 */

export type FlipbookCoverSource = 'page' | 'upload'

export type FlipbookCoverSettings = {
  source?: unknown
  page?: unknown
  image?: unknown
} | null | undefined

type PageEntry = { image?: unknown } | null | undefined

const idOf = (value: unknown): string | null => {
  const raw = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null
}

export function resolveCoverImageId(cover: FlipbookCoverSettings, pages: PageEntry[] | null | undefined): string | null {
  if (cover?.source === 'upload') {
    const uploaded = idOf(cover.image)
    if (uploaded) return uploaded
  }
  const list = Array.isArray(pages) ? pages : []
  if (list.length === 0) return null
  const requested = typeof cover?.page === 'number' && Number.isInteger(cover.page) ? cover.page : 1
  const index = requested >= 1 && requested <= list.length ? requested - 1 : 0
  return idOf(list[index]?.image) ?? idOf(list[0]?.image)
}
