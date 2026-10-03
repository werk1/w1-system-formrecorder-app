import type { Media } from '@/payload-types'

type MediaRecord = Record<string, unknown>
type MediaSizeRecord = {
  url?: unknown
  mimeType?: unknown
} | null

function asRecord(value: unknown): MediaRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as MediaRecord) : null
}

function asSizeRecord(value: unknown): MediaSizeRecord {
  return asRecord(value) as MediaSizeRecord
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function resolveSizedUrl(media: MediaRecord): string | null {
  const sizes = asRecord(media.sizes)
  if (!sizes) return null

  const orderedSizes = [
    asSizeRecord(sizes.xl),
    asSizeRecord(sizes.lg),
    asSizeRecord(sizes.md),
    asSizeRecord(sizes.sm),
    asSizeRecord(sizes.thumb),
  ]

  for (const size of orderedSizes) {
    const url = readString(size?.url)
    if (url) return url
  }

  return null
}

export function toMediaRecord(media: Media | MediaRecord | undefined | null): MediaRecord | null {
  return asRecord(media)
}

export function isVideoMedia(media: MediaRecord): boolean {
  const mediaType = readString(media.mediaType)?.toLowerCase()
  if (mediaType === 'video') return true

  const mimeType = readString(media.mimeType)?.toLowerCase()
  return mimeType?.startsWith('video/') ?? false
}

export function isImageMedia(media: MediaRecord): boolean {
  const mediaType = readString(media.mediaType)?.toLowerCase()
  if (mediaType === 'image') return true

  const mimeType = readString(media.mimeType)?.toLowerCase()
  return mimeType?.startsWith('image/') ?? false
}

export function resolveMediaUrl(media: MediaRecord): string | null {
  return resolveSizedUrl(media) ?? readString(media.url)
}

type VideoOptimizationRecord = {
  status?: unknown
  variant1080?: unknown
  variant720?: unknown
  poster?: unknown
  durationMs?: unknown
}

function readVideoOptimization(media: MediaRecord): VideoOptimizationRecord | null {
  const optimization = asRecord(media.videoOptimization)
  if (!optimization || optimization.status !== 'ready') return null
  return optimization as VideoOptimizationRecord
}

/** Builds a sibling-file URL by swapping the trailing filename of media.url. */
function resolveSiblingFileUrl(media: MediaRecord, filename: string | null): string | null {
  if (!filename) return null
  const baseUrl = readString(media.url)
  if (!baseUrl) return null

  const lastSlash = baseUrl.lastIndexOf('/')
  if (lastSlash < 0) return null

  return `${baseUrl.slice(0, lastSlash + 1)}${encodeURIComponent(filename)}`
}

export function resolveVideoUrl(media: MediaRecord): string | null {
  const optimization = readVideoOptimization(media)
  const optimizedUrl = optimization
    ? resolveSiblingFileUrl(media, readString(optimization.variant1080))
    : null

  return optimizedUrl ?? readString(media.url) ?? resolveSizedUrl(media)
}

export function resolveVideoPosterUrl(media: MediaRecord): string | null {
  const optimization = readVideoOptimization(media)
  const generatedPoster = optimization
    ? resolveSiblingFileUrl(media, readString(optimization.poster))
    : null

  return (
    generatedPoster ??
    resolveSizedUrl(media) ??
    readString(media.thumbnailURL) ??
    readString(media.url)
  )
}

export type ResolvedVideoSources = {
  /** Preferred delivery source (optimized 1080 variant when available). */
  src: string | null
  /** Lower-resolution variant for small physical render sizes / data saver. */
  src720: string | null
  /** First-frame poster when generated, sized image fallback otherwise. */
  poster: string | null
  /**
   * True when the poster was generated from the video's own first frame by
   * the optimization pipeline. It is frame-accurate (same start frame; the
   * extract comes from the 1080 variant, so over 720 playback it is a
   * different encode/scale of that frame) and the carousel can use the
   * flicker-free early reveal path.
   */
  posterIsFirstFrame: boolean
  durationMs: number | null
}

export function resolveVideoSources(media: MediaRecord): ResolvedVideoSources {
  const optimization = readVideoOptimization(media)
  const generatedPoster = optimization
    ? resolveSiblingFileUrl(media, readString(optimization.poster))
    : null

  const durationMsValue = optimization?.durationMs
  const durationMs =
    typeof durationMsValue === 'number' &&
    Number.isFinite(durationMsValue) &&
    durationMsValue > 0
      ? durationMsValue
      : null

  return {
    src: resolveVideoUrl(media),
    src720: optimization
      ? resolveSiblingFileUrl(media, readString(optimization.variant720))
      : null,
    poster: generatedPoster ?? resolveVideoPosterUrl(media),
    posterIsFirstFrame: generatedPoster !== null,
    durationMs,
  }
}
