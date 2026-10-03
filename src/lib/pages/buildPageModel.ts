import type { LanguageCode } from '@/config/languages'
import { isW1CarouselAspectRatioToken } from '@werk1/w1-system-carouselblock/aspect-ratios'
import { normalizeRoute } from './resolveFrontendPage'
import { readSectionOverrides } from '@/lib/blocks/flipbook/resolveFlipbookBlockInput'
import type { PageModel, PageSection } from './types'

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizePayloadSections(rawSections: unknown[]): PageSection[] {
  return rawSections
    .map((rawSection): PageSection | null => {
      const section = asRecord(rawSection)
      if (!section) return null

      const type = asNonEmptyString(section.blockType) ?? asNonEmptyString(section.type)
      const key = asNonEmptyString(section.key)
      if (!type || !key) return null

      if (type === 'w1-content-section') {
        return {
          type,
          key,
          sectionVariant: asNonEmptyString(section.sectionVariant) ?? undefined,
          sectionSlug: asNonEmptyString(section.sectionSlug) ?? undefined,
        } satisfies PageSection
      }

      if (type === 'w1-image-block') {
        return {
          type,
          key,
          mediaSlug: asNonEmptyString(section.mediaSlug) ?? undefined,
        } satisfies PageSection
      }

      if (type === 'w1-carousel-block') {
        return {
          type,
          key,
          carouselSlug: asNonEmptyString(section.carouselSlug) ?? undefined,
          aspectRatio: isW1CarouselAspectRatioToken(section.aspectRatio)
            ? section.aspectRatio
            : 'landscape169',
          showImageTitles: section.showImageTitles === true ? true : undefined,
        } satisfies PageSection
      }

      if (type === 'w1-flipbook-block') {
        return {
          type,
          key,
          flipbookSlug: asNonEmptyString(section.flipbookSlug) ?? undefined,
          ...readSectionOverrides(section),
        } satisfies PageSection
      }
      return null
    })
    .filter((section): section is PageSection => section !== null)
}

function assertUniqueKeys(route: string, sections: PageSection[]) {
  const keys = sections.map((section) => section.key)
  if (new Set(keys).size !== keys.length) {
    throw new Error(`Duplicate section keys in page: ${route}`)
  }

}

export async function buildPageModel(
  payloadPageDoc: unknown,
  locale: LanguageCode,
): Promise<PageModel | null> {
  const doc = asRecord(payloadPageDoc)
  if (!doc) throw new Error('PageModel requires a page document object')

  const route = asNonEmptyString(doc.route) !== null ? normalizeRoute(asNonEmptyString(doc.route)!) : null
  if (!route) throw new Error('PageModel requires a route')

  const rawSections = Array.isArray(doc.sections) ? doc.sections : null
  if (!rawSections) return null

  const sections = normalizePayloadSections(rawSections)
  if (sections.length !== rawSections.length) {
    throw new Error(`Invalid section entries in page: ${route}`)
  }

  assertUniqueKeys(route, sections)

  return { route, locale, sections }
}
