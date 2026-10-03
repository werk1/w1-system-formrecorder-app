import { resolveMediaUrl } from '@/lib/media/payloadMedia'
import type { CarouselImage } from './types'

type PayloadLike = {
  find: (args: unknown) => Promise<{ docs?: unknown[] }>
}

type CarouselDoc = {
  slug?: unknown
  images?: Array<{
    image?: unknown
    alt?: unknown
  }>
}

export async function resolveCarouselBlockInput(
  payload: PayloadLike,
  carouselSlug: string,
  _locale: string,
): Promise<CarouselImage[]> {
  const result = await payload.find({
    collection: 'carousels',
    where: { slug: { equals: carouselSlug } },
    limit: 1,
    depth: 2,
  })

  const doc = result?.docs?.[0] as CarouselDoc | undefined
  if (!doc?.images?.length) return []

  return doc.images
    .map((item): CarouselImage | null => {
      const mediaDoc = item?.image as Record<string, unknown> | undefined
      if (!mediaDoc) return null

      const url = resolveMediaUrl(mediaDoc)
      if (!url) return null

      const alt = typeof item?.alt === 'string' ? item.alt : undefined
      return { url, alt }
    })
    .filter((img): img is CarouselImage => img !== null)
}
