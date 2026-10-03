'use client'

import { isW1CarouselAspectRatioToken } from '@werk1/w1-system-carouselblock/aspect-ratios'
import { W1CarouselSectionRenderer } from './W1CarouselSectionRenderer'
import { W1ContentSectionRenderer } from './W1ContentSectionRenderer'
import { W1ImageSectionRenderer } from './W1ImageSectionRenderer'
import { W1FlipbookSectionRenderer } from './W1FlipbookSectionRenderer'
import { defaultLanguage } from '@/config/languages'
import type { ResolvedFlipbookBlockData } from '@/lib/blocks/flipbook/types'

type DataProps = {
  data: Record<string, unknown>
}

function renderDiagnosticFallback(label: string, identifier: string | null) {
  return (
    <div
      style={{
        padding: '1rem',
        border: '1px dashed rgba(0,0,0,0.18)',
        color: '#555',
        fontSize: '0.9rem',
      }}
    >
      {label}
      {identifier ? `: ${identifier}` : ''}
    </div>
  )
}

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? value as Record<string, any> : null
}

function relationName(value: unknown): string | undefined {
  const record = asRecord(value)
  const name = record?.name ?? record?.title
  return typeof name === 'string' && name.trim() ? name : undefined
}

export function W1ContentSection({ data }: DataProps) {
  const sectionSlug = typeof data.sectionSlug === 'string' ? data.sectionSlug : null
  const sectionVariant = typeof data.sectionVariant === 'string' ? data.sectionVariant : null

  return (
    <W1ContentSectionRenderer
      sectionSlug={sectionSlug}
      sectionVariant={sectionVariant}
      fallback={renderDiagnosticFallback('Missing content section slug', sectionVariant)}
    />
  )
}

export function W1ImageSection({ data }: DataProps) {
  const url = typeof data.url === 'string' ? data.url : null
  const mediaSlug = typeof data.mediaSlug === 'string' ? data.mediaSlug : null

  if (!url) {
    return renderDiagnosticFallback('Missing image media', mediaSlug)
  }

  return <W1ImageSectionRenderer url={url} />
}

export function W1CarouselSection({ data }: DataProps) {
  const showImageTitles = data.showImageTitles === true
  const aspectRatio = isW1CarouselAspectRatioToken(data.aspectRatio) ? data.aspectRatio : 'landscape169'
  const images = Array.isArray(data.images)
    ? data.images.filter(
        (item): item is { url: string; alt?: string; id?: string; title?: string } =>
          !!item && typeof item === 'object' && typeof (item as { url?: unknown }).url === 'string',
      )
    : []
  const carouselSlug = typeof data.carouselSlug === 'string' ? data.carouselSlug : null

  if (images.length === 0) {
    return renderDiagnosticFallback('Missing carousel media', carouselSlug)
  }

  return (
    <section data-w1-section="carousel" style={{ width: '100%' }}>
      <W1CarouselSectionRenderer carouselSlug={carouselSlug} aspectRatio={aspectRatio} images={images} showImageTitles={showImageTitles} />
    </section>
  )
}





export function W1FlipbookSection({ data }: DataProps) {
  const input = data.input as ResolvedFlipbookBlockData['input'] | undefined
  const flipbookSlug = typeof data.flipbookSlug === 'string' ? data.flipbookSlug : null
  const locale = typeof data.locale === 'string' ? data.locale : defaultLanguage

  if (!input) {
    if (process.env.NODE_ENV !== 'development') return null
    return renderDiagnosticFallback('Missing or unpublished flipbook', flipbookSlug)
  }

  return (
    <section data-w1-section="flipbook" style={{ width: '100%' }}>
      <W1FlipbookSectionRenderer input={input} locale={locale} />
    </section>
  )
}



export function FallbackSection({ data }: DataProps) {
  if (process.env.NODE_ENV !== 'development') return null

  return (
    <pre
      style={{
        padding: '1rem',
        margin: 0,
        overflowX: 'auto',
        background: '#f5f5f5',
        fontSize: '0.8rem',
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}
