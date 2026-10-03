import type { Media } from '@/payload-types'
import {
  W1CarouselSection,
  W1ContentSection,
  W1ImageSection,
  W1FlipbookSection,
  FallbackSection,
} from '@/components/page/PageSectionComponents'
import { resolveCarouselBlockInput } from '@/lib/blocks/carousel/resolveCarouselBlockInput'

import { resolveFlipbookBlockInput } from '@/lib/blocks/flipbook/resolveFlipbookBlockInput'
import { resolveMediaUrl, toMediaRecord } from '@/lib/media/payloadMedia'
import type {
  PageResolveContext,
  NonArticlePageSection,
  ResolvedNonArticleSection,
  ResolvedPageSection,
  PageModel,
} from './types'

async function loadMediaBySlug(
  slug: string,
  context: PageResolveContext,
): Promise<Record<string, unknown> | null> {
  const lookup = await context.payload.find({
    collection: 'media',
    where: {
      or: [{ slug: { equals: slug } }, { id: { equals: slug } }],
    },
    depth: 0,
    limit: 1,
    overrideAccess: false,
    locale: 'all',
  })

  return toMediaRecord(lookup.docs[0] as Media | undefined)
}

async function resolveNonArticleSectionData(
  section: NonArticlePageSection,
  context: PageResolveContext,
): Promise<Record<string, unknown>> {
  if (section.type === 'w1-content-section') {
    return {
      sectionVariant: section.sectionVariant ?? null,
      sectionSlug: section.sectionSlug ?? null,
    }
  }

  if (section.type === 'w1-carousel-block') {
    const images = await resolveCarouselBlockInput(
      context.payload as never,
      section.carouselSlug ?? '',
      context.locale,
    )
    return {
      carouselSlug: section.carouselSlug ?? null,
      aspectRatio: section.aspectRatio ?? 'landscape169',
      showImageTitles: section.showImageTitles === true,
      images,
    }
  }

  if (section.type === 'w1-flipbook-block') {
    return resolveFlipbookBlockInput(section, context)
  }


  // Sections that have mediaSlug property
  const mediaSlugTypes = ['w1-image-block', 'w1-sound-block', 'w1-video-block']
  if (!mediaSlugTypes.includes(section.type)) {
    return {}
  }

  // Extract mediaSlug from sections that have it
  const mediaSlug = (section as Extract<NonArticlePageSection,
    { type: 'w1-image-block' } | { type: 'w1-sound-block' } | { type: 'w1-video-block' }
  >).mediaSlug ?? null
  if (!mediaSlug) {
    return { mediaSlug: null }
  }

  const media = await loadMediaBySlug(mediaSlug, context)
  if (!media) {
    return { mediaSlug }
  }

  return {
    mediaSlug,
    url: resolveMediaUrl(media),
    alt: typeof media.alt === 'string' ? media.alt : '',
    mimeType: typeof media.mimeType === 'string' ? media.mimeType : null,
  }
}


async function resolveNonArticleSection(
  section: NonArticlePageSection,
  context: PageResolveContext,
): Promise<ResolvedNonArticleSection> {
  const componentMap = {
    'w1-content-section': W1ContentSection,
    'w1-image-block': W1ImageSection,
    'w1-carousel-block': W1CarouselSection,
    'w1-flipbook-block': W1FlipbookSection,
  } as const

  const data = await resolveNonArticleSectionData(section, context)

  return {
    type: section.type,
    key: section.key,
    component: componentMap[section.type] ?? FallbackSection,
    data,
  }
}

export async function resolvePageSections(
  page: PageModel,
  context: PageResolveContext,
): Promise<ResolvedPageSection[]> {
  const results = await Promise.all(
    page.sections.map(async (section): Promise<ResolvedPageSection | null> => {
      return resolveNonArticleSection(section as NonArticlePageSection, context)
    }),
  )

  return results.filter((section): section is ResolvedPageSection => section !== null)
}
