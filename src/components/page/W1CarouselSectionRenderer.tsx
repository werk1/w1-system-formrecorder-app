'use client'

import { useBoundStore } from '@/stores/boundStore'
import { W1CarouselBlock } from '@werk1/w1-system-carouselblock'
import type { W1CarouselItem } from '@werk1/w1-system-carouselblock'
import type { W1CarouselAspectRatioToken } from '@werk1/w1-system-carouselblock/aspect-ratios'
import type { CarouselImage } from '@/lib/blocks/carousel/types'

type W1CarouselSectionRendererProps = {
  carouselSlug: string | null
  aspectRatio: W1CarouselAspectRatioToken
  showImageTitles?: boolean
  images: CarouselImage[]
}

export function W1CarouselSectionRenderer({ carouselSlug, aspectRatio, showImageTitles = false, images }: W1CarouselSectionRendererProps) {
  const deviceInfo = useBoundStore((state) => state.device)

  if (!images.length) return null

  const items: W1CarouselItem[] = images.map((img) => ({
    id: img.id,
    src: img.url,
    alt: img.alt ?? undefined,
    title: showImageTitles ? (img.title ?? undefined) : undefined,
  }))

  return (
    <section data-w1-section="carousel" data-slug={carouselSlug ?? undefined} style={{ width: '100%' }}>
      <W1CarouselBlock
        deviceInfo={deviceInfo}
        items={items}
        aspectRatio={aspectRatio}
        width="100%"
      />
    </section>
  )
}
