import type { W1CarouselAspectRatioToken } from '@werk1/w1-system-carouselblock/aspect-ratios'

export type CarouselImage = {
  id?: string
  url: string
  alt?: string
  title?: string
}

export type CarouselBlockInput = {
  carouselSlug: string
  aspectRatio: W1CarouselAspectRatioToken
  showImageTitles?: boolean
  images: CarouselImage[]
}
