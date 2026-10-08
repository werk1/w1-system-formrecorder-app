import type { HybridPageResolveContext, NonArticlePageSection } from '@/lib/pages/types'
import { mergeConfig } from '@werk1/w1-system-flipbook/config'
import type { W1FlipbookConfig, W1FlipbookInput, W1FlipbookPage } from '@werk1/w1-system-flipbook/types'
import type { Payload } from 'payload'
import { FLIPBOOK_BOOLEAN_CONFIG_KEYS } from './config'
import { isAdminRequest, withAdminFeatures } from './viewerAccess'
import type { FlipbookSectionOverrides, ResolvedFlipbookBlockData } from './types'

type FlipbookSection = Extract<NonArticlePageSection, { type: 'w1-flipbook-block' }>

type Rec = Record<string, unknown>
const asRec = (value: unknown): Rec | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const SIZE_ORDER = [
  ['sm', 640],
  ['md', 1024],
  ['lg', 1600],
  ['xl', 2400],
] as const

const IMAGE_SIZE_PREFERENCE = ['lg', 'md', 'xl', 'sm'] as const

export function mapFlipbookPage(entry: unknown, index: number): W1FlipbookPage | null {
  const item = asRec(entry)
  const media = asRec(item?.image)
  if (!item || !media) return null

  const sizes = asRec(media.sizes)
  const sizeUrl = (name: string) => str(asRec(sizes?.[name])?.url)
  const imageUrl = IMAGE_SIZE_PREFERENCE.map(sizeUrl).find(Boolean) ?? str(media.url)
  const width = num(item.width)
  const height = num(item.height)
  if (!imageUrl || !width || !height) return null

  const candidates = SIZE_ORDER.flatMap(([name, fallbackWidth]) => {
    const url = sizeUrl(name)
    return url ? [{ url, width: num(asRec(sizes?.[name])?.width) ?? fallbackWidth }] : []
  })
  // Sizes wider than the original are omitted by Payload (e.g. `xl` of a
  // portrait page), so the original is the sharpest source when it is wider
  // than every generated size.
  const originalUrl = str(media.url)
  const originalWidth = num(media.width)
  if (originalUrl && originalWidth && candidates.every((c) => c.width < originalWidth)) {
    candidates.push({ url: originalUrl, width: originalWidth })
  }
  const srcSetParts = candidates.map((c) => `${c.url} ${c.width}w`)
  const id = typeof media.id === 'string' || typeof media.id === 'number' ? String(media.id) : `page-${index}`

  return {
    id,
    imageUrl,
    width,
    height,
    alt: str(media.alt) ?? `${index + 1}`,
    label: str(item.label) ?? undefined,
    thumbnailUrl: sizeUrl('thumb') ?? undefined,
    srcSet: srcSetParts.length > 0 ? srcSetParts.join(', ') : undefined,
  }
}

function readDefaultConfig(raw: unknown): W1FlipbookConfig {
  const source = asRec(raw)
  if (!source) return {}
  const config: W1FlipbookConfig = {}
  for (const key of ['spreadMode', 'coverMode', 'direction', 'theme', 'engine'] as const) {
    const value = str(source[key])
    if (value) (config as Rec)[key] = value
  }
  for (const key of FLIPBOOK_BOOLEAN_CONFIG_KEYS) {
    if (typeof source[key] === 'boolean') config[key] = source[key] as boolean
  }
  const startPage = num(source.startPage)
  if (startPage !== null && startPage >= 1) config.startPage = startPage - 1
  const aspectRatio = str(source.aspectRatio)
  if (aspectRatio) config.aspectRatio = aspectRatio
  const maxWidthPx = num(source.maxWidthPx)
  if (maxWidthPx !== null) config.maxWidthPx = maxWidthPx
  return config
}

const parseTriState = (value: unknown): boolean | undefined =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined

export function readSectionOverrides(section: Rec): FlipbookSectionOverrides {
  const overrides: FlipbookSectionOverrides = {}
  for (const key of ['spreadMode', 'coverMode', 'direction', 'theme', 'engine'] as const) {
    const value = str(section[key])
    if (value) (overrides as Rec)[key] = value
  }
  const startPage = num(section.startPage)
  if (startPage !== null && startPage >= 1) overrides.startPage = startPage - 1
  for (const key of ['showControls', 'showThumbnails'] as const) {
    const value = parseTriState(section[key])
    if (value !== undefined) overrides[key] = value
  }
  const aspectRatio = str(section.aspectRatio)
  if (aspectRatio) overrides.aspectRatio = aspectRatio
  const maxWidthPx = num(section.maxWidthPx)
  if (maxWidthPx !== null) overrides.maxWidthPx = maxWidthPx
  return overrides
}

/**
 * Swaps the page rows listed in `pageOverrides` (`pageIndex`, populated
 * `image`, optional `width`/`height`) into the converted pages; everything
 * else about a row (label) stays.
 */
export function applyPageOverrides(pages: unknown[], overrides: unknown): unknown[] {
  if (!Array.isArray(overrides) || overrides.length === 0) return pages
  const byIndex = new Map<number, Rec>()
  for (const entry of overrides) {
    const row = asRec(entry)
    const index = num(row?.pageIndex)
    if (row && index !== null && asRec(row.image)) byIndex.set(index, row)
  }
  return pages.map((page, index) => {
    const override = byIndex.get(index)
    const base = asRec(page)
    if (!override || !base) return page
    return { ...base, image: override.image, width: num(override.width) ?? base.width, height: num(override.height) ?? base.height }
  })
}

/**
 * Pure mapping of a `flipbooks` document (depth >= 2) to `W1FlipbookInput`.
 * Merge order: section override > flipbook `defaultConfig` > package default.
 * Returns null when there is no published revision to show.
 */
export function mapFlipbookToInput(
  doc: unknown,
  overrides: FlipbookSectionOverrides = {},
): W1FlipbookInput | null {
  const flipbook = asRec(doc)
  if (!flipbook || flipbook.isPublished !== true) return null

  // Replacements published by another module (e.g. pdfedit "PDF aktualisieren")
  // count only while they were built on the published revision.
  const overridesActive = str(flipbook.overrideRevision) !== null && flipbook.overrideRevision === flipbook.publishedRevision
  const pdfUrl = (overridesActive ? str(asRec(flipbook.pdfOverride)?.url) : null) ?? str(asRec(flipbook.publishedSourcePdf)?.url)
  const pages = applyPageOverrides(Array.isArray(flipbook.pages) ? flipbook.pages : [], overridesActive ? flipbook.pageOverrides : null)
    .map(mapFlipbookPage)
    .filter((page): page is W1FlipbookPage => page !== null)
  const slug = str(flipbook.slug)
  if (!slug || !pdfUrl || pages.length === 0) return null
  // The manifest describes one PDF: the published revision's, or, while overrides are
  // active, the one the overriding module built for exactly that `pdfOverride`.
  const overrideDoc = asRec(flipbook.pdfOverride)
  const pdfOverrideId = overrideDoc ? (overrideDoc.id != null ? String(overrideDoc.id) : null) : flipbook.pdfOverride != null ? String(flipbook.pdfOverride) : null
  const manifestUrl = overridesActive
    ? pdfOverrideId && str(flipbook.overrideManifestFor) === pdfOverrideId
      ? str(flipbook.overrideManifestUrl)
      : null
    : str(flipbook.manifestUrl)

  return {
    slug,
    title: str(flipbook.title) ?? undefined,
    pdfUrl,
    pages,
    ...(manifestUrl ? { manifestUrl } : {}),
    config: mergeConfig({ ...readDefaultConfig(flipbook.defaultConfig), ...overrides }),
  }
}

export type FlipbookMenuItem = { slug: string; title: string }

/**
 * Lightweight list of all published flipbooks for the header menu —
 * slug + localized title only.
 */
export async function listPublishedFlipbooks(
  payload: Payload,
  locale: string,
): Promise<FlipbookMenuItem[]> {
  const result = await payload.find({
    collection: 'flipbooks' as never,
    where: { and: [{ isPublished: { equals: true } }, { publishedRevision: { exists: true } }] } as never,
    sort: ['sortOrder', '-updatedAt'] as never,
    limit: 500,
    depth: 0,
    locale: locale as never,
    overrideAccess: false,
    select: { slug: true, title: true } as never,
  })
  return (result.docs as unknown as Rec[]).flatMap((doc) => {
    const slug = str(doc.slug)
    return slug ? [{ slug, title: str(doc.title) ?? slug }] : []
  })
}

export async function loadPublishedFlipbook(
  payload: Payload,
  slug: string,
  locale: string,
): Promise<unknown | null> {
  const lookup = await payload.find({
    collection: 'flipbooks' as never,
    // Slugs are stored lowercase (beforeValidate); the search route matches the same way.
    where: { and: [{ slug: { equals: slug.trim().toLowerCase() } }, { isPublished: { equals: true } }] } as never,
    depth: 2,
    limit: 1,
    overrideAccess: false,
    locale: locale as never,
    // The server-only text/image models (often > 1 MB) are hidden by field
    // access anyway; excluding them keeps them out of the database read.
    select: { textModel: false, imageModel: false } as never,
  })
  return lookup.docs[0] ?? null
}

export async function resolveFlipbookBlockInput(
  section: FlipbookSection,
  context: HybridPageResolveContext,
): Promise<Record<string, unknown>> {
  const flipbookSlug = section.flipbookSlug ?? null
  const data: ResolvedFlipbookBlockData = { flipbookSlug, locale: context.locale, input: null }
  if (!flipbookSlug) return data

  const doc = await loadPublishedFlipbook(context.payload, flipbookSlug, context.locale)
  data.input = withAdminFeatures(
    mapFlipbookToInput(doc, withSectionDefaults(readSectionOverrides(section as unknown as Rec))),
    await isAdminRequest(context.payload),
  )
  return data
}

/**
 * Embedded sections hide the thumbnail strip unless the section explicitly
 * enables it; the flipbook's `defaultConfig.showThumbnails` applies to the
 * reader route.
 */
export function withSectionDefaults(overrides: FlipbookSectionOverrides): FlipbookSectionOverrides {
  return overrides.showThumbnails === undefined ? { ...overrides, showThumbnails: false } : overrides
}

/**
 * Issue label of the flipbook for the reader's status bar ("Nr. 7/27",
 * "Ausgabe 5"), exactly as entered; undefined when the field is empty.
 */
export function issueOf(doc: unknown): string | undefined {
  return str(asRec(doc)?.issue)?.trim() || undefined
}

/** URL of the resolved cover (`coverImage`, populated) for listing and OG image. */
export function coverUrlOf(doc: unknown): string | null {
  const cover = asRec(asRec(doc)?.coverImage)
  if (!cover) return null
  const sizes = asRec(cover.sizes)
  return str(asRec(sizes?.lg)?.url) ?? str(asRec(sizes?.md)?.url) ?? str(cover.url)
}
