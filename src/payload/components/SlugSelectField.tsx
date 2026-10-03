'use client'

import { TextInput, useField, useLocale } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { TextFieldClientComponent } from 'payload'

type SlugSource = {
  collection: string
  fields?: string[]
  localeMode?: 'active' | 'all'
  mediaType?: 'image' | 'video' | 'audio'
}

type SlugSelectCustomConfig = {
  sources?: SlugSource[]
  limit?: number
  allowCustomValue?: boolean
}

type SlugOption = {
  label: string
  value: string
}

function resolveAdminText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  for (const candidate of Object.values(value as Record<string, unknown>)) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }

  return ''
}

function normalizeOptionValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function extractSlugFromDoc(doc: Record<string, unknown>, source: SlugSource): string | null {
  const fields = Array.isArray(source.fields) && source.fields.length > 0 ? source.fields : ['slug']

  for (const fieldName of fields) {
    const candidate = normalizeOptionValue(doc[fieldName])
    if (candidate) return candidate
  }

  if (source.collection === 'media') {
    const mediaId = normalizeOptionValue(doc.id)
    if (mediaId) return mediaId
  }

  return null
}

function resolveOptionLabel(
  doc: Record<string, unknown>,
  source: SlugSource,
  slugValue: string,
): string {
  if (source.collection === 'media') {
    const filename = normalizeOptionValue(doc.filename)
    if (filename) return `${filename} (${slugValue})`
  }

  return `${slugValue} (${source.collection})`
}

function resolveActiveLocale(): string {
  if (typeof window === 'undefined') return 'de'

  const fromQuery = new URLSearchParams(window.location.search).get('locale')
  return fromQuery === 'en' ? 'en' : 'de'
}

function normalizeActiveLocale(localeCode: unknown): string {
  return localeCode === 'en' ? 'en' : 'de'
}

function resolveSourceLocale(source: SlugSource, activeLocale: string): string {
  if (source.localeMode === 'all') return 'all'
  if (source.localeMode === 'active') return activeLocale

  if (source.collection === 'media') return 'all'
  if (source.collection === 'articles' || source.collection === 'article-menus') return activeLocale

  return 'all'
}

function applyActiveLocaleWhereFilter(
  query: URLSearchParams,
  source: SlugSource,
  activeLocale: string,
): void {
  const sourceLocale = resolveSourceLocale(source, activeLocale)
  if (sourceLocale !== activeLocale) return

  if (source.collection === 'articles') {
    query.set('where[metadata.language][equals]', activeLocale)
    return
  }

  if (source.collection === 'article-menus') {
    query.set('where[language][equals]', activeLocale)
  }
}

function applyMediaTypeFilter(
  query: URLSearchParams,
  source: SlugSource,
): void {
  if (source.collection !== 'media') return
  query.set('where[generatedBy][exists]', 'false')
  if (!source.mediaType) return

  query.set('where[mediaType][equals]', source.mediaType)
}

function matchesActiveLocaleForMediaSlug(slugValue: string, activeLocale: string): boolean {
  const match = slugValue.toLowerCase().match(/(?:_|-)(de|en)$/)
  if (!match) return true

  return match[1] === activeLocale
}

function normalizeMediaType(value: unknown): 'image' | 'video' | 'audio' | 'other' | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'image' || normalized === 'video' || normalized === 'audio' || normalized === 'other') {
    return normalized
  }
  return null
}

function normalizeMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function resolveMediaTypeFromDoc(doc: Record<string, unknown>): 'image' | 'video' | 'audio' | 'other' | null {
  const mediaType = normalizeMediaType(doc.mediaType)
  if (mediaType) return mediaType

  const mimeType = normalizeMimeType(doc.mimeType)
  if (!mimeType) return null
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'other'
}

function matchesRequestedMediaType(doc: Record<string, unknown>, source: SlugSource): boolean {
  if (source.collection !== 'media') return true
  if (!source.mediaType) return true

  return resolveMediaTypeFromDoc(doc) === source.mediaType
}

export const SlugSelectField: TextFieldClientComponent = ({ field, path }) => {
  const { value, setValue } = useField<string>({ path })
  const { code: adminLocaleCode } = useLocale()
  const [options, setOptions] = useState<SlugOption[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const custom = useMemo(() => (field.admin?.custom ?? {}) as SlugSelectCustomConfig, [field.admin?.custom])
  const sources = useMemo(() => custom.sources ?? [], [custom.sources])
  const allowCustomValue = useMemo(
    () => custom.allowCustomValue === true || sources.length === 0,
    [custom.allowCustomValue, sources.length],
  )
  const limit = useMemo(
    () => (Number.isFinite(custom.limit) ? Number(custom.limit) : 300),
    [custom.limit],
  )
  const activeLocale = useMemo(
    () => normalizeActiveLocale(adminLocaleCode ?? resolveActiveLocale()),
    [adminLocaleCode],
  )

  const labelText = resolveAdminText(field.label)
  const descriptionText = resolveAdminText(field.admin?.description)

  const sourceKey = useMemo(
    () => JSON.stringify({ sources, limit, activeLocale }),
    [sources, limit, activeLocale],
  )

  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      if (sources.length === 0) {
        setOptions([])
        return
      }

      setIsLoading(true)
      try {
        const resultSets = await Promise.all(
          sources.map(async (source) => {
            const query = new URLSearchParams({
              locale: resolveSourceLocale(source, activeLocale),
              depth: '0',
              limit: String(limit),
            })
            applyActiveLocaleWhereFilter(query, source, activeLocale)
            applyMediaTypeFilter(query, source)
            const response = await fetch(`/api/${source.collection}?${query.toString()}`)
            if (!response.ok) return [] as SlugOption[]

            const json = (await response.json()) as { docs?: Array<Record<string, unknown>> }
            const docs = Array.isArray(json.docs) ? json.docs : []

            return docs
              .map((doc) => {
                if (!matchesRequestedMediaType(doc, source)) return null
                const slugValue = extractSlugFromDoc(doc, source)
                if (!slugValue) return null
                if (
                  source.collection === 'media' &&
                  source.localeMode === 'active' &&
                  !matchesActiveLocaleForMediaSlug(slugValue, activeLocale)
                ) {
                  return null
                }
                return {
                  value: slugValue,
                  label: resolveOptionLabel(doc, source, slugValue),
                } satisfies SlugOption
              })
              .filter((entry): entry is SlugOption => entry !== null)
          }),
        )

        const seen = new Set<string>()
        const merged = resultSets
          .flat()
          .filter((option) => {
            if (seen.has(option.value)) return false
            seen.add(option.value)
            return true
          })
          .sort((a, b) => a.value.localeCompare(b.value))

        if (!cancelled) {
          setOptions(merged)
        }
      } catch (error) {
        console.error('Failed to load slug options', error)
        if (!cancelled) setOptions([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadOptions()

    return () => {
      cancelled = true
    }
  }, [sourceKey, sources, limit, activeLocale])

  return (
    <div>
      <TextInput
        path={path}
        label={field.label}
        required={field.required}
        value={typeof value === 'string' ? value : ''}
        readOnly={!allowCustomValue}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          if (!allowCustomValue) return
          setValue(event.target.value)
        }}
        description={field.admin?.description}
      />

      <div style={{ marginTop: 8 }}>
        <label
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 4,
            color: '#333',
          }}
        >
          {isLoading ? 'Loading slug options...' : `Select existing ${labelText || path}:`}
        </label>
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value) return
            setValue(event.target.value)
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #ccc',
            borderRadius: 4,
            fontSize: 14,
            backgroundColor: '#fff',
          }}
        >
          <option value="">-- Select slug --</option>
          {options.map((option) => (
            <option key={`${option.value}-${option.label}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {descriptionText ? (
        <p style={{ marginTop: 6, marginBottom: 0, fontSize: 12, color: '#666' }}>{descriptionText}</p>
      ) : null}
    </div>
  )
}
