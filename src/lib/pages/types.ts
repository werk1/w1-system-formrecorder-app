import type React from 'react'
import type { LanguageCode } from '@/config/languages'
import type { W1CarouselAspectRatioToken } from '@werk1/w1-system-carouselblock/aspect-ratios'
import type { FlipbookSectionOverrides } from '@/lib/blocks/flipbook/types'
import type { Payload } from 'payload'

export type NonArticlePageSection =
  | { type: 'w1-content-section'; key: string; sectionVariant?: string; sectionSlug?: string }
  | { type: 'w1-image-block'; key: string; mediaSlug?: string }
  | {
      type: 'w1-carousel-block'
      key: string
      carouselSlug?: string
      aspectRatio?: W1CarouselAspectRatioToken
      showImageTitles?: boolean
    }
  | ({
      type: 'w1-flipbook-block'
      key: string
      flipbookSlug?: string
    } & FlipbookSectionOverrides)


export type PageSection = NonArticlePageSection

export type PageModel = {
  route: string
  locale: LanguageCode
  sections: PageSection[]
}

export type NonArticleSectionComponent = React.ComponentType<{ data: Record<string, unknown> }>

export type ResolvedNonArticleSection = {
  type: NonArticlePageSection['type']
  key: string
  component: NonArticleSectionComponent
  data: Record<string, unknown>
}

export type ResolvedPageSection = ResolvedNonArticleSection

export type PageResolveContext = {
  payload: Payload
  locale: LanguageCode
  route: string
}

// Alias fuer Kompatibilitaet mit Resolvern aus core-v2 die HybridPageResolveContext importieren
export type HybridPageResolveContext = PageResolveContext
